-- ============================================================
-- Settlement crash-lease recovery
--
-- Gap closed: retry-settlement claims a retry by flipping
-- settlement_status 'failed' -> 'retrying', and only reverts to 'failed'
-- if its OWN setup code throws. If the edge function's process is killed
-- (not thrown — terminated, e.g. platform timeout/OOM/deploy) mid-run,
-- the row stays at 'retrying' forever. The client guard requires
-- settlement_status === 'failed' before it will call retry again, so the
-- game becomes unrecoverable without a manual DB fix.
--
-- Fix: add `updated_at` (auto-touched on every row update) so the retry
-- function can detect a 'retrying' row whose lease is stale — old
-- enough that no live process is plausibly still holding it — and
-- reclaim it back to 'failed' so the normal retry path can run again.
-- `lease_reclaimed_at` is a separate audit column so a reclaim is always
-- distinguishable from a normal claim/fail transition.
--
-- This migration never touches paid_tx_signatures or pending_payouts —
-- a reclaim UPDATE only ever sets settlement_status + lease_reclaimed_at,
-- so any signatures a crashed run already persisted survive untouched.
-- ============================================================

alter table public.games add column if not exists updated_at timestamptz not null default now();
alter table public.games add column if not exists lease_reclaimed_at timestamptz;

-- Backfill updated_at for existing rows so old games aren't treated as
-- having a lease older than they actually are.
update public.games set updated_at = created_at where updated_at is null;

-- ── auto-touch updated_at on every row update ───────────────────
-- Runs for ALL roles (including service_role) so the lease timestamp is
-- always accurate regardless of which Edge Function wrote the row.
create or replace function public.touch_games_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_games_updated_at on public.games;
create trigger trg_touch_games_updated_at
  before update on public.games
  for each row execute function public.touch_games_updated_at();

-- ── protect lease_reclaimed_at from anon/authenticated writes ──────
-- Same trigger as the rest of the settlement columns — service_role
-- (Edge Functions) and direct SQL bypass; anon/authenticated cannot
-- forge a reclaim to make a lease look older than it is.
create or replace function public.protect_game_columns()
returns trigger
language plpgsql
security definer
as $$
begin
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
     or new.paid_tx_signatures      is distinct from old.paid_tx_signatures
     or new.lease_reclaimed_at      is distinct from old.lease_reclaimed_at
  then
    raise exception 'protected game columns can only be changed via the game server (advance-phase / settle-game)';
  end if;

  return new;
end;
$$;
