// Escrow money-invariant test suite (see ESCROW_SPEC.md).
//
// Runs the compiled program in-process with LiteSVM — no validator needed.
//
//   node tests/escrow.test.ts                 # against tests/fixtures/transparent_new.so
//   TARGET=old node tests/escrow.test.ts      # against the pre-rewrite broken program
//   PROGRAM_SO=path/x.so node tests/escrow.test.ts
//
// The suite encodes the SPEC, not the implementation: run against the old
// System-owned-escrow program it must FAIL (stranded funds, cancel→refund
// dead end, no settlement authority); against the rewrite it must pass.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { LiteSVM, FailedTransactionMetadata } from "litesvm";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("2zPLNqsyqXNxaMkzWUMh1ZcbJBR3Jr2bTky1FFaZVuF9");
const TARGET = process.env.TARGET === "old" ? "old" : "new";
const PROGRAM_SO =
  process.env.PROGRAM_SO ?? `${import.meta.dirname}/fixtures/transparent_${TARGET}.so`;

const BUY_IN = 100_000_000n; // 0.1 SOL — comfortably above rent minimums
const FEE_EPS = 20_000n; // per-tx fee tolerance for payer-side balance checks

// ── low-level helpers ────────────────────────────────────

function disc(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function u64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

function i64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(n);
  return b;
}

function str(s: string): Buffer {
  const utf8 = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(utf8.length);
  return Buffer.concat([len, utf8]);
}

interface Ctx {
  svm: LiteSVM;
  host: Keypair;
  players: Keypair[];
  authority: Keypair; // settlement authority
  outsider: Keypair; // random third party
  roomCode: string;
  game: PublicKey;
  escrow: PublicKey;
}

function pdas(host: PublicKey, roomCode: string) {
  const [game] = PublicKey.findProgramAddressSync(
    [Buffer.from("game"), host.toBytes(), Buffer.from(roomCode)],
    PROGRAM_ID,
  );
  const [escrow] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), game.toBytes()],
    PROGRAM_ID,
  );
  return { game, escrow };
}

function playerEntryPda(game: PublicKey, player: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("player"), game.toBytes(), player.toBytes()],
    PROGRAM_ID,
  )[0];
}

// litesvm 0.8.0 native bug: after any FAILED BPF transaction, constructing
// another LiteSVM in the same process aborts with std::bad_alloc (so does
// normal process teardown). Workaround: the parent process registers tests
// and spawns itself once per test (ISOLATED_CHILD=<name>); each child runs
// exactly one LiteSVM and process.exit()s before native teardown.
const KEEP: LiteSVM[] = [];

function newCtx(): Ctx {
  const svm = new LiteSVM();
  KEEP.push(svm);
  svm.addProgramFromFile(PROGRAM_ID, PROGRAM_SO);
  const host = Keypair.generate();
  const players = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
  const authority = Keypair.generate();
  const outsider = Keypair.generate();
  for (const kp of [host, ...players, authority, outsider]) {
    svm.airdrop(kp.publicKey, 10_000_000_000n);
  }
  const roomCode = "ROOM01";
  return { svm, host, players, authority, outsider, roomCode, ...pdas(host.publicKey, roomCode) };
}

type SendResult = { ok: boolean; logs: string[]; err: string };

function send(ctx: Ctx, ixs: TransactionInstruction[], signers: Keypair[]): SendResult {
  const tx = new Transaction();
  tx.add(...ixs);
  tx.recentBlockhash = ctx.svm.latestBlockhash();
  tx.feePayer = signers[0].publicKey;
  tx.sign(...signers);
  const res = ctx.svm.sendTransaction(tx);
  ctx.svm.expireBlockhash(); // avoid identical-tx replay collisions
  if (res instanceof FailedTransactionMetadata) {
    return { ok: false, logs: res.meta().logs(), err: res.err().toString() };
  }
  return { ok: true, logs: res.logs(), err: "" };
}

// ── instruction builders (account order = lib.rs structs) ─

