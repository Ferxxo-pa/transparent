// Devnet E2E for the deployed escrow program (see ESCROW_SPEC.md).
//
//   node tests/devnet-e2e.ts
//
// Uses ~/.config/solana/id.json as the funding wallet. Exercises:
//   G1: create → join×2 → start → distribute full pot → Completed
//   G2: create → join → cancel → refund_player → funds back
//   G3: create(expiry=15s) → join → wait → refund_all_expired by outsider
//
// DEVNET ONLY. Never point this at mainnet.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const RPC = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("2zPLNqsyqXNxaMkzWUMh1ZcbJBR3Jr2bTky1FFaZVuF9");
const BUY_IN = 10_000_000n; // 0.01 SOL
const FUND = 60_000_000; // 0.06 SOL per ephemeral actor

const conn = new Connection(RPC, "confirmed");
const payer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8"))),
);

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

async function send(ixs: TransactionInstruction[], signers: Keypair[], label: string) {
  const tx = new Transaction().add(...ixs);
  const sig = await sendAndConfirmTransaction(conn, tx, signers, { commitment: "confirmed" });
  console.log(`  ✓ ${label}  ${sig.slice(0, 20)}…`);
  return sig;
}

const STATUS = ["Waiting", "Playing", "Distributing", "Completed", "Cancelled"] as const;
async function readGame(game: PublicKey) {
  const acc = await conn.getAccountInfo(game, "confirmed");
  if (!acc) throw new Error("game account missing");
  const d = Buffer.from(acc.data);
  let o = 8;
  o += 32; // host
  const codeLen = d.readUInt32LE(o); o += 4 + codeLen;
  const buyIn = d.readBigUInt64LE(o); o += 8;
  const maxPlayers = d.readUInt8(o); o += 1;
  const playerCount = d.readUInt8(o); o += 1;
  const totalPot = d.readBigUInt64LE(o); o += 8;
  const status = STATUS[d.readUInt8(o)];
  return { buyIn, maxPlayers, playerCount, totalPot, status };
}

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

interface GameCtx { host: Keypair; roomCode: string; game: PublicKey; escrow: PublicKey }

function ixCreateGame(g: GameCtx, expirySeconds: bigint): TransactionInstruction {
  const data = Buffer.concat([
    disc("create_game"),
    str(g.roomCode),
    u64le(BUY_IN),
    Buffer.from([8]),
    i64le(expirySeconds),
    PublicKey.default.toBuffer(),
  ]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: g.game, isSigner: false, isWritable: true },
      { pubkey: g.escrow, isSigner: false, isWritable: true },
      { pubkey: g.host.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}
function ixJoin(g: GameCtx, player: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: g.game, isSigner: false, isWritable: true },
      { pubkey: playerEntryPda(g.game, player), isSigner: false, isWritable: true },
      { pubkey: g.escrow, isSigner: false, isWritable: true },
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: disc("join_game"),
  });
}
function ixStart(g: GameCtx): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: g.game, isSigner: false, isWritable: true },
      { pubkey: g.host.publicKey, isSigner: true, isWritable: false },
    ],
    data: disc("start_game"),
  });
}
function ixDistribute(g: GameCtx, recipient: PublicKey, amount: bigint): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: g.game, isSigner: false, isWritable: true },
      { pubkey: g.escrow, isSigner: false, isWritable: true },
      { pubkey: recipient, isSigner: false, isWritable: true },
      { pubkey: g.host.publicKey, isSigner: true, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([disc("distribute"), u64le(amount)]),
  });
}
function ixCancel(g: GameCtx): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: g.game, isSigner: false, isWritable: true },
      { pubkey: g.host.publicKey, isSigner: true, isWritable: false },
    ],
    data: disc("cancel_game"),
  });
}
function ixRefundPlayer(g: GameCtx, player: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: g.game, isSigner: false, isWritable: true },
      { pubkey: playerEntryPda(g.game, player), isSigner: false, isWritable: true },
      { pubkey: g.escrow, isSigner: false, isWritable: true },
      { pubkey: player, isSigner: false, isWritable: true },
      { pubkey: g.host.publicKey, isSigner: true, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: disc("refund_player"),
  });
}
function ixRefundExpired(g: GameCtx, caller: PublicKey, player: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: g.game, isSigner: false, isWritable: true },
      { pubkey: playerEntryPda(g.game, player), isSigner: false, isWritable: true },
      { pubkey: g.escrow, isSigner: false, isWritable: true },
      { pubkey: player, isSigner: false, isWritable: true },
      { pubkey: caller, isSigner: true, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: disc("refund_all_expired"),
  });
}

