import { useEffect, useState, useRef } from 'react';
import { PublicKey, Connection } from '@solana/web3.js';
import { SOLANA_RPC } from '../lib/config';

const connection = new Connection(SOLANA_RPC, 'confirmed');

/**
 * Polls the SOL balance for a wallet address every 15 seconds.
 * Returns null while loading, 0 if the address has no balance.
 */
export function useWalletBalance(publicKey: PublicKey | null): number | null {
  const [balance, setBalance] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const keyStr = publicKey?.toBase58() ?? null;

  useEffect(() => {
    if (!keyStr) {
      setBalance(null);
      return;
    }
    const pk = new PublicKey(keyStr);
    const fetchBalance = async () => {
      try {
        const lamports = await connection.getBalance(pk, 'confirmed');
        setBalance(lamports / 1_000_000_000);
      } catch {
        // fail silently — network might be flaky on devnet
      }
    };

    fetchBalance();
    intervalRef.current = setInterval(fetchBalance, 15_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [keyStr]);

  return balance;
}
