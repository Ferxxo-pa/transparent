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
