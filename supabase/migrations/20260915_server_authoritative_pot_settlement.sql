-- ============================================================
-- Server-authoritative pot + payment + settlement recovery
--
-- Scope: this migration is INTENTIONALLY narrow and independent of
-- 20260915_player_rls_lockdown.PROPOSED.sql (which is a larger,
-- not-yet-applied restructuring that needs join-game/leave-game/
-- ready-up-player Edge Functions + client migration validated end to
-- end before it ships). It fixes three gaps that are safe to close
-- immediately with the same trigger-based pattern already proven by
-- 20260701_escrow_hardening.sql:
--
--   1. `current_pot` on `games` was NOT in protect_game_columns()'s
--      protected list, so any anon client could set it to a value that
--      does not match real escrow balance — distribute() would then
--      under/over-pay or fail.
--   2. `has_paid` / `is_ready` on `players` had no column-level
--      protection at all — anon could forge payment/ready state without
--      ever depositing to escrow.
--   3. Settlement (on-chain distribute) failure was invisible: the
--      client set status='gameover' unconditionally, whether or not the
--      payout actually landed. `settlement_status` + `pending_payouts`
--      make failure visible, and retry-safe (idempotent — a wallet is
--      only re-paid if it's still present in pending_payouts).
--
-- Run in Supabase SQL Editor (or `supabase db push`), independently of
-- the PROPOSED migration.
-- ============================================================

-- ── schema prerequisites (idempotent) ───────────────────────
-- These columns already exist in production (referenced by the Edge
-- Functions and client) but were never captured in supabase/schema.sql
-- or a prior migration. Adding them here, idempotently, keeps this
-- migration safe to run against any environment.

alter table public.games add column if not exists current_pot numeric not null default 0;

alter table public.games drop constraint if exists games_settlement_status_check;
alter table public.games add column if not exists settlement_status text not null default 'none';
alter table public.games
  add constraint games_settlement_status_check
  check (settlement_status in ('none', 'pending', 'settled', 'failed'));

-- Per-wallet lamports still owed when a distribute() attempt only
-- partially lands. Cleared (null) once settlement_status = 'settled'.
alter table public.games add column if not exists pending_payouts jsonb;

-- ── games: extend protect_game_columns() to cover pot + settlement ──
-- Same function as 20260701_escrow_hardening.sql — `create or replace`
-- so the existing trigger (trg_protect_game_columns) picks up the new
-- checks without needing to be recreated.

create or replace function public.protect_game_columns()
returns trigger
language plpgsql
security definer
as $$
begin
  -- service_role (Edge Functions) and direct SQL (postgres) bypass;
  -- anon / authenticated API callers are restricted.
  if coalesce(auth.role(), 'postgres') not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.status                  is distinct from old.status
     or new.game_phase              is distinct from old.game_phase
     or new.current_round           is distinct from old.current_round
     or new.current_question_index  is distinct from old.current_question_index
     or new.current_hot_seat_player is distinct from old.current_hot_seat_player
     or new.host_wallet             is distinct from old.host_wallet
     or new.buy_in_lamports         is distinct from old.buy_in_lamports
     or new.room_code               is distinct from old.room_code
     or new.game_pda                is distinct from old.game_pda
     or new.current_pot             is distinct from old.current_pot
     or new.settlement_status       is distinct from old.settlement_status
     or new.pending_payouts         is distinct from old.pending_payouts
  then
    raise exception 'protected game columns can only be changed via the game server (advance-phase / settle-game)';
  end if;

  return new;
end;
$$;

-- ── players: extend protect_player_columns() to cover payment/ready ──
-- Same function as 20260701_escrow_hardening.sql — `create or replace`
-- so the existing trigger (trg_protect_player_columns) picks up the new
-- checks without needing to be recreated. Anon UPDATE stays permissive
-- for the remaining columns (display_name etc); the trigger raises
-- before the statement commits for has_paid/is_ready, so the anon
-- "using(true)" UPDATE policy never applies to them in practice.

create or replace function public.protect_player_columns()
returns trigger
language plpgsql
security definer
as $$
begin
  if coalesce(auth.role(), 'postgres') not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.game_id is distinct from old.game_id
     or new.wallet_address is distinct from old.wallet_address
     or new.joined_at is distinct from old.joined_at
  then
    raise exception 'player identity columns are immutable';
  end if;

  if new.has_paid is distinct from old.has_paid
     or new.is_ready is distinct from old.is_ready
  then
    raise exception 'player payment/ready state can only be changed by the game server (verify-payment / ready-up-player)';
  end if;

  return new;
end;
$$;

-- ── players: close the INSERT-time forgery gap ───────────────
-- The trigger above only fires on UPDATE. Without this, anon could still
-- INSERT a brand-new row with has_paid=true / is_ready=true and skip
-- payment entirely. Gate INSERT to the same "unpaid, not ready" shape
-- join-game already produces; verify-payment / ready-up-player are the
-- only paths that can flip either flag afterward (via the UPDATE trigger
-- above).

drop policy if exists "players_insert" on public.players;
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

-- ── games: close the INSERT-time forgery gap ────────────────
-- The UPDATE trigger protects current_pot / settlement_status /
-- pending_payouts from anon writes, but INSERT bypasses triggers.
-- Legacy "games_insert" (WITH CHECK true) or any surviving permissive
-- INSERT policy lets anon create a game with current_pot=999 or
-- settlement_status='settled'. Gate INSERT to safe initial values.
-- The comprehensive_legacy_alias_cleanup migration removes the INSERT
-- policy entirely; this is defense-in-depth for environments where
-- that cleanup hasn't been applied yet.

create or replace function public.protect_game_insert()
returns trigger
language plpgsql
security definer
as $$
begin
  if coalesce(auth.role(), 'postgres') not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.current_pot is distinct from 0
     or new.settlement_status is distinct from 'none'
     or new.pending_payouts is not null
  then
    raise exception 'games must be created with current_pot=0, settlement_status=none, pending_payouts=null';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_game_insert on public.games;
create trigger trg_protect_game_insert
  before insert on public.games
  for each row execute function public.protect_game_insert();
