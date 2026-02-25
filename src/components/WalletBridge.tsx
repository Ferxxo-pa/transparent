import { useEffect } from 'react';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { useGame } from '../contexts/GameContext';

/**
 * Syncs Privy wallet state into GameContext.
 */
export function WalletBridge() {
  const { publicKey, signTransaction } = usePrivyWallet();
  const { setWalletAdapter } = useGame();

  useEffect(() => {
    if (publicKey && signTransaction) {
      setWalletAdapter({ publicKey, signTransaction });
    } else {
      setWalletAdapter(null);
    }
  }, [publicKey, signTransaction, setWalletAdapter]);

  return null;
}
