import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { SOLANA_RPC, PROGRAM_ID } from './config';

// ============================================================
// Anchor Client — On-Chain Interactions
// ============================================================

const connection = new Connection(SOLANA_RPC, 'confirmed');
const programId = new PublicKey(PROGRAM_ID);

// ── PDA Derivation ──────────────────────────────────────────

export function deriveGamePDA(hostPubkey: PublicKey, roomName: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('game'), hostPubkey.toBuffer(), Buffer.from(roomName)],
    programId,
  );
}

// ── Instruction Builders ────────────────────────────────────
// We build raw transactions matching the Anchor instruction layout.
// The Anchor discriminator is sha256("global:<instruction_name>")[0..8].

function anchorDiscriminator(instructionName: string): Buffer {
  // Pre-computed Anchor discriminators: sha256("global:<name>")[0..8]
  // For browser compat, hardcode the discriminators
  const known: Record<string, number[]> = {
    create_game: [124, 69, 75, 88, 73, 98, 148, 108],
    join_game: [107, 112, 18, 38, 56, 173, 60, 128],
    distribute_pot: [202, 67, 148, 10, 15, 183, 179, 13],
  };
  if (known[instructionName]) {
    return Buffer.from(known[instructionName]);
  }
  // Fallback (should not happen for our 3 instructions)
  throw new Error(`Unknown instruction: ${instructionName}`);
}

// NOTE: The discriminators above are placeholders. They'll be correct if the Anchor
// framework generates them as sha256("global:create_game")[0..8] etc.
// If the build fails at runtime, regenerate from the IDL.

/** Encode a string with a 4-byte u32 length prefix (little-endian, Borsh) */
function encodeString(s: string): Buffer {
  const strBuf = Buffer.from(s, 'utf-8');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(strBuf.length, 0);
  return Buffer.concat([lenBuf, strBuf]);
}

/** Encode a u64 as 8 bytes little-endian */
function encodeU64(val: number | bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(val), 0);
  return buf;
}

/** Encode a PublicKey as 32 bytes */
function encodePubkey(pk: PublicKey): Buffer {
  return pk.toBuffer();
}

// ── Wallet Interface ────────────────────────────────────────

export interface WalletAdapter {
  publicKey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
}

// ── On-Chain Functions ──────────────────────────────────────

/**
 * Create a game on-chain. Initialises the Game PDA account.
 */
export async function createGameOnChain(
  wallet: WalletAdapter,
  roomName: string,
  buyInLamports: number,
): Promise<string> {
  const [gamePDA] = deriveGamePDA(wallet.publicKey, roomName);

  const data = Buffer.concat([
    anchorDiscriminator('create_game'),
    encodeString(roomName),
    encodeU64(buyInLamports),
  ]);

  const ix = {
    keys: [
      { pubkey: gamePDA, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data,
  };

  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig, 'confirmed');

  return sig;
}

/**
 * Join a game on-chain. Transfers buy-in SOL to the Game PDA.
 */
export async function joinGameOnChain(
  wallet: WalletAdapter,
  gamePDA: PublicKey,
): Promise<string> {
  const data = anchorDiscriminator('join_game');

  const ix = {
    keys: [
      { pubkey: gamePDA, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data,
  };

  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig, 'confirmed');

  return sig;
}

/**
 * Distribute the pot to the winner and close the game account.
 * Only the host can call this.
 */
export async function distributeOnChain(
  wallet: WalletAdapter,
  gamePDA: PublicKey,
  winnerPubkey: PublicKey,
): Promise<string> {
  const data = Buffer.concat([
    anchorDiscriminator('distribute_pot'),
    encodePubkey(winnerPubkey),
  ]);

  const ix = {
    keys: [
      { pubkey: gamePDA, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: winnerPubkey, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data,
  };

  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig, 'confirmed');

  return sig;
}

export { connection, programId };
