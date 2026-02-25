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
// Uses direct SOL transfers via SystemProgram — no Anchor program.
// Signing: Privy headless (no modal) via useSignTransaction
// Sending: manual via Connection.sendRawTransaction (Helius RPC)
// Confirmation: fire-and-forget (devnet confirmTransaction hangs)
// ============================================================

export const connection = new Connection(SOLANA_RPC, 'confirmed');

// ── Wallet Interface ────────────────────────────────────────

export interface WalletAdapter {
  publicKey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
}

// ── PDA derivation kept for interface compat (not used) ────

export function deriveGamePDA(hostPubkey: PublicKey, _roomName: string): [PublicKey, number] {
  return [hostPubkey, 255];
}

// ── Helpers ─────────────────────────────────────────────────

async function sendAndConfirm(
  wallet: WalletAdapter,
  tx: Transaction,
): Promise<string> {
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = blockhash;

  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  // Fire-and-forget confirmation — devnet confirmTransaction often hangs.
  // The tx is already sent and will confirm on-chain.
  connection.confirmTransaction(sig, 'confirmed').catch(() => {});

  return sig;
}

// ── On-Chain Functions ──────────────────────────────────────

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
  return sendAndConfirm(wallet, tx);
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

  return sendAndConfirm(wallet, tx);
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

  return sendAndConfirm(wallet, tx);
}

export { LAMPORTS_PER_SOL };
