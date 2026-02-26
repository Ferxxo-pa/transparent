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
// Per Privy docs: wallet.sendTransaction(tx, connection)
// Signs AND sends in one call using our Helius RPC Connection.
// No separate signTransaction step needed.
// ============================================================

export const connection = new Connection(SOLANA_RPC, 'confirmed');

export interface WalletAdapter {
  publicKey: PublicKey;
  /** Signs and sends tx via Privy wallet, returns signature */
  sendTransaction: (tx: Transaction) => Promise<string>;
}

export function deriveGamePDA(hostPubkey: PublicKey, _roomName: string): [PublicKey, number] {
  return [hostPubkey, 255];
}

async function buildAndSend(
  wallet: WalletAdapter,
  tx: Transaction,
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = blockhash;

  // Privy wallet.sendTransaction signs + sends using our Connection
  const sig = await wallet.sendTransaction(tx);

  // Wait for confirmation with timeout (devnet can be slow)
  try {
    const confirmPromise = connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      'confirmed',
    );
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Confirmation timeout')), 30000)
    );
    await Promise.race([confirmPromise, timeoutPromise]);
  } catch (err) {
    console.warn('[anchor] Confirmation warning (tx may still succeed):', err);
    // Don't throw — the tx was already sent successfully
  }

  return sig;
}

export async function createGameOnChain(
  _wallet: WalletAdapter,
  _roomName: string,
  _buyInLamports: number,
): Promise<string> {
  return 'game-created-offchain';
}

export async function joinGameOnChain(
  wallet: WalletAdapter,
  hostOrGamePDA: PublicKey,
): Promise<string> {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: hostOrGamePDA,
      lamports: 0,
    }),
  );
  return buildAndSend(wallet, tx);
}

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

  return buildAndSend(wallet, tx);
}

export async function distributeOnChain(
  wallet: WalletAdapter,
  _gamePDA: PublicKey,
  winnerPubkey: PublicKey,
  potLamports?: number,
): Promise<string> {
  let sendLamports: number;

  if (potLamports && potLamports > 0) {
    sendLamports = potLamports;
  } else {
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

  return buildAndSend(wallet, tx);
}

export { LAMPORTS_PER_SOL };