function ixCreateGame(
  ctx: Ctx,
  opts: { buyIn?: bigint; maxPlayers?: number; expirySeconds?: bigint; authority?: PublicKey } = {},
): TransactionInstruction {
  const data = Buffer.concat([
    disc("create_game"),
    str(ctx.roomCode),
    u64le(opts.buyIn ?? BUY_IN),
    Buffer.from([opts.maxPlayers ?? 8]),
    i64le(opts.expirySeconds ?? 3600n),
    (opts.authority ?? PublicKey.default).toBuffer(),
  ]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: ctx.game, isSigner: false, isWritable: true },
      { pubkey: ctx.escrow, isSigner: false, isWritable: true },
      { pubkey: ctx.host.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function ixJoinGame(ctx: Ctx, player: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: ctx.game, isSigner: false, isWritable: true },
      { pubkey: playerEntryPda(ctx.game, player), isSigner: false, isWritable: true },
      { pubkey: ctx.escrow, isSigner: false, isWritable: true },
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: disc("join_game"),
  });
}

function ixStartGame(ctx: Ctx, host: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: ctx.game, isSigner: false, isWritable: true },
      { pubkey: host, isSigner: true, isWritable: false },
    ],
    data: disc("start_game"),
  });
}

function ixDistribute(ctx: Ctx, authority: PublicKey, recipient: PublicKey, amount: bigint) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: ctx.game, isSigner: false, isWritable: true },
      { pubkey: ctx.escrow, isSigner: false, isWritable: true },
      { pubkey: recipient, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([disc("distribute"), u64le(amount)]),
  });
}

function ixRefundPlayer(ctx: Ctx, host: PublicKey, player: PublicKey) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: ctx.game, isSigner: false, isWritable: true },
      { pubkey: playerEntryPda(ctx.game, player), isSigner: false, isWritable: true },
      { pubkey: ctx.escrow, isSigner: false, isWritable: true },
      { pubkey: player, isSigner: false, isWritable: true },
      { pubkey: host, isSigner: true, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: disc("refund_player"),
  });
}

function ixRefundExpired(ctx: Ctx, caller: PublicKey, player: PublicKey) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: ctx.game, isSigner: false, isWritable: true },
      { pubkey: playerEntryPda(ctx.game, player), isSigner: false, isWritable: true },
      { pubkey: ctx.escrow, isSigner: false, isWritable: true },
      { pubkey: player, isSigner: false, isWritable: true },
      { pubkey: caller, isSigner: true, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: disc("refund_all_expired"),
  });
}

function ixCancelGame(ctx: Ctx, host: PublicKey) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: ctx.game, isSigner: false, isWritable: true },
      { pubkey: host, isSigner: true, isWritable: false },
    ],
    data: disc("cancel_game"),
  });
}

// ── state readers ────────────────────────────────────────

const STATUS = ["Waiting", "Playing", "Distributing", "Completed", "Cancelled"] as const;

function readGame(ctx: Ctx) {
  const acc = ctx.svm.getAccount(ctx.game);
  if (!acc) throw new Error("game account missing");
  const d = Buffer.from(acc.data);
  let o = 8; // discriminator
  const host = new PublicKey(d.subarray(o, o + 32)); o += 32;
  const codeLen = d.readUInt32LE(o); o += 4;
  const roomCode = d.subarray(o, o + codeLen).toString("utf8"); o += codeLen;
  const buyIn = d.readBigUInt64LE(o); o += 8;
  const maxPlayers = d.readUInt8(o); o += 1;
  const playerCount = d.readUInt8(o); o += 1;
  const totalPot = d.readBigUInt64LE(o); o += 8;
  const status = STATUS[d.readUInt8(o)]; o += 1;
  return { host, roomCode, buyIn, maxPlayers, playerCount, totalPot, status };
}

function escrowLamports(ctx: Ctx): bigint {
  return ctx.svm.getBalance(ctx.escrow) ?? 0n;
}

/** M1 conservation: escrow lamports == its own rent reserve + total_pot,
 *  and the escrow account is owned by the program. */
function assertConservation(ctx: Ctx, label: string) {
  const acc = ctx.svm.getAccount(ctx.escrow);
  assert(acc !== null, `${label}: escrow account must exist`);
  assert(
    new PublicKey(acc!.owner).equals(PROGRAM_ID),
    `${label}: escrow must be PROGRAM-owned (got ${new PublicKey(acc!.owner).toBase58()})`,
  );
  const reserve = ctx.svm.minimumBalanceForRentExemption(BigInt(acc!.data.length));
  const pot = readGame(ctx).totalPot;
  const bal = ctx.svm.getBalance(ctx.escrow)!;
  assert(
    bal === reserve + pot,
    `${label}: conservation — escrow=${bal} != reserve(${reserve}) + total_pot(${pot})`,
  );
}

