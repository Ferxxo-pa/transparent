# Transparent Security Review — 2026-09-15 (rev 3)

Read-only review of `main` (dacc323) + security branch `security/anon-player-vulnerability-2026-09-15`.
No production policy changes applied.

## Rev 3 corrections (from independent Ez review of c2d3693)

1. **INSERT path ungated** — proposed migration only blocked UPDATE/DELETE. Anon could INSERT a player with `has_paid=true, is_ready=true` via the existing INSERT policy. Fixed: INSERT policy now enforces `has_paid = false AND is_ready = false`.
2. **Test role assertion failure** — `SET LOCAL` without `BEGIN` means the role reset before the action query. Tests were running as `postgres`, not `anon`. Fixed: all `as()` helpers now wrap in `BEGIN/ROLLBACK` with explicit `current_user`/`auth.role()` assertion before each action.
3. **GRANT EXECUTE ON ALL FUNCTIONS** — test setup granted anon execute on all functions including the service_role-only RPCs, undoing the privilege boundary. Fixed: test setup now grants only table access, not function execute.

## Critical: anon player manipulation (DB)

**Location:** `supabase/migrations/20260701_escrow_hardening.sql` L115, L118

**Vulnerability:** `protect_player_columns` trigger only freezes `game_id`, `wallet_address`, `joined_at`. The RLS policies grant `anon UPDATE using(true)` and `anon DELETE using(true)`, so any anon Supabase caller can:

1. Change any player's `display_name`, `has_paid`, `is_ready`
2. Delete any player from any game

**Proof:** `tests/anon-player-attack.ts` — 7 attacks, all succeed on current schema.

**Fix:** `supabase/migrations/20260915_player_rls_lockdown.PROPOSED.sql` + `tests/anon-player-fixed.ts`

## Critical: predictions INSERT unconstrained (DB)

**Location:** `supabase/migrations/predictions.sql`

Predictions INSERT policy is `WITH CHECK (true)` — no game-state guard. Any anon can insert predictions for any game including finished ones.

**Fix:** Included in proposed migration — gated to `status in ('playing', 'voting')`.

## High: has_paid=true before payment (client)

**Location:** `src/contexts/GameContext.tsx:502`

```typescript
await addPlayerToDB({
  game_id: game.id,
  wallet_address: walletAddr,
  display_name: joinerDisplayName,
  has_paid: true,  // ← set at join time, before readyUp/payment
});
```

`has_paid` is set to `true` at INSERT (join) time. Actual payment happens later during `readyUp()` (L1703-1746). If the player joins but never readies up, the DB says they paid but they didn't. If payment fails, `has_paid` remains true.

**Fix needed:** Set `has_paid: false` at INSERT. Set `has_paid: true` only after confirmed on-chain transfer, via the server/Edge Function (not client).

## High: DUPLICATE-PAYMENT RISK on MagicBlock fallback (client)

**Location:** `src/contexts/GameContext.tsx:1719-1725`

```typescript
// DUPLICATE-PAYMENT RISK: if buyInViaMagicBlock succeeds on-chain but
// throws (network timeout, ambiguous confirmation), the catch sends a
// second transfer. Reconcile the first tx before retrying.
try {
  await buyInViaMagicBlock(wallet, hostPubkey, buyInLamports);
} catch (mbErr) {
  console.warn('[MagicBlock] ER buy-in failed, falling back:', mbErr);
  await joinGameOnChainWithAmount(wallet, hostPubkey, buyInLamports);
}
```

This is a **duplicate-payment RISK**, not a proven live double payment. The code path exists and will fire on any ambiguous MagicBlock error. The catch does not distinguish between definite failure (signature rejected) and ambiguous failure (timeout, partial success).

**Fix needed:** Before retry, reconcile the existing transaction (query recent tx signatures for the wallet, check on-chain balance delta). If the first transfer's outcome is ambiguous, halt and surface a `needs_reconciliation` state instead of blindly retrying. `joined`/`paid`/`ready`/`settled` must be distinct states tracked independently.

## Critical (was "Medium — Acceptable"): votes/question_submissions policy-name mismatch

