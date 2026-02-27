/**
 * MagicBlock Ephemeral Rollups Integration
 *
 * Uses MagicBlock's Magic Router to route game transactions
 * through Ephemeral Rollups for faster confirmations (~400ms vs ~400ms+ on base layer).
 *
 * The Magic Router is a single RPC endpoint that intelligently decides
 * whether to execute transactions on Ephemeral Rollups or Solana base layer.
 *
 * For Transparent, this means:
 * - Game buy-ins confirm faster (better UX during live games)
 * - Pot distributions are near-instant
 * - No changes needed to wallet signing flow
 */

import { Connection, Transaction, PublicKey, SystemProgram } from '@solana/web3.js';
import { MAGICBLOCK_ROUTER, MAGICBLOCK_WS, SOLANA_RPC } from './config';
import type { WalletAdapter } from './anchor';

// MagicBlock Magic Router connection — routes to Ephemeral Rollups
let magicBlockConnection: Connection | null = null;

// Standard Solana connection as fallback
const fallbackConnection = new Connection(SOLANA_RPC, 'confirmed');

/**
 * Get the MagicBlock Magic Router connection.
 * Creates it lazily and falls back to standard RPC if Magic Router is unavailable.
 */
export function getMagicBlockConnection(): Connection {
  if (!magicBlockConnection) {
    try {
      magicBlockConnection = new Connection(MAGICBLOCK_ROUTER, {
        wsEndpoint: MAGICBLOCK_WS,
        commitment: 'confirmed',
      });
    } catch (err) {
      console.warn('[MagicBlock] Failed to create Magic Router connection, using fallback:', err);
      return fallbackConnection;
    }
  }
  return magicBlockConnection;
}

/**
 * Send a game transaction through MagicBlock's Magic Router.
 * Automatically routes to Ephemeral Rollups for faster execution.
 * Falls back to standard Solana RPC on failure.
 */
export async function sendGameTransaction(
  wallet: WalletAdapter,
  tx: Transaction,
): Promise<string> {
  const conn = getMagicBlockConnection();

  try {
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = blockhash;

    const sig = await wallet.sendTransaction(tx);

    // Confirm via Magic Router
    try {
      await Promise.race([
        conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed'),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ER confirmation timeout')), 15000)),
      ]);
    } catch (err) {
      console.warn('[MagicBlock] ER confirmation warning (tx may still succeed):', err);
    }

    return sig;
  } catch (err) {
    console.warn('[MagicBlock] Magic Router failed, falling back to standard RPC:', err);
    // Fallback to standard Solana
    const { blockhash, lastValidBlockHeight } = await fallbackConnection.getLatestBlockhash('confirmed');
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = blockhash;

    const sig = await wallet.sendTransaction(tx);

    try {
      await Promise.race([
        fallbackConnection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed'),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Confirmation timeout')), 30000)),
      ]);
    } catch (confirmErr) {
      console.warn('[MagicBlock] Fallback confirmation warning:', confirmErr);
    }

    return sig;
  }
}

/**
 * Send a buy-in transaction through MagicBlock's Ephemeral Rollups.
 */
export async function buyInViaMagicBlock(
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

  return sendGameTransaction(wallet, tx);
}

/**
 * Distribute winnings through MagicBlock's Ephemeral Rollups.
 */
export async function distributeViaMagicBlock(
  wallet: WalletAdapter,
  winnerPubkey: PublicKey,
  lamports: number,
): Promise<string> {
  if (lamports <= 0) throw new Error('No SOL to distribute');

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: winnerPubkey,
      lamports,
    }),
  );

  return sendGameTransaction(wallet, tx);
}

/**
 * Check if MagicBlock Magic Router is available.
 */
export async function isMagicBlockAvailable(): Promise<boolean> {
  try {
    const conn = getMagicBlockConnection();
    await conn.getLatestBlockhash('confirmed');
    return true;
  } catch {
    return false;
  }
}