// ── tiny harness ─────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];
const registry: { name: string; fn: () => void }[] = [];

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function assertOk(r: SendResult, label: string) {
  assert(r.ok, `${label}: tx failed: ${r.err}\n    ${r.logs.slice(-6).join("\n    ")}`);
}

function assertFails(r: SendResult, needle: string, label: string) {
  assert(!r.ok, `${label}: expected failure (${needle}) but tx succeeded`);
  const hay = (r.err + "\n" + r.logs.join("\n")).toLowerCase();
  assert(
    hay.includes(needle.toLowerCase()),
    `${label}: failed for the wrong reason.\n  wanted: ${needle}\n  got: ${r.err}\n    ${r.logs.slice(-6).join("\n    ")}`,
  );
}

function test(name: string, fn: () => void) {
  if (process.env.FILTER && !process.env.FILTER.split(",").some((f) => name.includes(f))) return;
  registry.push({ name, fn });
}

function runOne(t: { name: string; fn: () => void }) {
  try {
    t.fn();
    passed++;
    console.log(`  ✓ ${t.name}`);
  } catch (e) {
    failed++;
    failures.push(`${t.name}\n    ${(e as Error).message}`);
    console.log(`  ✗ ${t.name}\n      ${(e as Error).message.split("\n")[0]}`);
  }
}

// game with N joined players, optional settlement authority
function setupJoined(n: number, opts: Parameters<typeof ixCreateGame>[1] = {}): Ctx {
  const ctx = newCtx();
  assertOk(send(ctx, [ixCreateGame(ctx, opts)], [ctx.host]), "create_game");
  for (let i = 0; i < n; i++) {
    assertOk(send(ctx, [ixJoinGame(ctx, ctx.players[i].publicKey)], [ctx.players[i]]), `join p${i}`);
  }
  return ctx;
}

function warpPastExpiry(ctx: Ctx, seconds: bigint) {
  const clock = ctx.svm.getClock();
  clock.unixTimestamp = clock.unixTimestamp + seconds;
  ctx.svm.setClock(clock);
}

// ── tests ────────────────────────────────────────────────

if (!process.env.ISOLATED_CHILD) {
  console.log(`\nEscrow spec suite — TARGET=${TARGET} (${PROGRAM_SO})\n`);
}

// A. creation & deposits
test("A1 create_game inits a program-owned, rent-exempt escrow; pot=0 (M1)", () => {
  const ctx = newCtx();
  assertOk(send(ctx, [ixCreateGame(ctx)], [ctx.host]), "create_game");
  const g = readGame(ctx);
  assert(g.status === "Waiting", `status Waiting, got ${g.status}`);
  assert(g.totalPot === 0n, `pot 0, got ${g.totalPot}`);
  assertConservation(ctx, "A1");
});

test("A2 join_game locks each buy-in in the escrow PDA (M1, M2)", () => {
  const ctx = setupJoined(3);
  const g = readGame(ctx);
  assert(g.playerCount === 3, `playerCount 3, got ${g.playerCount}`);
  assert(g.totalPot === 3n * BUY_IN, `pot ${3n * BUY_IN}, got ${g.totalPot}`);
  assert(escrowLamports(ctx) >= 3n * BUY_IN, "escrow holds at least the 3 buy-ins");
  assertConservation(ctx, "A2");
});

test("A3 duplicate join rejected (M5)", () => {
  const ctx = setupJoined(1);
  assertFails(
    send(ctx, [ixJoinGame(ctx, ctx.players[0].publicKey)], [ctx.players[0]]),
    "AlreadyJoined",
    "A3",
  );
  assertConservation(ctx, "A3 post");
});

test("A4 join after start rejected", () => {
  const ctx = setupJoined(2);
  assertOk(send(ctx, [ixStartGame(ctx, ctx.host.publicKey)], [ctx.host]), "start");
  assertFails(
    send(ctx, [ixJoinGame(ctx, ctx.players[2].publicKey)], [ctx.players[2]]),
    "GameNotWaiting",
    "A4",
  );
});

test("A5 join when full rejected", () => {
  const ctx = setupJoined(2, { maxPlayers: 2 });
  assertFails(
    send(ctx, [ixJoinGame(ctx, ctx.players[2].publicKey)], [ctx.players[2]]),
    "GameFull",
    "A5",
  );
});