**Correction (rev 4):** the "Acceptable" verdict below assumed the hardening migration's drop/replace by name actually removed the original permissive policy. It only does so on a DB bootstrapped from `supabase/schema.sql`'s naming (`"anon can insert votes"`, `"anon can update questions"`). A DB bootstrapped from the `src/lib/schema.sql` / `src/lib/schema-full.sql` lineage instead has policies named `"votes_insert"` and `"question_submissions_update"` — names the hardening migration never references. Postgres ORs permissive policies together, so on that lineage the original wide-open policy survives underneath the new scoped one:

- **votes INSERT** — legacy `"votes_insert"` (`WITH CHECK (true)`) lets anon insert a vote for *any* game regardless of status, bypassing the `playing/voting` gate. Unique `(game_id, round, voter_wallet)` still prevents double-voting, but the status gate itself was silently defeated.
- **question_submissions UPDATE** — legacy `"question_submissions_update"` (`USING (true) WITH CHECK (true)`) lets anon rewrite `votes` (and any other column) directly, bypassing `increment_question_votes()` entirely. This was **not** "Acceptable" — it was a live vote-count forgery path.

**Fix:** `supabase/migrations/20260915_policy_reconciliation.sql` drops both legacy policies by their real names (plus the equivalent `players_insert` / `players_update` leftovers, closing the same gap on `players`). Proven by `tests/policy-reconciliation.ts` (5/5 passing).

Same root cause and same fix pattern as the DELETE-policy gap in `supabase/migrations/20260915_delete_policy_reconciliation.sql`.

## RPC ownership validation: CRITICAL GAP

**RPCs `update_player_display_name` and `leave_game_verified`** accept `p_wallet text` as a plain parameter. They are gated to `service_role` only (anon/authenticated cannot call them), which is the correct SQL-level design — the intent is that an Edge Function verifies wallet ownership via ed25519 signature, then calls the RPC.

**However:** No Edge Functions exist yet. The RPCs themselves do NOT verify that the caller controls the wallet — they trust whatever `p_wallet` value is passed. This means:

1. **Any code running as service_role** (including other Edge Functions, admin scripts, or a compromised Edge Function) can pass an arbitrary wallet and act on any player.
2. **The security model is incomplete** until the Edge Functions are deployed with proper signature verification.

**The RPCs do correctly scope by `(game_id, wallet_address)` pair**, so cross-room isolation holds at the SQL level (tested: RPC on game A cannot affect game B player with same wallet). Cross-player denial also holds (wrong wallet = 0 affected rows). But these properties are enforced by the WHERE clause, not by authenticated identity.

**Requirement:** Edge Functions must:
- Accept a signed message (wallet + nonce/timestamp) 
- Verify ed25519 signature against the claimed wallet
- Only then call the service_role RPC
- Never accept a plain wallet address as authority

## Client migration requirements (BLOCKING before RLS lockdown)

Current client calls that **will break** when anon UPDATE/DELETE is blocked:

| Consumer | Location | Current behavior | Migration needed |
|----------|----------|-----------------|-----------------|
| `readyUpPlayer()` | `src/lib/supabase.ts:166-173` | anon `.update({ is_ready: true })` | Must call Edge Function → `dh_ready_up` RPC (new) |
| `leaveGame()` | `src/contexts/GameContext.tsx:1790-1794` | anon `.delete()` | Must call Edge Function → `leave_game_verified` RPC |
| `addPlayerToDB()` | `src/lib/supabase.ts:155-163` | anon `.upsert()` with `has_paid: true` | INSERT works (waiting game), but upsert UPDATE path fails; also `has_paid` must start `false` |

**Migration sequence (order matters):**
1. Deploy Edge Functions with wallet signature verification for ready-up, leave, and display-name update
2. Add a `ready_up_player` service_role RPC (not yet in proposed migration)
3. Migrate client to call Edge Functions instead of direct Supabase
4. Test the full flow end-to-end
5. **Only then** apply the RLS lockdown migration

Applying the migration before step 3 **will break the live app**.

## Residual (documented, not fixed): advance-phase non-host gameover branch lacks column filtering

**Location:** `supabase/functions/advance-phase/index.ts` L109-133

