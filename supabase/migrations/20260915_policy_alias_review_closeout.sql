-- ============================================================
-- Policy alias review closeout
--
-- Full inventory of every RLS policy across the schema.sql and
-- schema-full.sql lineages (see POLICY-ALIAS-REVIEW.md) surfaced three
-- remaining gaps not closed by the prior 20260915 migrations:
--
--   1. games INSERT — "anon can insert games" (from supabase/schema.sql)
--      is still WITH CHECK (true). The legacy "games_insert" alias under
--      that name was dropped by 20260915_comprehensive_legacy_alias_cleanup.sql,
--      but the ACTUAL live policy the client depends on was never scoped.
--      trg_protect_game_insert (20260915_server_authoritative_pot_settlement.sql)
--      already blocks forged current_pot/settlement_status/pending_payouts
--      at the trigger layer, so this is defense-in-depth, not a live
--      bypass — but leaving the RLS policy itself wide-open means a
--      future change that touches the trigger (or a table without the
--      trigger, e.g. a read replica or a differently-bootstrapped
--      environment) has no second layer of protection. Scope the policy
--      to the same invariant the trigger enforces.
--
--   2. players UPDATE — "anon can update players" (from
--      20260701_escrow_hardening.sql) is still using(true)/WITH CHECK(true).
--      Confirmed via full client audit: the only anon UPDATE call site is
--      readyUpPlayer() (is_ready), which only ever fires during
--      status='waiting', and is_ready is now trigger-protected anyway
--      (protect_player_columns). No legitimate anon UPDATE path exists
--      outside 'waiting'. Scope to match, for the same reason as (1) —
--      the trigger already blocks the sensitive columns, this closes the
--      remaining wide-open surface (arbitrary non-sensitive-column writes
--      to any player row in any game state) at the RLS layer too.
--
--   3. predictions UPDATE — "predictions_update" (schema-full.sql lineage,
--      WITH CHECK/using true) is already dropped by
--      20260701_escrow_hardening.sql in the normal migration order. Adding
--      a redundant if-exists drop here for the same reason the other
--      2026-09-15 migrations re-drop already-handled names: defense
--      against a DB that had schema-full.sql re-applied on top of an
--      already-migrated environment (accidental re-bootstrap), which would
--      resurrect this exact policy under this exact name.
--
-- Safe to run on any environment: every drop is `if exists`.
-- ============================================================

-- ── games: scope INSERT to the same invariant trg_protect_game_insert enforces ──
drop policy if exists "anon can insert games" on public.games;
create policy "anon can insert games" on public.games
  for insert with check (
    current_pot = 0
    and settlement_status = 'none'
    and pending_payouts is null
  );

-- ── players: scope UPDATE to waiting games only (no legit anon UPDATE outside it) ──
drop policy if exists "anon can update players" on public.players;
create policy "anon can update players" on public.players
  for update using (
    exists (
      select 1 from public.games g
      where g.id = game_id and g.status = 'waiting'
    )
  );

-- ── predictions: defensive re-drop of the schema-full.sql-lineage alias ──
drop policy if exists "predictions_update" on public.predictions;
