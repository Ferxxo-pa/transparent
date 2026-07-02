# Transparent — Escrow Specification

Devnet only. This spec describes the money layer as implemented in
`programs/transparent/src/lib.rs` (program), `src/lib/anchor-escrow.ts` +
`src/contexts/GameContext.tsx` (client), and the `advance-phase` /
`settle-game` Edge Functions (server). Every claim below is grounded in that
code.

## 1. What the game actually is

Transparent is an **anonymous group voting / party game**. Players pool a
buy-in; the game plays out in rounds where one player is in the **hot seat**
and the others vote anonymously. Modes (`src/types/game.ts`,
`GameContext.tsx`):

- **classic** — hot-seat player answers a random spicy question; everyone
  else votes `transparent` (honest) or `fake`. Sub-modes: `all-or-nothing`,
  `chip-away`.
- **exposer** — players submit questions, vote on which gets asked
  (phases: `submitting-questions → voting-question → answering →
  voting-honesty`); optional SOL bids to boost questions.
- **storyteller** — hot-seat player secretly picks `truth`/`fake`, tells a
  story, others vote with a stake (`storyteller-prep → telling → voting →
  reveal`; per-round stake math in `calculateStorytellerRoundPayout`).
- **free-for-all** — each round randomly one of the three modes.

Rounds advance until `currentRound + 1 >= totalRounds`
(`numQuestions`, or one round per player when 0), then `status='gameover'`.

**Key architectural fact:** all game-mode logic — questions, phases, votes,
scores — lives OFF-chain (Supabase tables + client). The chain layer never
sees votes. It sees exactly three things:

1. buy-ins flowing into a pot,
2. `distribute(amount → recipient)` calls at settlement,
3. refunds.

Final payouts are computed off-chain from scores and then realized on-chain:

- `winner-takes-all` — one `distribute` of the whole pot to the winner
  chosen at game over (`distributeWinnings` in `GameContext.tsx:1004`).
- `split-pot` — `calculateSplitPayouts(scores, buyIn, totalRounds)`
  (`src/types/game.ts:31`): each round the majority votes a hot-seat player
  `fake` costs them `buyIn/totalRounds`; the penalty pool is redistributed
  proportionally to players' `transparent` votes. One `distribute` per
  player with payout > 0.

There is **no** "bet on winner / refund if you voted wrong" mechanic.

## 2. On-chain program (`programs/transparent/src/lib.rs`)

Program ID (devnet): see `declare_id!` in `lib.rs` / `PROGRAM_ID` in
`src/lib/config.ts`.

### Accounts

| PDA | Seeds | Owner | Holds |
|---|---|---|---|
| `GameState` | `["game", host, room_code]` | program | game config + status + `total_pot` counter |
| `Escrow` | `["escrow", game]` | **program** | the actual lamports (pot) on top of its own rent-exempt reserve |
| `PlayerEntry` | `["player", game, player]` | program | joined/refunded flags per player |

The escrow is a **program-owned data account**, not a `SystemAccount`. That
is the core fix: the previous design (git `9b5ed02`) declared the escrow as
`SystemAccount` and did `**escrow.try_borrow_mut_lamports()? -= x` — a
program may not debit an account it does not own, so **every payout and
refund path aborted at runtime** and buy-ins were stranded.

Deposits arrive via System-program CPI transfer (legal: the source is the
player, a System account). Withdrawals are direct lamport debit/credit,
legal only because the program owns the escrow. The escrow's rent-exempt
reserve is paid at `create_game`, is never part of `total_pot`, and
`move_from_escrow` asserts every outflow leaves
`balance − amount >= rent_minimum(data_len)` — no payout sequence can
de-rent the escrow.

### Instructions & authority

| Instruction | Who may sign | Status gate | Money effect |
|---|---|---|---|
| `create_game(room_code, buy_in, max_players, expiry_seconds, settlement_authority)` | host | — | inits game + escrow PDAs (host pays rent) |
| `join_game` | player | `Waiting`, not full, not already joined | System-transfer `buy_in` player → escrow; `total_pot += buy_in` |
| `start_game` | host only | `Waiting`, ≥2 players | none (`status = Playing`; blocks new joins) |
| `distribute(amount)` | host **or** `settlement_authority` | `Playing`/`Distributing`; `amount <= total_pot` | escrow → recipient; `total_pot -= amount`; pot 0 ⇒ `Completed` |
| `end_game` | host | — | `status = Completed` (no transfer) |
| `refund_player` | host | `Waiting` **or** `Cancelled` | escrow → player `buy_in`; entry marked refunded |
| `refund_all_expired` | **anyone** | `now > expires_at`, not `Completed` | escrow → player `buy_in` per call |
| `cancel_game` | host | `Waiting` | `status = Cancelled` |

`settlement_authority` is baked in at creation (`Pubkey::default()` =
disabled). It can only move escrow → named recipient under the same status
and pot limits as the host; it cannot mutate the game.

### State machine

