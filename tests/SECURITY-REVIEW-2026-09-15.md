# Transparent Security Review — 2026-09-15 (rev 2)

Read-only review of `main` (dacc323) + security branch `security/anon-player-vulnerability-2026-09-15`.
No production policy changes applied.

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

## Medium: votes/question_submissions

Votes: INSERT gated to `playing/voting` status. UPDATE/DELETE dropped. Unique constraint prevents double-voting. **Acceptable.**

Question_submissions: UPDATE/DELETE dropped. `increment_question_votes()` is security definer. **Acceptable.**

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

## Test coverage (rev 2)

**`tests/anon-player-attack.ts`** — 7 tests, all succeed on current schema (proves vulnerabilities)

**`tests/anon-player-fixed.ts`** — 17 tests (was 12, now includes):
- Tests 1-11: original anon-block + service_role-allow + predictions
- Test 12: **Cross-player denial** — RPC with wrong wallet does not affect victim
- Test 13: **Cross-player denial** — leave RPC with wrong wallet does not remove bystander  
- Test 14: **Cross-room isolation** — RPC on game A does not affect game B player (same wallet, different game_id)
- Test 15: **Cross-room isolation** — leave RPC on game A does not remove game B player
- Test 16: Victim row integrity check
- Test 17: Active game prediction still works (positive path)

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
