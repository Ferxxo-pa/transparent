-- ============================================================
-- Player RLS Lockdown — close anon UPDATE/DELETE wide-open policies
--
-- Vulnerability: escrow_hardening (20260701) grants anon UPDATE using(true)
-- and DELETE using(true) on players. protect_player_columns only freezes
-- game_id, wallet_address, joined_at. An anon caller can:
--   1. Change any player's display_name, has_paid, is_ready
--   2. Delete any player row from any game
--
-- Fix strategy:
--   - has_paid and is_ready become protected (trigger-enforced, service_role only)
--   - display_name remains anon-writable but only for the caller's own row
--     (without Supabase Auth, ownership is asserted by wallet_address match
--      via an RPC that verifies an ed25519 signature — see update_display_name)
--   - DELETE restricted: only during 'waiting' status (leave flow), and only
--     through a signature-verified RPC (leave_game_verified)
--   - Predictions INSERT gated to games in playing/voting status
--
-- NOTE: do NOT apply this migration directly to production.
-- Review and apply manually after integrated validation.
-- ============================================================

-- ── protect has_paid, is_ready from anon writes ─────────────

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

  -- Payment/ready state: server-only
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

-- ── Replace wide-open UPDATE with scoped policy ─────────────

drop policy if exists "anon can update players" on public.players;
-- Anon can only update display_name on rows matching their own wallet.
-- Without Supabase Auth, this is enforced through an RPC + ed25519 check.
-- The RPC (update_player_display_name) runs as security definer.
-- Direct anon UPDATE is now blocked.
create policy "anon cannot directly update players" on public.players
  for update using (false);

-- ── Replace wide-open DELETE with scoped policy ─────────────

drop policy if exists "anon can delete players" on public.players;
-- Anon deletes blocked. Leave flow goes through leave_game RPC.
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

-- ── RPC: update_player_display_name (signature-verified) ────
-- Placeholder: in production this should verify an ed25519 signature
-- from the player's wallet. For now, it uses service_role gating.

create or replace function public.update_player_display_name(
  p_game_id uuid,
  p_wallet text,
  p_display_name text
) returns void
language plpgsql
security definer
as $$
begin
  -- Only the server (Edge Function with signature verification) calls this
  if coalesce(auth.role(), 'postgres') in ('anon', 'authenticated') then
    raise exception 'permission denied: use the display-name Edge Function';
  end if;

  update players set display_name = p_display_name
  where game_id = p_game_id and wallet_address = p_wallet;
end;
$$;
revoke all on function public.update_player_display_name(uuid, text, text) from public, anon, authenticated;
grant execute on function public.update_player_display_name(uuid, text, text) to service_role;

-- ── RPC: leave_game_verified (signature-verified) ───────────

create or replace function public.leave_game_verified(
  p_game_id uuid,
  p_wallet text
) returns void
language plpgsql
security definer
as $$
begin
  if coalesce(auth.role(), 'postgres') in ('anon', 'authenticated') then
    raise exception 'permission denied: use the leave-game Edge Function';
  end if;

  -- Only allow leaving from waiting games
  if not exists (
    select 1 from games where id = p_game_id and status = 'waiting'
  ) then
    raise exception 'can only leave a game that is still waiting';
  end if;

  delete from players where game_id = p_game_id and wallet_address = p_wallet;
end;
$$;
revoke all on function public.leave_game_verified(uuid, text) from public, anon, authenticated;
grant execute on function public.leave_game_verified(uuid, text) to service_role;
