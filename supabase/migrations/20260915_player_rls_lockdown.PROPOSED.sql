-- ============================================================
-- Player RLS Lockdown — close anon UPDATE/DELETE wide-open policies
--
-- Vulnerability: escrow_hardening (20260701) grants anon UPDATE using(true)
-- and DELETE using(true) on players. protect_player_columns only freezes
-- game_id, wallet_address, joined_at. An anon caller can:
--   1. Change any player's display_name, has_paid, is_ready
--   2. Delete any player row from any game
--
-- Fix: all player mutations route through Edge Functions (join-game,
-- ready-up-player, leave-game) which verify ed25519 wallet signatures
-- and act with service_role. Anon UPDATE/DELETE are fully blocked.
-- INSERT requires has_paid=false AND is_ready=false to prevent forged state.
--
-- PREREQUISITE: deploy join-game, ready-up-player, leave-game Edge Functions
-- and set VITE_USE_EDGE_GAME_AUTH=true on the client BEFORE applying this
-- migration. Applying without the EFs + client migration will break
-- readyUp, leave, and join flows.
--
-- NOTE: do NOT apply this migration directly to production.
-- Review and apply manually after integrated validation.
-- ============================================================

-- ── schema prerequisites (idempotent) ───────────────────────
-- is_ready is server-managed player state; some older DBs were created from a
-- schema.sql that predates it. 'cancelled' is a terminal status set only when
-- a host leaves a waiting game (see leave_game_player below).

alter table public.players add column if not exists is_ready boolean not null default false;

alter table public.games drop constraint if exists games_status_check;
alter table public.games
  add constraint games_status_check
  check (status in ('waiting','playing','voting','gameover','cancelled'));

-- ── protect has_paid, is_ready, forfeit from anon writes ────

create or replace function public.protect_player_columns()
returns trigger
language plpgsql
security definer
as $$
begin
  if coalesce(auth.role(), 'postgres') not in ('anon', 'authenticated') then
    return new;
  end if;

  -- Identity columns: immutable
  if new.game_id is distinct from old.game_id
     or new.wallet_address is distinct from old.wallet_address
     or new.joined_at is distinct from old.joined_at
  then
    raise exception 'player identity columns are immutable';
  end if;

  -- Payment/ready state: server-only (Edge Functions act as service_role)
  if new.has_paid is distinct from old.has_paid
     or new.is_ready is distinct from old.is_ready
  then
    raise exception 'player state columns (has_paid, is_ready) can only be changed by the game server';
  end if;

  -- Forfeit columns (from grok_host migration): server-only
  if (tg_argv[0] = 'has_forfeit_cols') then
    if new.forfeited is distinct from old.forfeited
       or new.forfeit_count is distinct from old.forfeit_count
    then
      raise exception 'player forfeit columns can only be changed by the game server (advance-phase)';
    end if;
  end if;

  return new;
end;
$$;

-- ── Gate INSERT: anon cannot forge has_paid/is_ready ──────────

drop policy if exists "anon can insert players" on public.players;
create policy "anon can insert players" on public.players
  for insert with check (
    exists (
      select 1 from public.games g
      where g.id = game_id and g.status = 'waiting'
    )
    and has_paid = false
    and is_ready = false
  );

-- ── Block anon UPDATE entirely ──────────────────────────────
-- All player updates go through Edge Functions (service_role).

drop policy if exists "anon can update players" on public.players;
create policy "anon cannot directly update players" on public.players
  for update using (false);

-- ── Block anon DELETE entirely ──────────────────────────────
-- All player deletes go through leave-game Edge Function (service_role).

drop policy if exists "anon can delete players" on public.players;
create policy "anon cannot directly delete players" on public.players
  for delete using (false);

-- ── Predictions INSERT: require game in progress ────────────

drop policy if exists "predictions_insert" on public.predictions;
create policy "predictions_insert" on public.predictions
  for insert with check (
    exists (
      select 1 from public.games g
      where g.id = game_id and g.status in ('playing', 'voting')
    )
  );

-- ── Service-role RPCs (called by Edge Functions only) ────────
-- These exist as a defense-in-depth layer. Edge Functions verify wallet
-- signatures, then call these RPCs with service_role to mutate data.
-- Anon/authenticated callers are rejected at the function level.

create or replace function public.update_player_display_name(
  p_game_id uuid,
  p_wallet text,
  p_display_name text
) returns void
language plpgsql
security definer
as $$
begin
  if coalesce(auth.role(), 'postgres') in ('anon', 'authenticated') then
    raise exception 'permission denied: use the display-name Edge Function';
  end if;

  update players set display_name = p_display_name
  where game_id = p_game_id and wallet_address = p_wallet;
end;
$$;
revoke all on function public.update_player_display_name(uuid, text, text) from public, anon, authenticated;
grant execute on function public.update_player_display_name(uuid, text, text) to service_role;

