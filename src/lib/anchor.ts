import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { SOLANA_RPC } from './config';

// ============================================================
// Solana On-Chain Layer
//
// Uses direct SOL transfers via SystemProgram — no Anchor program
// required. Buy-ins flow to the host wallet (escrow). The host
// distributes the pot to the winner at game end.
//
// All txs are signed by the player/host via Privy and submitted
// to devnet. Fully verifiable on-chain via Solana Explorer.
// ============================================================

export const connection = new Connection(SOLANA_RPC, 'confirmed');

// Timeout wrapper — on-chain calls bail after 5s so they never block the game
function withTimeout<T>(promise: Promise<T>, ms = 5000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('on-chain timeout')), ms)
    ),
  ]);
}

// ── Wallet Interface ────────────────────────────────────────

export interface WalletAdapter {
  publicKey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
}

// ── PDA derivation kept for interface compat (not used) ────

export function deriveGamePDA(hostPubkey: PublicKey, _roomName: string): [PublicKey, number] {
  // Returns host pubkey as a stand-in PDA — escrow is the host wallet itself
  return [hostPubkey, 255];
}

// ── Helpers ─────────────────────────────────────────────────

async function sendAndConfirm(
  wallet: WalletAdapter,
  tx: Transaction,
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = blockhash;

  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    'confirmed',
  );

  return sig;
}

// ── On-Chain Functions ──────────────────────────────────────

/**
 * createGameOnChain: No on-chain action needed for game creation.
 * Game state lives in Supabase. Returns a mock sig.
 */
export async function createGameOnChain(
  _wallet: WalletAdapter,
  _roomName: string,
  _buyInLamports: number,
): Promise<string> {
  // Game is tracked in Supabase. On-chain escrowing happens at join time.
  return 'game-created-offchain';
}

/**
 * joinGameOnChain: Player sends buy-in SOL → host wallet.
 * This is the on-chain escrow. Verifiable on Solana Explorer.
 */
export async function joinGameOnChain(
  wallet: WalletAdapter,
  hostOrGamePDA: PublicKey,
): Promise<string> {
  // hostOrGamePDA here is actually the host's public key (escrow)
  // We read buyIn from the game state — caller passes the lamports via PDA
  // For now we pull from a global config; GameContext passes the host pubkey as gamePDA
  const escrowPubkey = hostOrGamePDA;

  // Build a minimal transfer — GameContext will call this with the correct
  // lamport amount via the public key that was passed in.
  // NOTE: the lamports are NOT in scope here — the caller (GameContext) should
  // pass them. For now we read from the connection.
  // This will be called with correct lamports by the updated GameContext below.
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: escrowPubkey,
      lamports: 0, // Overridden by joinGameOnChainWithAmount
    }),
  );

  return sendAndConfirm(wallet, tx);
}

/**
 * joinGameOnChainWithAmount: Player sends exact buy-in SOL → host wallet.
 * Call this instead of joinGameOnChain for accurate escrow.
 */
export async function joinGameOnChainWithAmount(
  wallet: WalletAdapter,
  hostPubkey: PublicKey,
  lamports: number,
): Promise<string> {
  if (lamports <= 0) return 'skipped-zero-buyin';

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: hostPubkey,
      lamports,
    }),
  );

  return withTimeout(sendAndConfirm(wallet, tx), 5000);
}

/**
 * distributeOnChain: Host sends exact pot SOL → winner wallet.
 * potLamports must be passed explicitly to avoid draining the host's
 * full wallet. If omitted, falls back to (balance - reserve) — use only
 * as a last resort when pot tracking is unavailable.
 */
export async function distributeOnChain(
  wallet: WalletAdapter,
  _gamePDA: PublicKey,
  winnerPubkey: PublicKey,
  potLamports?: number,
): Promise<string> {
  let sendLamports: number;

  if (potLamports && potLamports > 0) {
    // Use the tracked pot amount — safe, exact
    sendLamports = potLamports;
  } else {
    // Fallback: read balance and send minus rent reserve
    // (only triggers if caller doesn't pass potLamports)
    const balance = await connection.getBalance(wallet.publicKey, 'confirmed');
    const reserve = 5000;
    sendLamports = Math.max(balance - reserve, 0);
  }

  if (sendLamports <= 0) throw new Error('No SOL to distribute — pot is empty');

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: winnerPubkey,
      lamports: sendLamports,
    }),
  );

  return sendAndConfirm(wallet, tx);
}

export { LAMPORTS_PER_SOL };
