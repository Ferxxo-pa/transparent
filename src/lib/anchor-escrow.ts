/**
 * Trustless Escrow — PDA-based pot management
 *
 * All buy-ins go to an escrow PDA, not the host wallet.
 * The program controls distribution based on game rules.
 * If the host ghosts, anyone can refund after expiry.
 *
 * To switch to escrow mode:
 * 1. Deploy the Anchor program (programs/transparent/)
 * 2. Update PROGRAM_ID below with deployed address
 * 3. Replace imports in GameContext.tsx:
 *    - import { createGameEscrow, joinGameEscrow, ... } from './anchor-escrow'
 *    - Replace all direct transfer calls with escrow equivalents
 */

import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
} from '@solana/web3.js';
import { SOLANA_RPC } from './config';
import { WalletAdapter, connection } from './anchor';

// ── Program ID (update after deploy) ──────────────────────
const PROGRAM_ID = new PublicKey('2zPLNqsyqXNxaMkzWUMh1ZcbJBR3Jr2bTky1FFaZVuF9');

// ── PDA Derivations ───────────────────────────────────────

export function deriveGamePDA(hostPubkey: PublicKey, roomCode: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('game'), hostPubkey.toBuffer(), Buffer.from(roomCode)],
    PROGRAM_ID,
  );
}

export function deriveEscrowPDA(gamePubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), gamePubkey.toBuffer()],
    PROGRAM_ID,
  );
}

export function derivePlayerPDA(gamePubkey: PublicKey, playerPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('player'), gamePubkey.toBuffer(), playerPubkey.toBuffer()],
    PROGRAM_ID,
  );
}

// ── Helper: build and send ────────────────────────────────

async function buildAndSend(wallet: WalletAdapter, tx: Transaction): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = blockhash;

  const sig = await wallet.sendTransaction(tx);

  try {
    const confirmPromise = connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      'confirmed',
    );
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Confirmation timeout')), 30000),
    );
    await Promise.race([confirmPromise, timeoutPromise]);
  } catch (err) {
    // tx already sent
  }

  return sig;
}

// ── Anchor Instruction Builders ───────────────────────────
// These use raw instruction building (no @coral-xyz/anchor dependency)
// to keep the frontend bundle small.

function encodeString(str: string): Buffer {
  const buf = Buffer.alloc(4 + str.length);
  buf.writeUInt32LE(str.length, 0);
  buf.write(str, 4);
  return buf;
}

function encodeU64(val: number | bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(val));
  return buf;
}

function encodeU8(val: number): Buffer {
  return Buffer.from([val]);
}

function encodeI64(val: number | bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(BigInt(val));
  return buf;
}

// Anchor discriminators (first 8 bytes of sha256("global:<instruction_name>"))
// ⚠️ PLACEHOLDER VALUES — recompute after building the program.
// See ESCROW_MIGRATION.md Step 2 for how to generate real values.
const DISCRIMINATORS = {
  create_game: Buffer.from([24, 237, 120, 89, 171, 82, 155, 98]),
  join_game: Buffer.from([107, 112, 18, 38, 56, 173, 60, 128]),
  start_game: Buffer.from([249, 47, 252, 172, 184, 162, 245, 14]),
  distribute: Buffer.from([155, 67, 128, 195, 187, 40, 95, 101]),
  end_game: Buffer.from([224, 135, 245, 99, 67, 175, 121, 252]),
  refund_player: Buffer.from([124, 72, 4, 227, 2, 53, 178, 169]),
  cancel_game: Buffer.from([100, 0, 54, 73, 81, 230, 26, 209]),
  refund_all_expired: Buffer.from([197, 22, 184, 51, 118, 7, 220, 200]),
};

// NOTE: The discriminators above are placeholders.
// After deploying the program, generate the real IDL and use:
//   anchor idl init --filepath target/idl/transparent.json <PROGRAM_ID>
// Or compute them with: sha256("global:create_game")[0..8]

// ── Public API ────────────────────────────────────────────

/**
 * Host creates a game with escrow PDA.
 */
