# Policy Alias Review — 2026-09-15

Branch: `security/anon-player-vulnerability-2026-09-15`
Scope: full RLS policy alias inventory across `games`, `players`, `votes`,
`question_submissions`, `predictions`, `player_stats`; games INSERT
invariants; DELETE policy gaps; regression coverage for the composed
(historical + new) policy stack. Source-level review only — no writes
against a live Supabase project, no funds moved.

## Background: why aliases matter here

This app has two independent schema bootstrap lineages that were both used
in production at different times:

- `supabase/schema.sql` — long, human-readable policy names
  (`"anon can insert games"`, `"anon can insert players"`, …).
- `src/lib/schema.sql` / `src/lib/schema-full.sql` — short generated names
  (`"games_insert"`, `"players_insert"`, …) for the *same* tables and
  commands, historically also `WITH CHECK (true)`.

Postgres RLS **ORs permissive policies together**. A scoped policy added
under one name does nothing to close a gap if a wide-open policy for the
same command survives under a different name — the row is allowed if
*either* policy's check passes. Every migration from `20260701` through
today that "fixes" a table by adding a scoped policy has to also make sure
no permissive alias for that same command survives under any of its
historical names, in any lineage.

## Full policy inventory (as of this review, before this review's changes)

| Table | Command | Live scoped policy | Historical wide-open aliases | Status |
|---|---|---|---|---|
| games | SELECT | `anon can read games` (true) | `games_select` (schema-full, never existed as separate concern — read-only) | OK, read-only, not addressed |
| games | INSERT | `anon can insert games` (**WITH CHECK true — live, unscoped**) | `games_insert` (schema-full) | `games_insert` dropped in `20260915_comprehensive_legacy_alias_cleanup.sql`; **the actual live policy `anon can insert games` was never scoped** — closed by this review, see below |
| games | UPDATE | `anon can update games` (scoped to `status='waiting'`) | `games_update` (schema-full) | `games_update` dropped, `anon can update games` re-scoped in `comprehensive_legacy_alias_cleanup.sql` |
| games | DELETE | none for anon | `games_delete` (schema-full), `anon can delete games` (never created, drop-only) | closed in `20260915_delete_policy_reconciliation.sql` |
| players | SELECT | `anon can read players` (true) | `players_select` (schema-full) | read-only, not addressed |
| players | INSERT | `anon can insert players` (scoped: waiting game + `has_paid=false` + `is_ready=false`) | `players_insert` (schema-full, **WITH CHECK true — the exact bug Ez identified**) | dropped in both `20260915_policy_reconciliation.sql` and (defensively, again) `20260915_server_authoritative_pot_settlement.sql` |
| players | UPDATE | `anon can update players` (**using(true) — live, unscoped**) | `players_update` (schema-full) | `players_update` dropped in `policy_reconciliation.sql`; **`anon can update players` itself was still wide-open** — closed by this review |
| players | DELETE | `anon can delete players` (scoped: waiting game only) | `players_delete` (schema-full) | dropped/rescoped in `delete_policy_reconciliation.sql` |
| votes | SELECT | `anon can read votes` (true) | `votes_select` (schema-full) | read-only |
| votes | INSERT | `anon can insert votes` (scoped: `status in (playing, voting)`) | `votes_insert` (schema-full, true) | dropped in `policy_reconciliation.sql` |
| votes | DELETE | none | `votes_delete` (schema-full, drop-only) | closed in `delete_policy_reconciliation.sql` |
| question_submissions | SELECT | `anon can read questions` (true) | `question_submissions_select` (schema-full) | read-only |
| question_submissions | INSERT | `anon can insert question_submissions` (scoped: `status in (waiting, active)`) | `question_submissions_insert` (schema-full, true), `anon can insert questions` (schema.sql, true) | both dropped in `comprehensive_legacy_alias_cleanup.sql` |
| question_submissions | UPDATE | none for anon | `question_submissions_update` (schema-full, true) | dropped in `policy_reconciliation.sql` — no anon UPDATE path recreated (vote counts change only via `increment_question_votes()`) |
| question_submissions | DELETE | none | drop-only aliases | closed in `delete_policy_reconciliation.sql` |
| predictions | SELECT | `predictions_select` (true) | — | read-only |
| predictions | INSERT | `anon can insert predictions` (scoped: `status='active'`) | `predictions_insert` (true) | dropped/rescoped in `comprehensive_legacy_alias_cleanup.sql` |
| predictions | UPDATE | none for anon | `predictions_update` (true) | dropped in `20260701_escrow_hardening.sql`; **re-drop added defensively in this review** (see below) — protects against a DB that gets `predictions.sql`/`schema-full.sql` re-applied after already being migrated |
| player_stats | INSERT/UPDATE | none — server-authoritative | `player_stats_insert`, `player_stats_update` (true) | dropped in `comprehensive_legacy_alias_cleanup.sql`, no anon policy recreated (writes are service-role only) |

