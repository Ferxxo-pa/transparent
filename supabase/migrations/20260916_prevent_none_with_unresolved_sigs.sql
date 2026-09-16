-- ============================================================
-- Prevent resetting settlement_status to 'none' while unresolved
-- signatures exist in paid_tx_signatures.
--
-- A game with submitted/unknown sigs cannot be reset to 'none' —
-- doing so would allow settle-game to re-claim and potentially
-- double-broadcast without reconciling the prior sigs on-chain.
-- The correct recovery path is retry-settlement, which reconciles
-- first. This trigger enforces that at the DB level.
-- ============================================================

create or replace function public.guard_settlement_none_reset()
returns trigger
language plpgsql
as $$
declare
  sig_entry jsonb;
  sig_status text;
begin
  if new.settlement_status = 'none'
     and old.settlement_status is distinct from 'none'
     and new.paid_tx_signatures is not null
     and new.paid_tx_signatures != '{}'::jsonb
  then
    for sig_entry in select value from jsonb_each(new.paid_tx_signatures)
    loop
      sig_status := sig_entry->>'status';
      if sig_status in ('submitted', 'unknown') then
        raise exception 'Cannot reset settlement_status to none while unresolved signatures exist (status: %). Use retry-settlement to reconcile first.', sig_status;
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_settlement_none_reset on public.games;
create trigger trg_guard_settlement_none_reset
  before update on public.games
  for each row execute function public.guard_settlement_none_reset();