function newGame(host: Keypair): GameCtx {
  const roomCode = `E2E${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  return { host, roomCode, ...pdas(host.publicKey, roomCode) };
}

const bal = (pk: PublicKey) => conn.getBalance(pk, "confirmed").then(BigInt);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`Devnet E2E — program ${PROGRAM_ID.toBase58()}\n  payer ${payer.publicKey.toBase58()}`);

  const host = Keypair.generate();
  const p1 = Keypair.generate();
  const p2 = Keypair.generate();
  const outsider = Keypair.generate();
  const fundIx = [host, p1, p2, outsider].map((kp) =>
    SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: kp.publicKey, lamports: FUND }),
  );
  await send(fundIx, [payer], "fund 4 ephemeral actors (0.06 SOL each)");

  // ── G1: full lifecycle with settlement ──
  console.log("\nG1 create→join×2→start→distribute→Completed");
  const g1 = newGame(host);
  await send([ixCreateGame(g1, 3600n)], [host], `create_game ${g1.roomCode}`);
  await send([ixJoin(g1, p1.publicKey)], [p1], "p1 join (0.01 SOL buy-in)");
  await send([ixJoin(g1, p2.publicKey)], [p2], "p2 join (0.01 SOL buy-in)");
  let st = await readGame(g1.game);
  assert(st.totalPot === 2n * BUY_IN && st.playerCount === 2, `pot=${st.totalPot} count=${st.playerCount}`);
  await send([ixStart(g1)], [host], "start_game");
  const w0 = await bal(p1.publicKey);
  await send([ixDistribute(g1, p1.publicKey, 2n * BUY_IN)], [host], "distribute full pot to p1");
  const w1 = await bal(p1.publicKey);
  assert(w1 === w0 + 2n * BUY_IN, `winner delta ${w1 - w0}, want ${2n * BUY_IN}`);
  st = await readGame(g1.game);
  assert(st.status === "Completed" && st.totalPot === 0n, `status=${st.status} pot=${st.totalPot}`);
  console.log("  G1 PASS — winner received full pot, game Completed");

  // ── G2: cancel → refund ──
  console.log("\nG2 create→join→cancel→refund_player");
  const g2 = newGame(host);
  await send([ixCreateGame(g2, 3600n)], [host], `create_game ${g2.roomCode}`);
  await send([ixJoin(g2, p1.publicKey)], [p1], "p1 join");
  await send([ixCancel(g2)], [host], "cancel_game");
  st = await readGame(g2.game);
  assert(st.status === "Cancelled", `status=${st.status}`);
  const r0 = await bal(p1.publicKey);
  await send([ixRefundPlayer(g2, p1.publicKey)], [host], "refund_player p1");
  const r1 = await bal(p1.publicKey);
  assert(r1 === r0 + BUY_IN, `refund delta ${r1 - r0}, want ${BUY_IN}`);
  st = await readGame(g2.game);
  assert(st.totalPot === 0n, `pot=${st.totalPot}`);
  console.log("  G2 PASS — cancel→refund returned the buy-in");

  // ── G3: expiry refund by outsider ──
  console.log("\nG3 create(expiry=15s)→join→wait→refund_all_expired by outsider");
  const g3 = newGame(host);
  await send([ixCreateGame(g3, 15n)], [host], `create_game ${g3.roomCode}`);
  await send([ixJoin(g3, p2.publicKey)], [p2], "p2 join");
  console.log("  … waiting 20s for expiry");
  await sleep(20_000);
  const e0 = await bal(p2.publicKey);
  await send([ixRefundExpired(g3, outsider.publicKey, p2.publicKey)], [outsider], "refund_all_expired by outsider");
  const e1 = await bal(p2.publicKey);
  assert(e1 === e0 + BUY_IN, `expiry refund delta ${e1 - e0}, want ${BUY_IN}`);
  console.log("  G3 PASS — outsider recovered the stranded buy-in after expiry");

  console.log("\nALL DEVNET E2E PASS (G1 settle, G2 cancel-refund, G3 expiry-refund)");
}

main().catch((e) => {
  console.error("E2E FAILED:", e.message ?? e);
  if (e.logs) console.error(e.logs.slice(-8).join("\n"));
  process.exit(1);
});