The non-host, non-storyteller branch permits a request once `isGameover` (`status === 'gameover'`) or `isRoundAdvance` is true and the server-verified vote count is complete. Unlike the storyteller branch — which restricts `touched` to exactly `{game_phase, storyteller_choice}` — this branch never restricts which of the `UPDATABLE_COLUMNS` keys may ride along once `isGameover`/`isRoundAdvance` passes. A non-host player whose votes are complete could submit `updates` containing `status: 'gameover'` *plus* `current_pot`, `settlement_status`, or `pending_payouts` in the same payload, and all of them get written via `supabase.from('games').update(updates)` — only `status`/`current_round` are validated, not the full key set.

**Not fixed in this pass** (flagged, per scope, as the next hardening candidate). Suggested fix: mirror the storyteller branch's pattern — require `touched` to be a subset of an explicit allowlist for each transition type (e.g. `{status}` only for gameover, `{current_round, current_question_index, current_hot_seat_player}` only for round-advance) before applying the update.

## Test coverage (rev 4)

**`tests/policy-reconciliation.ts`** — 5 tests, all passing. Proves the `votes_insert` / `question_submissions_update` / `players_insert` / `players_update` legacy policy-name gaps (see "Critical: votes/question_submissions policy-name mismatch" above) are closed by `20260915_policy_reconciliation.sql`, and that the legitimate scoped players-INSERT path is untouched. Bounded scope — does not re-run the full anon-player-fixed suite.

## Test coverage (rev 3)

**`tests/anon-player-attack.ts`** — 7 tests, all succeed on current schema (proves vulnerabilities). Now uses proper `BEGIN/SET LOCAL/ROLLBACK` with role assertions (was running as postgres in rev 1-2).

**`tests/anon-player-fixed.ts`** — 23 tests (was 17), all with transaction-wrapped role assertions:
- Tests 1-4: anon UPDATE/DELETE blocked
- Tests 5-7: **NEW** — forged INSERT blocked (has_paid=true, is_ready=true, both)
- Test 8: **NEW** — legitimate join allowed (has_paid=false, is_ready=false, waiting game)
- Test 9: **NEW** — INSERT into playing game blocked
- Tests 10-11: predictions (gameover blocked, active allowed)
- Tests 12-15: service_role positive paths (display_name RPC, has_paid/is_ready, leave RPC, leave on playing refused)
- Tests 16-17: anon RPC privilege boundary (cannot call either RPC)
- Tests 18-19: cross-player denial (wrong wallet = no-op)
- Tests 20-21: cross-room isolation (game A RPC cannot affect game B)
- Test 22: **NEW** — duplicate join with same wallet blocked
- Test 23: victim row integrity check

**Test methodology fix:** `GRANT EXECUTE ON ALL FUNCTIONS` removed from test setup. Only table-level grants issued. RPC privilege boundary tests (16-17) now actually test the revocation.

**Missing test coverage** (requires Edge Functions to exist):
- Wallet signature verification (ed25519 check in Edge Function)
- End-to-end: client → Edge Function → RPC → DB with real wallet
- Payment state machine: `joined(has_paid:false)` → `paid(has_paid:true)` → `ready(is_ready:true)` → `settled`
- Ambiguous transfer reconciliation

## Summary

| Item | Status | Blocker |
|------|--------|---------|
| Player UPDATE/DELETE lockdown (SQL) | Branch ready, tested | Edge Functions + client migration |
| Predictions INSERT gate (SQL) | Branch ready, tested | None (safe to apply independently) |
| Cross-player/cross-room denial (SQL) | Tested, passes | — |
| `has_paid=true` at INSERT (client) | Documented, fix trivial | Code change in GameContext |
| DUPLICATE-PAYMENT RISK (client) | Labeled in source | Reconciliation logic needed |
| `readyUpPlayer` via RPC | RPC needed (`ready_up_player`) | Edge Function + client migration |
| Edge Function wallet verification | Not started | Design + implementation |
| Full payment state machine | Not started | Depends on all above |

**Branch:** `security/anon-player-vulnerability-2026-09-15`
**No production changes.** Full migration requires client + Edge Function + integrated validation.