export async function createGameEscrow(
  wallet: WalletAdapter,
  roomCode: string,
  buyInLamports: number,
  maxPlayers: number = 10,
  expirySeconds: number = 3600, // 1 hour default
): Promise<{ sig: string; gamePDA: PublicKey; escrowPDA: PublicKey }> {
  const [gamePDA] = deriveGamePDA(wallet.publicKey, roomCode);
  const [escrowPDA] = deriveEscrowPDA(gamePDA);

  const data = Buffer.concat([
    DISCRIMINATORS.create_game,
    encodeString(roomCode),
    encodeU64(buyInLamports),
    encodeU8(maxPlayers),
    encodeI64(expirySeconds),
  ]);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: gamePDA, isSigner: false, isWritable: true },
      { pubkey: escrowPDA, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  const sig = await buildAndSend(wallet, tx);

  return { sig, gamePDA, escrowPDA };
}

/**
 * Player joins — buy-in goes to escrow PDA, not host.
 */
export async function joinGameEscrow(
  wallet: WalletAdapter,
  gamePDA: PublicKey,
): Promise<string> {
  const [escrowPDA] = deriveEscrowPDA(gamePDA);
  const [playerPDA] = derivePlayerPDA(gamePDA, wallet.publicKey);

  const data = DISCRIMINATORS.join_game;

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: gamePDA, isSigner: false, isWritable: true },
      { pubkey: playerPDA, isSigner: false, isWritable: true },
      { pubkey: escrowPDA, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  return buildAndSend(wallet, tx);
}

/**
 * Host distributes from escrow to a recipient.
 * Call once for winner-takes-all, or multiple times for split-pot.
 */
export async function distributeEscrow(
  wallet: WalletAdapter,
  gamePDA: PublicKey,
  recipientPubkey: PublicKey,
  amountLamports: number,
): Promise<string> {
  const [escrowPDA] = deriveEscrowPDA(gamePDA);

  const data = Buffer.concat([
    DISCRIMINATORS.distribute,
    encodeU64(amountLamports),
  ]);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: gamePDA, isSigner: false, isWritable: true },
      { pubkey: escrowPDA, isSigner: false, isWritable: true },
      { pubkey: recipientPubkey, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  return buildAndSend(wallet, tx);
}

/**
 * Host refunds a specific player (leave request approved).
 */
export async function refundPlayerEscrow(
  wallet: WalletAdapter,
  gamePDA: PublicKey,
  playerPubkey: PublicKey,
): Promise<string> {
  const [escrowPDA] = deriveEscrowPDA(gamePDA);
  const [playerPDA] = derivePlayerPDA(gamePDA, playerPubkey);

  const data = DISCRIMINATORS.refund_player;

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: gamePDA, isSigner: false, isWritable: true },
      { pubkey: playerPDA, isSigner: false, isWritable: true },
      { pubkey: escrowPDA, isSigner: false, isWritable: true },
      { pubkey: playerPubkey, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  return buildAndSend(wallet, tx);
}

/**
 * Anyone can call after expiry to refund a player.
 * This is the trustless guarantee.
 */
export async function refundExpired(
  wallet: WalletAdapter,
  gamePDA: PublicKey,
  playerPubkey: PublicKey,
): Promise<string> {
  const [escrowPDA] = deriveEscrowPDA(gamePDA);
  const [playerPDA] = derivePlayerPDA(gamePDA, playerPubkey);

  const data = DISCRIMINATORS.refund_all_expired;

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: gamePDA, isSigner: false, isWritable: true },
      { pubkey: playerPDA, isSigner: false, isWritable: true },
      { pubkey: escrowPDA, isSigner: false, isWritable: true },
      { pubkey: playerPubkey, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  return buildAndSend(wallet, tx);
}

/**
 * Host cancels the game.
 */
export async function cancelGameEscrow(
  wallet: WalletAdapter,
  gamePDA: PublicKey,
): Promise<string> {
  const data = DISCRIMINATORS.cancel_game;

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: gamePDA, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  return buildAndSend(wallet, tx);
}

/**
 * Get escrow balance (how much SOL the PDA holds).
 */
export async function getEscrowBalance(gamePDA: PublicKey): Promise<number> {
  const [escrowPDA] = deriveEscrowPDA(gamePDA);
  const balance = await connection.getBalance(escrowPDA, 'confirmed');
  return balance;
}