-- ============================================================
-- Transactional player-lifecycle RPCs
--
-- Each RPC does its game-status guard and its mutation inside a SINGLE
-- transaction, taking a row lock on the game (SELECT ... FOR UPDATE). This
-- closes the TOCTOU window that existed when the Edge Functions read
-- game.status='waiting' in one query and mutated in another. All RPCs reject
-- anon/authenticated callers — they are reachable only by the service_role
-- client inside the verified Edge Functions.
-- ============================================================

-- assert the caller is the trusted server (service_role / direct postgres)
create or replace function public.assert_game_server()
returns void
language plpgsql
security definer
as $$
begin
  if coalesce(auth.role(), 'postgres') in ('anon', 'authenticated') then
    raise exception 'permission denied: player mutations must go through the game server';
  end if;
end;
$$;
revoke all on function public.assert_game_server() from public, anon, authenticated;
grant execute on function public.assert_game_server() to service_role;

-- ── join: insert-or-return, never resetting existing paid/ready ──
-- ON CONFLICT DO NOTHING preserves a reconnecting player's has_paid / is_ready
-- (fixes the upsert that reset them to false on replay/reconnect).
create or replace function public.join_game_player(
  p_game_id uuid,
  p_wallet text,
  p_display_name text
) returns setof public.players
language plpgsql
security definer
as $$
declare
  g public.games;
begin
  perform public.assert_game_server();

  select * into g from public.games where id = p_game_id for update;
  if not found then raise exception 'game not found' using errcode = 'P0002'; end if;
  if g.status <> 'waiting' then raise exception 'game already started' using errcode = 'P0001'; end if;

  insert into public.players (game_id, wallet_address, display_name, has_paid, is_ready)
  values (p_game_id, p_wallet, coalesce(nullif(p_display_name, ''), 'Player'), false, false)
  on conflict (game_id, wallet_address) do nothing;

  return query
    select * from public.players
    where game_id = p_game_id and wallet_address = p_wallet;
end;
$$;
revoke all on function public.join_game_player(uuid, text, text) from public, anon, authenticated;
grant execute on function public.join_game_player(uuid, text, text) to service_role;

-- ── ready-up: status + payment guard + flip, one transaction ──
create or replace function public.ready_up_player(
  p_game_id uuid,
  p_wallet text
) returns setof public.players
language plpgsql
security definer
as $$
declare
  g public.games;
  pl public.players;
begin
  perform public.assert_game_server();

  select * into g from public.games where id = p_game_id for update;
  if not found then raise exception 'game not found' using errcode = 'P0002'; end if;
  if g.status <> 'waiting' then raise exception 'game already started' using errcode = 'P0001'; end if;

  select * into pl from public.players
  where game_id = p_game_id and wallet_address = p_wallet for update;
  if not found then raise exception 'player not found in this game' using errcode = 'P0002'; end if;

  if pl.is_ready then
    return next pl;
    return;
  end if;

  if coalesce(g.buy_in_lamports, 0) > 0 and not pl.has_paid then
    raise exception 'payment required before ready-up' using errcode = 'P0003';
  end if;

  return query
    update public.players set is_ready = true
    where game_id = p_game_id and wallet_address = p_wallet
    returning *;
end;
$$;
revoke all on function public.ready_up_player(uuid, text) from public, anon, authenticated;
grant execute on function public.ready_up_player(uuid, text) to service_role;

-- ── leave: delete + (host) cancel, atomically ─────────────────
-- If the host leaves, the delete and the status='cancelled' update happen in
-- one transaction. If the cancellation fails, the delete rolls back — the
-- function never reports a partial "host left" success.
-- Returns true when the caller was the host and the game was cancelled.
create or replace function public.leave_game_player(
  p_game_id uuid,
  p_caller text,
  p_target text default null
) returns boolean
language plpgsql
security definer
as $$
declare
  g public.games;
  wallet_to_remove text;
  removed_count int;
  is_host boolean;
begin
  perform public.assert_game_server();

  select * into g from public.games where id = p_game_id for update;
  if not found then raise exception 'game not found' using errcode = 'P0002'; end if;
  if g.status <> 'waiting' then
    raise exception 'can only leave a game that is still waiting' using errcode = 'P0001';
  end if;

  wallet_to_remove := coalesce(p_target, p_caller);

  -- Removing someone else requires host authority.
  if p_target is not null and p_target <> p_caller and p_caller <> g.host_wallet then
    raise exception 'only the host can remove other players' using errcode = 'P0004';
  end if;

  delete from public.players
  where game_id = p_game_id and wallet_address = wallet_to_remove;
  get diagnostics removed_count = row_count;
  if removed_count = 0 then
    raise exception 'player not found in this game' using errcode = 'P0002';
  end if;

  is_host := (p_caller = g.host_wallet and wallet_to_remove = p_caller);
  if is_host then
    -- Any failure here (constraint, etc.) aborts the whole tx, rolling back
    -- the delete above. No partial "host left" state is ever committed.
    update public.games set status = 'cancelled' where id = p_game_id;
  end if;

  return is_host;