```
Waiting ──start_game(host)──▶ Playing ──distribute*──▶ Distributing ──pot=0──▶ Completed
   │                              │                                       ▲
   │ cancel_game(host)            └───────────── end_game(host) ──────────┘
   ▼
Cancelled ──refund_player(host, per player)──▶ (entries refunded)

any non-Completed state, after expires_at:
   refund_all_expired(ANYONE, per player) ──▶ pot=0 ⇒ Completed
```

### Money invariants (encoded in `tests/escrow.test.ts`)

1. **Conservation**: escrow lamports = rent-exempt reserve + `total_pot`;
   `total_pot` = Σ buy-ins − Σ payouts − Σ refunds.
2. **Lock-up**: after `join_game`, funds can leave the escrow only via
   `distribute` (host/settlement-authority, game active) or a refund path.
3. **No overdraw**: `distribute(amount > total_pot)` fails
   (`InsufficientPot`); `move_from_escrow` additionally hard-asserts the
   escrow never drops below its rent-exempt reserve.
4. **Authority**: a non-host, non-settlement-authority signer can never move
   funds; only the host can start/cancel/end.
5. **Refund safety**: cancel → refund works (`Cancelled` accepted by
   `refund_player`); after `expires_at` ANYONE can trigger per-player
   refunds — host ghosting cannot strand funds.
6. **No double-dip**: `PlayerEntry.refunded` blocks double refunds;
   duplicate `join_game` rejected (`AlreadyJoined`).

## 3. Who advances phases (Blocker #4)

Previously every player's client wrote
`games.status/game_phase/current_round` directly with the anon key — any
client could jump phases or declare game over. Hardened design (all in repo):

- **DB trigger** (`supabase/migrations/20260701_escrow_hardening.sql`):
  `protect_game_columns()` rejects anon/authenticated updates to `status`,
  `game_phase`, `current_round`, `current_question_index`,
  `current_hot_seat_player`, `host_wallet`, `buy_in_lamports`, `room_code`,
  `game_pda`. Only the service role (Edge Functions) may change them.
- **Edge Function `advance-phase`**: verifies an ed25519 wallet-signed
  session token (`transparent-auth:v1:<gameId>:<wallet>:<iat>:<exp>`,
  `src/lib/gameAuth.ts` / `supabase/functions/_shared/gameAuth.ts`), then:
  - host wallet → any whitelisted transition;
  - hot-seat player → storyteller phase transitions only;
  - any player → round-advance / gameover **only if the server counts the
    current round's votes as complete** (the game intentionally lets the
    final voter trigger rollover — `castVote` in `GameContext.tsx:722`; the
    server recomputes `votes >= eligible voters` itself and never trusts
    the client's claim).
- **Client flag** `VITE_USE_EDGE_GAME_AUTH=true` routes protected updates
  through the function (`updateGameStatus` in `src/lib/supabase.ts`).

## 4. Settlement flow (hardened)

1. Game hits `gameover` condition; host client computes payouts
   (winner-takes-all or `calculateSplitPayouts`) in lamports.
2. Host calls `settle-game` Edge Function with its session token.
3. Function verifies the signature **against `games.host_wallet`**, checks
   status (not `waiting`/`gameover`) and that every recipient is a player
   in the game, then signs `distribute` per recipient with the
   `SETTLEMENT_SECRET_KEY` devnet keypair (= the game's
   `settlement_authority`). The program independently enforces status +
   `total_pot`, so a compromised function still cannot overdraw.
4. Function marks `games.status='gameover'` via service role.
5. Fallback: if the Edge call fails, the host client signs `distribute`
   itself (`distributeEscrow`) — same on-chain enforcement.

## 5. RLS (Blocker #3)

No Supabase Auth exists (identity = Privy Solana wallets), so `using(true)`
policies let any anon-key holder forge votes/pots. The migration replaces
this with: frozen game columns (trigger), append-only `votes` (insert only
into `playing`/`voting` games; unique `(game_id, round, voter_wallet)`),
immutable player identity columns, `question_submissions` counts only via
the `increment_question_votes` security-definer RPC, `predictions`
append-only with `settled` flipped only by `settle-game`. Documented
residual gap: without real auth, `players` row deletes can't be scoped to
"own row" (needed by leave flows).

Apply to a Supabase **preview branch** first; the live project backing
transparent-five stays untouched until Ez signs off.

## 6. Flags & rollout

- `VITE_USE_ESCROW` — off in production (custodial/host-held fallback code
  stays in place). Flipping it is **Ez's call** after devnet E2E is green.
- `VITE_USE_EDGE_GAME_AUTH` + RLS migration + function deploys ship as a
  unit (see REPORT.md).
- `VITE_SETTLEMENT_AUTHORITY` — pubkey of the settlement keypair.
- Mainnet gate: **external audit of the program + Ez's explicit spend
  approval**. Nothing in this repo may set `VITE_SOLANA_NETWORK=mainnet-beta`.