Read-only SELECT policies (`true` on all game tables) are intentionally
left permissive — this app has no auth, all game state is meant to be
publicly readable by anyone with the room code, and none of these tables
hold secrets.

## Diagnostic confirmed

Ez's repro: dropping only `players_insert` (and leaving the new scoped
`anon can insert players` in place) blocks the forged
`INSERT(has_paid=true, is_ready=true)` with a `42501`, while a legitimate
unpaid/not-ready insert still succeeds. **Confirmed correct** —
`tests/policy-reconciliation.ts` check 3/4 and
`tests/full-stack-composition.ts` check 1/2/9 all exercise exactly this,
against the full applied migration stack, not just the isolated fix.

## New findings this review closed

### 1. `games` INSERT — live policy still `WITH CHECK (true)`

`protect_game_insert()` (added in `20260915_server_authoritative_pot_settlement.sql`,
commit `371c439`) is a `BEFORE INSERT` trigger that already blocks anon
from forging `current_pot`, `settlement_status`, or `pending_payouts` at
insert time — this closes the actual exploit Ez found
(`INSERT games(current_pot=999)`). However, the RLS policy `anon can
insert games` (from `supabase/schema.sql`, the one the real client
depends on) was never scoped to match — it was still `WITH CHECK (true)`,
because only the schema-full.sql-lineage alias `games_insert` got dropped
by the comprehensive cleanup, not this one.

The trigger is sufficient on its own — triggers fire regardless of which
policy allowed the row through — but leaving the policy wide-open means
there's no second layer if the trigger is ever altered, and the alias
inventory itself flags it as a live wide-open policy on a payment-bearing
table.

**Fix:** `supabase/migrations/20260915_policy_alias_review_closeout.sql`
drops and rescopes `anon can insert games` to require
`current_pot = 0 AND settlement_status = 'none' AND pending_payouts IS
NULL` — the same invariant the trigger enforces, now enforced at both
layers. Confirmed via full client-code audit
(`src/lib/supabase.ts` `createGameInDB`) that the real client never sets
these columns on insert, so this is a no-op for legitimate traffic.

### 2. `players` UPDATE — live policy still `using(true)`

`anon can update players` (from `20260701_escrow_hardening.sql`) was
deliberately left permissive for "remaining (unprotected) columns" per
that migration's own comment. `protect_player_columns()` blocks
`has_paid`/`is_ready` regardless of policy scope, so this was not a
payment-bypass vector. But a full client-code audit found **no
legitimate anon UPDATE path exists outside `status='waiting'`** — the
only anon-initiated player UPDATE is `readyUpPlayer()` (`is_ready`),
which only ever fires during the waiting/lobby phase. Leaving the policy
unscoped means anon can still rewrite `display_name` (or any future
non-trigger-guarded column) on any player row in any game, including
finished games.

**Fix:** same migration scopes `anon can update players` to
`status = 'waiting'`, matching the pattern already used for `anon can
update games`.

### 3. `predictions` UPDATE — defensive re-drop

`predictions_update` (schema-full.sql lineage, `WITH CHECK/using true`)
is already dropped in the normal chronological migration order by
`20260701_escrow_hardening.sql`. Added a redundant `drop policy if
exists` for it in the closeout migration, matching the same
defense-in-depth pattern already used elsewhere in this review — protects
against an operator accidentally re-running `predictions.sql` (or
`schema-full.sql`) against an already-migrated database, which would
otherwise resurrect this exact policy under this exact name.

## Games INSERT invariant (item 2 of the review) — confirmed closed

`protect_game_insert()` fires `BEFORE INSERT ON games` and rejects any
anon/authenticated insert where `current_pot <> 0`,
`settlement_status <> 'none'`, or `pending_payouts IS NOT NULL`.
`service_role` (Edge Functions, direct SQL) bypasses the check, same
pattern as the existing UPDATE trigger. Verified there is no other
`games` insert call site in the client (`src/lib/supabase.ts:108-110` is
the only one, and never sets these columns) — the invariant does not
break any legitimate flow.

## DELETE policy gap — confirmed closed

