# Transparent Security Review — 2026-09-15

Read-only review of `main` (dacc323) + `feat/grok-dirty-host-2026-09-04` (a27c6f6).
No production policy changes applied.

## Critical: anon player manipulation (DB)

**Location:** `supabase/migrations/20260701_escrow_hardening.sql` L115, L118

**Vulnerability:** `protect_player_columns` trigger only freezes `game_id`, `wallet_address`, `joined_at`. The RLS policies grant `anon UPDATE using(true)` and `anon DELETE using(true)`, so any anon Supabase caller can:

1. Change any player's `display_name`, `has_paid`, `is_ready`
2. Delete any player from any game

**Proof:** `tests/anon-player-attack.ts` — 7 attacks, all succeed on current schema.

**Fix:** `supabase/migrations/20260915_player_rls_lockdown.PROPOSED.sql` + `tests/anon-player-fixed.ts`

**Verification:** Run both harnesses against disposable PG (instructions in each file).

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

## High: duplicate-payment RISK on MagicBlock fallback (client)

**Location:** `src/contexts/GameContext.tsx:1721-1724`

```typescript
try {
  await buyInViaMagicBlock(wallet, hostPubkey, buyInLamports);
} catch (mbErr) {
  console.warn('[MagicBlock] ER buy-in failed, falling back:', mbErr);
  await joinGameOnChainWithAmount(wallet, hostPubkey, buyInLamports);
}
```

If `buyInViaMagicBlock` fails with an ambiguous error (network timeout, partial success), the fallback sends a second transfer. This is a **duplicate-payment risk** — not a proven live double payment, but the code path exists and will fire on any ambiguous MagicBlock error.

**Fix needed:** Before retry, reconcile the existing transaction (query on-chain balance or tx history). If the first transfer's outcome is ambiguous, mark as `needs_reconciliation` and let the server verify before retrying. joined/paid/ready/settled must be distinct states — don't conflate them.

## Medium: votes/question_submissions

Votes: INSERT gated to `playing/voting` status. UPDATE/DELETE dropped. Unique constraint prevents double-voting. **Acceptable.**

Question_submissions: UPDATE/DELETE dropped. `increment_question_votes()` is security definer. **Acceptable.**

## Summary of proposed changes

| Item | File | Status |
|------|------|--------|
| Player UPDATE/DELETE lockdown | `20260915_player_rls_lockdown.PROPOSED.sql` | Branch pushed, not applied |
| Predictions INSERT gate | Same migration | Branch pushed, not applied |
| has_paid=false at INSERT | `GameContext.tsx:502` | Documented, fix needs code change |
| MagicBlock double-transfer | `GameContext.tsx:1721-1724` | Documented, fix needs reconciliation logic |
| display_name via RPC | New `update_player_display_name` RPC | In proposed migration |
| leave_game via RPC | New `leave_game_verified` RPC | In proposed migration |

## Deployment prerequisite: client migration before RLS lockdown

The proposed migration blocks all anon UPDATE/DELETE on players and routes through service_role RPCs (`update_player_display_name`, `leave_game_verified`). But the current client (`GameContext.tsx`) calls Supabase directly for:
- `readyUpPlayer` — anon update of `is_ready` (will break)
- `leaveGame` — anon delete (will break)
- `joinGame` — sets `has_paid: true` client-side (functional but wrong)

**Applying the RLS lockdown without migrating these client paths to Edge Function calls will break the app.** The migration sequence must be:
1. Deploy Edge Functions that call the service_role RPCs with wallet verification
2. Migrate client to call Edge Functions instead of direct Supabase
3. Apply the RLS lockdown migration

The proposed RPCs accept `p_wallet text` as a parameter and trust the Edge Function to verify wallet ownership. This is correct for service_role-gated RPCs, but the Edge Functions themselves must verify (via ed25519 signature or wallet-signed nonce) that the caller actually controls the wallet — not accept an arbitrary wallet address as a request parameter without proof.

## Owner-success + cross-player/cross-room denial tests

The `tests/anon-player-fixed.ts` harness verifies that the proposed RLS blocks unauthorized anon operations, but it does not yet exercise the positive path (owner updating own display name via RPC, owner leaving own game via RPC) or cross-room isolation (player in game A cannot affect game B). These tests require the Edge Function layer to exist first — the RPCs are service_role-only by design.

**Branch:** `security/anon-player-vulnerability-2026-09-15`
**No production changes.** Proposed migration needs client migration + Edge Function deployment + integrated validation before apply.
