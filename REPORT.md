# Escrow Hardening — Work Report

Branch: `feat/escrow-hardening` (local only, not pushed). Devnet only.
Built on top of the pre-existing uncommitted escrow-migration work (kept intact).

## 1. Escrow PDA rewrite (finish host-holds-pot → PDA migration)

**Program (`programs/transparent/src/lib.rs`):**
- Added `settlement_authority: Pubkey` to `GameState` (+32 bytes, space updated).
  `create_game` takes it as a new trailing arg; `Pubkey::default()` = disabled.
- `distribute` now accepts **host OR settlement authority** as signer (account
  renamed `host` → `authority`). The authority can only pay out from the escrow
  to recipients the caller names — it cannot mutate the game or block refunds.
- `refund_player` now allowed in `Waiting` **or** `Cancelled` state. Previously
  `cancel_game` → `refund_player` was a dead end: cancel set status to
  `Cancelled` but refunds required `Waiting`. This was a real fund-stranding bug.
- All fund paths (create/join/distribute/refund/cancel/refund-expired) route
  through the program-owned escrow PDA; the host wallet never holds the game pot.

**Client (`src/lib/anchor-escrow.ts`, `src/contexts/GameContext.tsx`):**
- **Fixed a real bug:** `distributeWinnings` derived the game PDA with the
  legacy stub `deriveGamePDA` (returns the host pubkey!) and the room *name*
  instead of the escrow derivation with the room *code*. Escrow distribution
  could never have worked. Now uses `deriveEscrowGamePDA(host, roomCode)`.
- `createGameEscrow` encodes the settlement authority
  (`VITE_SETTLEMENT_AUTHORITY`, default = disabled) into `create_game`.
- Host-leave now calls `cancelGameEscrow` on-chain before refunding players.
- Game PDA is stored in the new `games.game_pda` column at creation.
- Discriminators: **verified byte-for-byte against the freshly built IDL**
  (`target/idl/transparent.json`). Names didn't change, so all 8 hardcoded
  discriminators remain correct, including the new `create_game` shape.

## 2. RLS lockdown (`supabase/migrations/20260701_escrow_hardening.sql`)

New migration, additive (no history rewritten). Key constraint: **this app has
no Supabase Auth** — identity is Privy Solana wallets — so RLS alone cannot
know who a caller is. Strategy:
- `games`: BEFORE UPDATE trigger freezes protected columns (`status`,
  `game_phase`, `current_round`, `current_question_index`,
  `current_hot_seat_player`, `host_wallet`, `buy_in_lamports`, `room_code`,
  `game_pda`) for anon/authenticated callers. Only the service role (Edge
  Functions) may change them. Unprotected columns (pot raises, question
  options) still writable by clients.
- `players`: identity columns (`game_id`, `wallet_address`, `joined_at`)
  frozen by trigger; inserts only into games still in `waiting`.
- `votes`: append-only (no anon update/delete); inserts only into games in
  `playing`/`voting`. Double-voting already blocked by unique constraint.
- `question_submissions`: anon update policy dropped — vote counts only via
  the existing `increment_question_votes` security-definer RPC.
- `predictions`: anon update policy dropped — `settled` flips only via the
  settle-game Edge Function.
- Adds `games.game_pda text`.

**Honest limitation:** without real auth, `players` delete and generic-column
updates can't be scoped to "own row" — a malicious anon client could still
delete another player's row (needed by the leave flows). Fixing that requires
wiring Supabase Auth or routing those flows through Edge Functions too.

## 3. Host-gated phase advance (defense in depth)

