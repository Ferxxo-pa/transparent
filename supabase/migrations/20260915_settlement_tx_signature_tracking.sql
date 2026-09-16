-- ============================================================
-- Per-recipient settlement tx signature tracking
--
-- Scope: narrow and additive, same pattern as
-- 20260915_server_authoritative_pot_settlement.sql. Independent of the
-- PROPOSED player RLS lockdown.
--
-- Gap closed: `pending_payouts` alone is not durable enough to make retry
-- safe against a partial DB write. distributeWinnings()/retrySettlement()
-- loop per recipient: send the on-chain payout, THEN write the updated
-- pending_payouts back to the row. If that write fails (network blip,
-- Supabase hiccup) after the on-chain send already landed, the DB still
-- lists that wallet as owed — a subsequent retry re-sends to a wallet that
-- was already paid.
--
-- Fix: record the confirmed tx signature for each recipient in a separate
-- column, `paid_tx_signatures`, in the SAME update statement as
-- pending_payouts. Retry logic (client-side) checks paid_tx_signatures
-- first and skips any wallet already present there, even if it is still
-- (erroneously) listed in pending_payouts. This is defense in depth: it
-- does not require the two columns to be written atomically relative to
-- the on-chain send (that's inherent to any two-system settlement), only
-- that once a signature is recorded, it is never re-paid.
-- ============================================================

-- ── schema ───────────────────────────────────────────────────

alter table public.games add column if not exists paid_tx_signatures jsonb;

-- ── protect from anon writes, same trigger as pending_payouts ────
-- create or replace so the existing trigger (trg_protect_game_columns)
-- picks up the new check without needing to be recreated.

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
     or new.paid_tx_signatures      is distinct from old.paid_tx_signatures
  then
    raise exception 'protected game columns can only be changed via the game server (advance-phase / settle-game)';
  end if;

  return new;
end;
$$;

-- ── close the INSERT-time forgery gap for the new column ────────
-- Same pattern as protect_game_insert() in the pot-settlement migration:
-- a game must never be created with a pre-populated payout record.

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
     or new.paid_tx_signatures is not null
  then
    raise exception 'games must be created with current_pot=0, settlement_status=none, pending_payouts=null, paid_tx_signatures=null';
  end if;

  return new;
end;
$$;