end;
$$;
revoke all on function public.leave_game_player(uuid, text, text) from public, anon, authenticated;
grant execute on function public.leave_game_player(uuid, text, text) to service_role;

-- ── payment authority: only place has_paid goes false → true ──
-- Called by the verify-payment Edge Function AFTER it confirms an on-chain
-- payment. Idempotent: re-confirming an already-paid player is a no-op.
-- Never sets has_paid from a client-supplied flag.
create or replace function public.mark_player_paid(
  p_game_id uuid,
  p_wallet text
) returns setof public.players
language plpgsql
security definer
as $$
declare
  g public.games;
  pl public.players;
begin
  perform public.assert_game_server();

  select * into g from public.games where id = p_game_id for update;
  if not found then raise exception 'game not found' using errcode = 'P0002'; end if;
  if g.status <> 'waiting' then raise exception 'game already started' using errcode = 'P0001'; end if;

  select * into pl from public.players
  where game_id = p_game_id and wallet_address = p_wallet for update;
  if not found then raise exception 'player not found in this game' using errcode = 'P0002'; end if;

  if pl.has_paid then
    return next pl; -- idempotent
    return;
  end if;

  return query
    update public.players set has_paid = true
    where game_id = p_game_id and wallet_address = p_wallet
    returning *;
end;
$$;
revoke all on function public.mark_player_paid(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_player_paid(uuid, text) to service_role;

-- ============================================================
-- Replay protection for destructive, signature-authorized actions
--
-- A game auth token is a cached, reusable proof of wallet identity. For
-- destructive actions (leave, kick) a replayed token must not be able to
-- repeat the action. The Edge Function records the token's signature hash
-- here (scoped to game + action); a second use hits the primary key and is
-- rejected as a replay. select/insert restricted to the service_role.
-- ============================================================

create table if not exists public.used_game_tokens (
  token_hash text primary key,
  game_id    uuid not null,
  action     text not null,
  wallet     text not null,
  used_at    timestamptz not null default now()
);

alter table public.used_game_tokens enable row level security;
-- No anon/authenticated policies → only the service_role (bypassrls) can
-- read or write this table.
revoke all on public.used_game_tokens from anon, authenticated;
grant select, insert on public.used_game_tokens to service_role;

-- ============================================================
-- Atomic payment claim + credit
--
-- Solves the non-atomic dedup + mark_player_paid window: the old handler
-- inserted a dedup record THEN called mark_player_paid. If mark_player_paid
-- failed transiently, the dedup record persisted and retry returned 409
-- "payment already credited" — but the player was never actually credited.
--
-- This RPC does both in one transaction:
--   1. INSERT dedup record (unique violation → check existing credit)
--   2. mark_player_paid (game lock, status guard, idempotent flip)
-- On same-owner replay (dedup hit + player already paid): returns the paid
-- player row, not an error. Failed attempts remain recoverable.
-- ============================================================

create or replace function public.claim_payment_and_credit(
  p_game_id    uuid,
  p_wallet     text,
  p_token_hash text
) returns setof public.players
language plpgsql
security definer
as $$
declare
  g  public.games;
  pl public.players;
  existing_wallet text;
begin
  perform public.assert_game_server();

  select * into g from public.games where id = p_game_id for update;
  if not found then raise exception 'game not found' using errcode = 'P0002'; end if;
  if g.status <> 'waiting' then raise exception 'game already started' using errcode = 'P0001'; end if;

  select * into pl from public.players
  where game_id = p_game_id and wallet_address = p_wallet for update;
  if not found then raise exception 'player not found in this game' using errcode = 'P0002'; end if;

  begin
    insert into public.used_game_tokens (token_hash, game_id, action, wallet)
    values (p_token_hash, p_game_id, 'pay', p_wallet);
  exception when unique_violation then
    select t.wallet into existing_wallet
    from public.used_game_tokens t
    where t.token_hash = p_token_hash
    for update;

    if existing_wallet <> p_wallet then
      raise exception 'payment signature already claimed by another wallet'
        using errcode = 'P0001';
    end if;

    if pl.has_paid then
      return next pl;
      return;
    end if;

    -- Same wallet, credit never landed — stale from a failed prior attempt.
    -- Re-claim atomically.
    delete from public.used_game_tokens
    where token_hash = p_token_hash;
    insert into public.used_game_tokens (token_hash, game_id, action, wallet)
    values (p_token_hash, p_game_id, 'pay', p_wallet);
  end;

  if pl.has_paid then
    return next pl;
    return;
  end if;

  return query
    update public.players set has_paid = true
    where game_id = p_game_id and wallet_address = p_wallet
    returning *;
end;
$$;
revoke all on function public.claim_payment_and_credit(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_payment_and_credit(uuid, text, text) to service_role;