Three layers:
- **DB:** protected game columns unwritable by anon (trigger above).
- **Edge (`supabase/functions/advance-phase`):** the only write path for
  phase/status/round. Verifies an ed25519 wallet signature (session token,
  see below), then enforces per-caller rules: host = any whitelisted update;
  hot-seat player = storyteller transitions only; any player = round-advance /
  gameover **only if the server-side vote count for the current round is
  complete** (the client's claim is never trusted). The last rule exists
  because the game intentionally lets the final voter trigger round rollover.
- **Client (`src/lib/gameAuth.ts`, `src/lib/supabase.ts`):** `updateGameStatus`
  routes protected-column updates through advance-phase when
  `VITE_USE_EDGE_GAME_AUTH=true`. Identity = a cached wallet-signed session
  token (`transparent-auth:v1:<gameId>:<wallet>:<iat>:<exp>`), signed once per
  game via Privy `useSignMessage` (added to `PrivyContext` + `WalletBridge` +
  `WalletAdapter`), so there's no per-action signing latency.

## 4. Settlement → Edge Function (`supabase/functions/settle-game`)

Client no longer settles unilaterally in hardened mode. Flow:
1. Host client computes payouts and calls settle-game with its session token.
2. Function verifies the signature **against the game's `host_wallet`**,
   checks game state (not `waiting`/`gameover`), and checks every payout
   recipient is a player in the game.
3. Function signs `distribute` with its own devnet keypair
   (`SETTLEMENT_SECRET_KEY` in Supabase secrets — never in the client), which
   the program accepts as the game's `settlement_authority`. The program still
   independently enforces game status + `total_pot` limits, so the function
   cannot overdraw even if compromised.
4. Marks `games.status='gameover'` with the service role.
- Hard devnet guard: refuses any RPC URL containing "mainnet".
- Client falls back to host-signed on-chain distribution if the Edge call
  fails (still enforced by the program), so settlement can't get stuck.
- `settle_predictions` action marks the prediction pot settled (predictions
  remain host-held transfers — see "Not done").

## Build status

- `anchor build`: **passes** (exit 0; warnings only — cfg lints + workspace
  resolver notice, pre-existing). IDL regenerated and verified.
- `npm run build` (vite): **passes**.
- `npm run typecheck`: 16 pre-existing `noUnusedLocals` errors in UI files I
  did not touch (baseline `main` has strictly more errors — the uncommitted
  work had already fixed several). **No type errors in any file changed by
  this branch.** I did not fix the unused-var errors because they're in UI
  components (out of scope: backend/logic only).
- Edge functions: **not typechecked** — no Deno runtime on this machine.
  Syntax follows the existing `generate-questions` function's patterns.

## Needs a real devnet deploy + testing (NOT verified)

1. **Program redeploy** — the interface changed (`create_game` arg,
   `GameState` layout, distribute authority). The program at
   `2zPLNqsyqXNxaMkzWUMh1ZcbJBR3Jr2bTky1FFaZVuF9` must be upgraded
   (`anchor deploy --provider.cluster devnet`). Until then: old program
   ignores the extra trailing arg bytes (borsh), so game creation still works,
   but settlement-authority distribution and refund-after-cancel do NOT exist
   on-chain yet. I did not deploy (no wallet/keys touched, per constraints).
2. **Migration** — apply `20260701_escrow_hardening.sql` in Supabase. I could
   not run it against the live project. Note `schema.sql` may lag the live DB
   (there are `is_ready`, `payout_mode`, etc. columns not in it); if a trigger
   references a column missing in prod, the migration will fail loudly — fix
   by adding the column first.
3. **Edge functions** — `supabase functions deploy advance-phase settle-game`,
   plus secrets: `SETTLEMENT_SECRET_KEY` (fresh devnet keypair), optional
   `SOLANA_RPC`, `ESCROW_PROGRAM_ID`.
4. **Flags** — set `VITE_SETTLEMENT_AUTHORITY` (pubkey of that keypair) and
   `VITE_USE_EDGE_GAME_AUTH=true` together with 2+3. Enabling the flag without
   deploying breaks phase updates; applying the migration without the flag
   breaks phase updates for non-hardened clients. They ship as a unit.
5. **End-to-end game flows** — create/join/vote/storyteller/settle/refund with
   real wallets on devnet. Nothing here was runtime-tested; I verified
   compilation and code-path consistency only.
6. **Privy `useSignMessage`** — typings verified against the installed SDK
   (v3.13.1), but the runtime signing flow (embedded vs external wallets) needs
   a manual check.

## Not done / out of scope

- **Prediction market pot is still host-held** (direct transfers to/from the
  host wallet, `placePrediction`/`distributePredictions`). Moving it into the
  escrow program needs new instructions (per-bet PDAs) — a separate program
  change. The DB side is hardened (append-only, settle via Edge Function).
- **`player_stats` table** untouched — client-writable leaderboard stats,
  spoofable, but no funds at risk.
- No Supabase Auth adoption (would give real per-row identity everywhere);
  the wallet-signature session token is the pragmatic substitute.
- No Vercel deploy, no pushes, no mainnet anything.