// B. settlement
test("B1 host settles: winner-takes-all payout empties pot, game Completed (M1, M3)", () => {
  const ctx = setupJoined(3);
  assertOk(send(ctx, [ixStartGame(ctx, ctx.host.publicKey)], [ctx.host]), "start");
  const winner = ctx.players[1].publicKey;
  const before = ctx.svm.getBalance(winner)!;
  assertOk(
    send(ctx, [ixDistribute(ctx, ctx.host.publicKey, winner, 3n * BUY_IN)], [ctx.host]),
    "distribute",
  );
  assert(ctx.svm.getBalance(winner)! === before + 3n * BUY_IN, "winner received full pot");
  const g = readGame(ctx);
  assert(g.totalPot === 0n, "pot drained");
  assert(g.status === "Completed", `Completed, got ${g.status}`);
  assertConservation(ctx, "B1");
});

test("B2 split-pot: multiple distributes, conservation after each (M1, M3)", () => {
  const ctx = setupJoined(2);
  assertOk(send(ctx, [ixStartGame(ctx, ctx.host.publicKey)], [ctx.host]), "start");
  assertOk(
    send(ctx, [ixDistribute(ctx, ctx.host.publicKey, ctx.players[0].publicKey, BUY_IN / 2n)], [ctx.host]),
    "distribute 1",
  );
  assertConservation(ctx, "B2 mid");
  assert(readGame(ctx).status === "Distributing", "Distributing after partial payout");
  assertOk(
    send(ctx, [ixDistribute(ctx, ctx.host.publicKey, ctx.players[1].publicKey, 2n * BUY_IN - BUY_IN / 2n)], [ctx.host]),
    "distribute 2",
  );
  const g = readGame(ctx);
  assert(g.totalPot === 0n && g.status === "Completed", "pot empty → Completed");
  assertConservation(ctx, "B2 end");
});

test("B3 settlement authority may distribute (server settle path)", () => {
  const ctx2 = newCtx();
  assertOk(
    send(ctx2, [ixCreateGame(ctx2, { authority: ctx2.authority.publicKey })], [ctx2.host]),
    "create",
  );
  for (const p of ctx2.players.slice(0, 2)) {
    assertOk(send(ctx2, [ixJoinGame(ctx2, p.publicKey)], [p]), "join");
  }
  assertOk(send(ctx2, [ixStartGame(ctx2, ctx2.host.publicKey)], [ctx2.host]), "start");
  const winner = ctx2.players[0].publicKey;
  const before = ctx2.svm.getBalance(winner)!;
  assertOk(
    send(ctx2, [ixDistribute(ctx2, ctx2.authority.publicKey, winner, 2n * BUY_IN)], [ctx2.authority]),
    "authority distribute",
  );
  assert(ctx2.svm.getBalance(winner)! === before + 2n * BUY_IN, "winner paid by authority");
  assertConservation(ctx2, "B3");
});

test("B4 random signer cannot distribute (M2, M3)", () => {
  const ctx = setupJoined(2);
  assertOk(send(ctx, [ixStartGame(ctx, ctx.host.publicKey)], [ctx.host]), "start");
  assertFails(
    send(ctx, [ixDistribute(ctx, ctx.outsider.publicKey, ctx.outsider.publicKey, BUY_IN)], [ctx.outsider]),
    "NotHost",
    "B4",
  );
  assertConservation(ctx, "B4 post");
});

test("B5 unnamed settlement authority (default) cannot distribute", () => {
  const ctx = setupJoined(2); // authority = Pubkey::default() = disabled
  assertOk(send(ctx, [ixStartGame(ctx, ctx.host.publicKey)], [ctx.host]), "start");
  assertFails(
    send(ctx, [ixDistribute(ctx, ctx.authority.publicKey, ctx.authority.publicKey, BUY_IN)], [ctx.authority]),
    "NotHost",
    "B5",
  );
});

test("B6 over-distribution rejected (M3)", () => {
  const ctx = setupJoined(2);
  assertOk(send(ctx, [ixStartGame(ctx, ctx.host.publicKey)], [ctx.host]), "start");
  assertFails(
    send(ctx, [ixDistribute(ctx, ctx.host.publicKey, ctx.players[0].publicKey, 2n * BUY_IN + 1n)], [ctx.host]),
    "InsufficientPot",
    "B6",
  );
  assertConservation(ctx, "B6 post");
});

