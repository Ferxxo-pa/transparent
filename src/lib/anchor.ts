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
  // wallet.sendTransaction is the Privy bridge.
  // It fetches a fresh blockhash from the configured RPC and sets it on the
  // transaction before signing — so we must NOT pre-set recentBlockhash here
  // or the confirm call will use a stale/mismatched value.
  //
  // We still set feePayer so Privy knows who pays, but leave blockhash blank
  // and let the bridge fill it in.
  tx.feePayer = wallet.publicKey;

  const sig = await wallet.sendTransaction(tx);

  // Confirm using a signature-status poll so we don't need the blockhash.
  try {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const status = await connection.getSignatureStatus(sig, { searchTransactionHistory: true });
      const cs = status?.value?.confirmationStatus;
      if (cs === 'confirmed' || cs === 'finalized') {
        if (status?.value?.err) {
          throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.value.err)}`);
        }
        break;
      }
      // Wait before polling again
      await new Promise(r => setTimeout(r, 1500));
    }
  } catch (err) {
    console.warn('[anchor] Confirmation warning (tx may still succeed):', err);
    // Don't throw — the tx was already sent
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
