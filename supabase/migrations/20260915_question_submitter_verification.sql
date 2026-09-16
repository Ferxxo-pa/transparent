-- ============================================================
-- Question submitter verification
--
-- Gap: question_submissions INSERT policy only checks that the
-- target game exists and is in ('waiting', 'playing') status.
-- It does NOT verify that the submitter is actually a player in
-- that game. Any anonymous client can forge a submitter_wallet
-- and inject questions into any open game.
--
-- Fix: require submitter_wallet to match an existing player row
-- in the same game.
-- ============================================================

drop policy if exists "anon can insert question_submissions" on public.question_submissions;

create policy "anon can insert question_submissions" on public.question_submissions
  for insert with check (
    exists (
      select 1 from public.games g
      where g.id = game_id and g.status in ('waiting', 'playing')
    )
    and exists (
      select 1 from public.players p
      where p.game_id = question_submissions.game_id
        and p.wallet_address = question_submissions.submitter_wallet
    )
  );
