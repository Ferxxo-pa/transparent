-- ============================================================
-- Comprehensive legacy alias cleanup
--
-- schema-full.sql (src/lib/schema-full.sql) creates permissive policies
-- under short names ("games_insert", "player_stats_update", etc.).
-- Prior migrations only addressed a subset. This drops ALL remaining
-- legacy aliases that could OR-compose with scoped replacements.
--
-- SELECT policies are left alone (read-only, no security impact).
-- Safe to run on any environment: every drop is `if exists`.
-- ============================================================

-- ── games: drop legacy INSERT/UPDATE aliases ────────────────
-- games INSERT should only happen via create-game Edge Function.
-- games UPDATE is trigger-protected for key columns but the legacy
-- permissive UPDATE policy defeats any future column restriction.
drop policy if exists "games_insert" on public.games;
drop policy if exists "games_update" on public.games;
drop policy if exists "anon can update games" on public.games;

-- ── player_stats: drop legacy INSERT/UPDATE aliases ─────────
-- Stats should only be written by settlement (server-side).
-- Legacy aliases let anon forge arbitrary win/loss/earnings records.
drop policy if exists "player_stats_insert" on public.player_stats;
drop policy if exists "player_stats_update" on public.player_stats;

-- ── predictions: drop legacy INSERT alias ───────────────────
-- Only dropped by PROPOSED lockdown, not by any applied migration.
drop policy if exists "predictions_insert" on public.predictions;

-- ── question_submissions: drop legacy INSERT alias ──────────
-- Questions should be inserted via submit-question flow only.
drop policy if exists "question_submissions_insert" on public.question_submissions;
drop policy if exists "anon can insert questions" on public.question_submissions;

-- ── Recreate required policies with proper restrictions ─────

-- games: anon can still UPDATE non-protected columns (display name,
-- settings adjustable by host before game starts). The trigger already
-- blocks protected columns; this policy scopes to waiting games only.
create policy "anon can update games" on public.games for update
  using (status = 'waiting')
  with check (status = 'waiting');

-- player_stats: read-only for anon. Server writes via service_role.
-- (No INSERT/UPDATE policy recreated — stats are server-authoritative.)

-- predictions: anon can insert during active games only.
create policy "anon can insert predictions" on public.predictions
  for insert with check (
    exists (
      select 1 from public.games g
      where g.id = game_id and g.status = 'active'
    )
  );

-- question_submissions: anon can insert during waiting/active games.
create policy "anon can insert question_submissions" on public.question_submissions
  for insert with check (
    exists (
      select 1 from public.games g
      where g.id = game_id and g.status in ('waiting', 'active')
    )
  );
