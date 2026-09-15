-- ============================================================
-- DELETE policy reconciliation
--
-- schema-full.sql created permissive DELETE policies under the names
-- "games_delete", "players_delete", etc. The escrow hardening migration
-- (20260701) dropped policies named "anon can delete games" — a different
-- name — so the original wide-open policies survived. This migration
-- drops ALL known permissive DELETE policy aliases on games, players,
-- votes, and question_submissions, then recreates only the ones that
-- have a legitimate use case with proper restrictions.
--
-- Safe to run on any environment: every drop is `if exists`.
-- ============================================================

-- ── games: no anon delete ──────────────────────────────────
-- Host cancel is a status change via Edge Function, not a row delete.
drop policy if exists "games_delete"           on public.games;
drop policy if exists "anon can delete games"  on public.games;

-- ── players: restrict delete to own row in waiting games ───
-- Leave/approve-leave flows need delete, but only for games still in
-- waiting state. Without real auth we can't scope to "own row" — but we
-- can at least prevent deletes during active play.
drop policy if exists "players_delete"           on public.players;
drop policy if exists "anon can delete players"  on public.players;

create policy "anon can delete players" on public.players for delete
  using (
    exists (
      select 1 from public.games g
      where g.id = game_id and g.status = 'waiting'
    )
  );

-- ── votes: no anon delete (append-only) ────────────────────
drop policy if exists "votes_delete"           on public.votes;
drop policy if exists "anon can delete votes"  on public.votes;

-- ── question_submissions: no anon delete ───────────────────
drop policy if exists "questions_delete"              on public.question_submissions;
drop policy if exists "anon can delete questions"     on public.question_submissions;
drop policy if exists "question_submissions_delete"   on public.question_submissions;
