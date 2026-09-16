-- Add 'retrying' to games.settlement_status CHECK constraint.
-- Required by retry-settlement Edge Function (atomically claims retry by
-- setting settlement_status='failed' → 'retrying'). Without this, the
-- claim UPDATE always fails with 23514 because the CHECK only allowed
-- ('none', 'pending', 'settled', 'failed').

ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_settlement_status_check;
ALTER TABLE public.games ADD CONSTRAINT games_settlement_status_check
  CHECK (settlement_status IN ('none', 'pending', 'settled', 'failed', 'retrying'));