`20260915_delete_policy_reconciliation.sql` (already on this branch
before this review) closes the gap Ez's repro found: `games` and `votes`
get no anon DELETE policy at all (host cancel / vote retraction go
through status changes, not row deletes); `players` DELETE is scoped to
`status='waiting'` (leave-lobby flow); `question_submissions` gets no
anon DELETE. Regression-tested in `tests/delete-policy-reconciliation.ts`
and cross-checked again in `tests/full-stack-composition.ts` checks 6/7/10.

## Non-idempotency note (informational, not fixed — out of scope)

`20260915_comprehensive_legacy_alias_cleanup.sql`'s `create policy`
statements for `anon can update games`, `anon can insert predictions`,
and `anon can insert question_submissions` don't `drop policy if exists`
their own name first, unlike every other migration in this stack. Running
that one file twice in a row (not a normal `supabase db push` scenario,
but possible via manual SQL-editor re-paste) errors with `policy already
exists` rather than being a silent no-op. Flagged for awareness; not
fixed here since it doesn't create a permissive gap (the error is loud,
not silent), and `tests/full-stack-composition.ts` documents the
workaround used to test the intended re-application scenario without
hitting this.

## Regression test coverage (all run against disposable Docker Postgres 16)

| File | What it proves | Result |
|---|---|---|
| `tests/pot-payment-attack.ts` | Pre-fix: pot/payment forgery succeeds (baseline) | N/A (attack demo) |
| `tests/pot-payment-fixed.ts` | current_pot/has_paid/is_ready/settlement_status/pending_payouts UPDATE + INSERT forgery blocked; service_role unaffected; full happy path + settlement recovery flow | **21 passed, 0 failed** |
| `tests/anon-player-attack.ts` | Pre-fix: player manipulation succeeds (baseline) | N/A (attack demo) |
| `tests/delete-policy-reconciliation.ts` | Anon DELETE blocked on games (any status) and players (non-waiting); allowed on players (waiting); service_role unaffected | **7 passed, 0 failed** (fixed missing `anon`/`auth` role+schema setup so the file runs standalone against a bare `postgres:16` container) |
| `tests/policy-reconciliation.ts` | votes/players/question_submissions legacy short-named aliases don't survive alongside new scoped policies | **5 passed, 0 failed** (same standalone-setup fix) |
| `tests/full-stack-composition.ts` **(new)** | Applies every migration in the real upgrade order, then simulates a schema-full.sql-bootstrapped environment by seeding every known legacy alias, re-applies the alias-dropping migrations, and re-verifies: anon INSERT players(has_paid/is_ready forged) blocked, anon INSERT games(current_pot/settlement_status/pending_payouts forged) blocked, anon DELETE on games/players blocked appropriately, legitimate anon INSERT/DELETE paths still work, service_role retains full access, and a direct `pg_policies` query proves no permissive non-SELECT policy with an unconditional `true` check survives on any game table | **13 passed, 0 failed** |

`tests/anon-player-fixed.ts` exercises `20260915_player_rls_lockdown.PROPOSED.sql`,
which is intentionally **not applied** to this stack (needs join-game/
leave-game/ready-up-player Edge Functions built first per its own header)
— out of scope for this review, not re-run here.

## Migrations touched by this review

- **New:** `supabase/migrations/20260915_policy_alias_review_closeout.sql`
  — scopes `anon can insert games` and `anon can update players`, defensive
  re-drop of `predictions_update`.
- **New:** `tests/full-stack-composition.ts` — full-upgrade-path composition
  regression test.
- **Modified:** `tests/delete-policy-reconciliation.ts`,
  `tests/policy-reconciliation.ts` — added missing `anon`/`authenticated`/
  `service_role` role and `auth.role()` schema/function setup so both
  files run standalone against a fresh `postgres:16` container (previously
  only passed if chained after another test file that happened to create
  these first).

## Verification commands

```bash
docker run -d --name rls-verify -e POSTGRES_PASSWORD=postgres -p 55445:5432 postgres:16
DSN=postgres://postgres:postgres@127.0.0.1:55445/postgres npx tsx tests/full-stack-composition.ts
DSN=postgres://postgres:postgres@127.0.0.1:55445/postgres npx tsx tests/pot-payment-fixed.ts        # (fresh DB between runs)
DSN=postgres://postgres:postgres@127.0.0.1:55445/postgres npx tsx tests/delete-policy-reconciliation.ts
DSN=postgres://postgres:postgres@127.0.0.1:55445/postgres npx tsx tests/policy-reconciliation.ts
```

`npx tsc --noEmit -p .` — clean (tests/ scripts are standalone Node
scripts run via `tsx`, not part of the app's `tsconfig.json` `src`
include, consistent with the existing test files in this directory).
