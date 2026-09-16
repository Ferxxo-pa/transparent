-- ============================================================
-- Fix status mismatch in prediction/question policies
--
-- The comprehensive_legacy_alias_cleanup migration referenced
-- g.status = 'active' but the schema CHECK constraint only allows
-- ('waiting', 'playing', 'voting', 'gameover'). Result: predictions
-- INSERT always fails during gameplay, question_submissions INSERT
-- only works during waiting (the 'active' branch is dead code).
--
-- Correct mapping:
--   predictions → INSERT during 'playing' (before voting phase)
--   question_submissions → INSERT during 'waiting' or 'playing'
-- ============================================================

-- ── predictions: fix status reference ───────────────────────
drop policy if exists "anon can insert predictions" on public.predictions;

create policy "anon can insert predictions" on public.predictions
  for insert with check (
    exists (
      select 1 from public.games g
      where g.id = game_id and g.status = 'playing'
    )
  );

-- ── question_submissions: fix status reference ──────────────
drop policy if exists "anon can insert question_submissions" on public.question_submissions;

create policy "anon can insert question_submissions" on public.question_submissions
  for insert with check (
    exists (
      select 1 from public.games g
      where g.id = game_id and g.status in ('waiting', 'playing')
    )
  );
