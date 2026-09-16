-- Add 'cancelled' to games.status CHECK constraint.
-- Required by leave_game_player() RPC (host-leave sets status='cancelled').
-- Without this, host leave always fails with 23514 and the transaction
-- rolls back the player delete too — no host can ever leave.

ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_status_check;
ALTER TABLE public.games ADD CONSTRAINT games_status_check
  CHECK (status IN ('waiting', 'playing', 'voting', 'gameover', 'cancelled'));