test("B7 distribute before start rejected (M3: payouts only after game starts)", () => {
  const ctx = setupJoined(2);
  assertFails(
    send(ctx, [ixDistribute(ctx, ctx.host.publicKey, ctx.players[0].publicKey, BUY_IN)], [ctx.host]),
    "GameNotActive",
    "B7",
  );
});

test("B8 full payout leaves escrow exactly at rent reserve — never de-rented (M6)", () => {
  const ctx = setupJoined(2);
  assertOk(send(ctx, [ixStartGame(ctx, ctx.host.publicKey)], [ctx.host]), "start");
  assertOk(
    send(ctx, [ixDistribute(ctx, ctx.host.publicKey, ctx.players[0].publicKey, 2n * BUY_IN)], [ctx.host]),
    "distribute all",
  );
  const acc = ctx.svm.getAccount(ctx.escrow)!;
  const reserve = ctx.svm.minimumBalanceForRentExemption(BigInt(acc.data.length));
  assert(
    escrowLamports(ctx) === reserve,
    `escrow at exact reserve: ${escrowLamports(ctx)} vs ${reserve}`,
  );
});

// C. refunds
test("C1 host refund while Waiting returns the buy-in (M4a)", () => {
  const ctx = setupJoined(2);
  const p = ctx.players[0].publicKey;
  const before = ctx.svm.getBalance(p)!;
  assertOk(send(ctx, [ixRefundPlayer(ctx, ctx.host.publicKey, p)], [ctx.host]), "refund");
  assert(ctx.svm.getBalance(p)! === before + BUY_IN, "player got buy-in back");
  const g = readGame(ctx);
  assert(g.playerCount === 1 && g.totalPot === BUY_IN, "count/pot decremented");
  assertConservation(ctx, "C1");
});

test("C2 cancel → refund every player works (M4b — the old dead-end)", () => {
  const ctx = setupJoined(2);
  assertOk(send(ctx, [ixCancelGame(ctx, ctx.host.publicKey)], [ctx.host]), "cancel");
  assert(readGame(ctx).status === "Cancelled", "Cancelled");
  for (const p of ctx.players.slice(0, 2)) {
    const before = ctx.svm.getBalance(p.publicKey)!;
    assertOk(
      send(ctx, [ixRefundPlayer(ctx, ctx.host.publicKey, p.publicKey)], [ctx.host]),
      "refund after cancel",
    );
    assert(ctx.svm.getBalance(p.publicKey)! === before + BUY_IN, "refund landed");
  }
  assert(readGame(ctx).totalPot === 0n, "pot empty after all refunds");
  assertConservation(ctx, "C2");
});

test("C3 double refund rejected (M5)", () => {
  const ctx = setupJoined(2);
  const p = ctx.players[0].publicKey;
  assertOk(send(ctx, [ixRefundPlayer(ctx, ctx.host.publicKey, p)], [ctx.host]), "refund 1");
  assertFails(
    send(ctx, [ixRefundPlayer(ctx, ctx.host.publicKey, p)], [ctx.host]),
    "AlreadyRefunded",
    "C3",
  );
  assertConservation(ctx, "C3 post");
});

test("C4 non-host cannot refund", () => {
  const ctx = setupJoined(2);
  assertFails(
    send(ctx, [ixRefundPlayer(ctx, ctx.outsider.publicKey, ctx.players[0].publicKey)], [ctx.outsider]),
    "NotHost",
    "C4",
  );
});

test("C5 after expiry ANYONE can refund the players — host ghosting can't strand funds (M4c)", () => {
  const ctx = setupJoined(3, { expirySeconds: 100n });
  assertOk(send(ctx, [ixStartGame(ctx, ctx.host.publicKey)], [ctx.host]), "start");
  warpPastExpiry(ctx, 200n);
  for (const p of ctx.players) {
    const before = ctx.svm.getBalance(p.publicKey)!;
    assertOk(
      send(ctx, [ixRefundExpired(ctx, ctx.outsider.publicKey, p.publicKey)], [ctx.outsider]),
      "expired refund by outsider",
    );
    assert(ctx.svm.getBalance(p.publicKey)! === before + BUY_IN, "refund landed");
  }
  const g = readGame(ctx);
  assert(g.totalPot === 0n && g.status === "Completed", "all refunded → Completed");
  assertConservation(ctx, "C5");
});

