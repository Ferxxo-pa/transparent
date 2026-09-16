-- ============================================================
-- Policy reconciliation — votes / question_submissions / players
--
-- Same root cause as 20260915_delete_policy_reconciliation.sql: the
-- schema-full.sql lineage (src/lib/schema-full.sql, src/lib/schema.sql)
-- creates permissive policies under short names ("votes_insert",
-- "players_insert", "question_submissions_update", "players_update").
-- The escrow hardening migration (20260701) and the DELETE reconciliation
-- only drop/replace policies under the supabase/schema.sql naming
-- ("anon can insert votes", "anon can delete players", …). On any DB
-- bootstrapped from the schema-full.sql lineage, the short-named
-- permissive policies never got dropped — Postgres ORs permissive
-- policies together, so the old wide-open policy wins regardless of how
-- restrictive the new one is.
--
-- Confirmed gaps this closes (anon role):
--   1. votes INSERT               — "votes_insert" (WITH CHECK true) survives
--      alongside the status-scoped "anon can insert votes".
--   2. question_submissions UPDATE — "question_submissions_update"
--      (USING/CHECK true) survives; anon can rewrite vote counts directly,
--      bypassing increment_question_votes().
--   3. players INSERT             — "players_insert" (WITH CHECK true)
--      survives alongside the waiting-game-scoped "anon can insert players".
--   4. players UPDATE             — "players_update" (USING/CHECK true)
--      survives. Currently no worse than hardening's own "anon can update
--      players" (also using(true)), but it will silently defeat
--      20260915_player_rls_lockdown.PROPOSED.sql's "anon cannot directly
--      update players" (using(false)) once that migration is applied,
--      since the leftover permissive policy is never touched by it.
--
-- Safe to run on any environment: every drop is `if exists`.
-- ============================================================

-- ── votes: drop legacy unscoped INSERT ──────────────────────
drop policy if exists "votes_insert" on public.votes;

-- ── question_submissions: drop legacy unscoped UPDATE ───────
-- Vote counts change only through increment_question_votes() (security
-- definer). No anon UPDATE path should remain under any name.
drop policy if exists "question_submissions_update" on public.question_submissions;

-- ── players: drop legacy unscoped INSERT ────────────────────
drop policy if exists "players_insert" on public.players;

-- ── players: drop legacy unscoped UPDATE ────────────────────
-- Not currently a new exposure (hardening's own policy is also
-- using(true)), but must be gone so it can't survive underneath the
-- proposed lockdown's using(false) replacement.
drop policy if exists "players_update" on public.players;
