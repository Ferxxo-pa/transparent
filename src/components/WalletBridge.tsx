import { useEffect } from 'react';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { useGame } from '../contexts/GameContext';

/**
 * Bridges Privy Solana wallet → GameContext walletRef.
 * Sets the adapter whenever a real Solana publicKey is available.
 */
export function WalletBridge() {
  const { publicKey, signTransaction } = usePrivyWallet();
  const { setWalletAdapter } = useGame();

  useEffect(() => {
    if (publicKey && signTransaction) {
      setWalletAdapter({
        publicKey,
        signTransaction,
      });
    } else {
      setWalletAdapter(null);
    }
  }, [publicKey, signTransaction, setWalletAdapter]);

  return null;
}