test("C6 expiry refund before the deadline rejected", () => {
  const ctx = setupJoined(2, { expirySeconds: 3600n });
  assertFails(
    send(ctx, [ixRefundExpired(ctx, ctx.outsider.publicKey, ctx.players[0].publicKey)], [ctx.outsider]),
    "GameNotExpired",
    "C6",
  );
});

test("C7 expiry double-refund rejected (M5)", () => {
  const ctx = setupJoined(2, { expirySeconds: 100n });
  warpPastExpiry(ctx, 200n);
  const p = ctx.players[0].publicKey;
  assertOk(send(ctx, [ixRefundExpired(ctx, ctx.outsider.publicKey, p)], [ctx.outsider]), "refund 1");
  assertFails(
    send(ctx, [ixRefundExpired(ctx, ctx.outsider.publicKey, p)], [ctx.outsider]),
    "AlreadyRefunded",
    "C7",
  );
});

// D. game-control authority
test("D1 non-host cannot start the game", () => {
  const ctx = setupJoined(2);
  assertFails(
    send(ctx, [ixStartGame(ctx, ctx.players[0].publicKey)], [ctx.players[0]]),
    "NotHost",
    "D1",
  );
});

test("D2 non-host cannot cancel the game", () => {
  const ctx = setupJoined(2);
  assertFails(
    send(ctx, [ixCancelGame(ctx, ctx.players[0].publicKey)], [ctx.players[0]]),
    "NotHost",
    "D2",
  );
});

test("D3 cannot start with fewer than 2 players", () => {
  const ctx = setupJoined(1);
  assertFails(
    send(ctx, [ixStartGame(ctx, ctx.host.publicKey)], [ctx.host]),
    "NotEnoughPlayers",
    "D3",
  );
});

test("E1 full lifecycle: create→join×3→start→split settle→Completed with M1 at every step", () => {
  const ctx = setupJoined(3);
  assertConservation(ctx, "E1 after joins");
  assertOk(send(ctx, [ixStartGame(ctx, ctx.host.publicKey)], [ctx.host]), "start");
  assertConservation(ctx, "E1 after start");
  const pot = 3n * BUY_IN;
  const payouts: [PublicKey, bigint][] = [
    [ctx.players[0].publicKey, pot / 2n],
    [ctx.players[1].publicKey, pot / 4n],
    [ctx.players[2].publicKey, pot - pot / 2n - pot / 4n],
  ];
  for (const [who, amt] of payouts) {
    const before = ctx.svm.getBalance(who)!;
    assertOk(send(ctx, [ixDistribute(ctx, ctx.host.publicKey, who, amt)], [ctx.host]), "payout");
    assert(ctx.svm.getBalance(who)! === before + amt, "payout landed exactly");
    assertConservation(ctx, "E1 after payout");
  }
  const g = readGame(ctx);
  assert(g.totalPot === 0n && g.status === "Completed", "settled clean");
});

// ── dispatch ─────────────────────────────────────────────
// Child mode: run exactly one test, exit before litesvm native teardown.
// Parent mode: spawn one child per registered test, aggregate results.

const CHILD = process.env.ISOLATED_CHILD;

if (CHILD) {
  const t = registry.find((x) => x.name === CHILD);
  if (!t) {
    console.log(`      test not registered: ${CHILD}`);
    process.exit(2);
  }
  runOne(t);
  if (failures.length > 0) {
    console.log(`      ${failures[0].split("\n").slice(1).join("\n      ")}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

for (const t of registry) {
  const res = spawnSync(process.execPath, [process.argv[1]], {
    env: { ...process.env, ISOLATED_CHILD: t.name },
    encoding: "utf8",
    timeout: 180_000,
  });
  process.stdout.write(res.stdout ?? "");
  if (res.status === 0) {
    passed++;
  } else {
    failed++;
    const detail = ((res.stdout ?? "") + (res.stderr ?? "")).trim();
    failures.push(`${t.name}\n    ${detail.split("\n").slice(-10).join("\n    ")}`);
    if (res.status === null || !(res.stdout ?? "").includes("✗")) {
      console.log(`  ✗ ${t.name}\n      child died: status=${res.status} signal=${res.signal}`);
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed (TARGET=${TARGET})`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  ✗ ${f}\n`);
}
process.exit(failed > 0 ? 1 : 0);
