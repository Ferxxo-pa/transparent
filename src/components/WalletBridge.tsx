import { useEffect } from 'react';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { useGame } from '../contexts/GameContext';

/**
 * Syncs Privy wallet state into GameContext.
 * No wallet adapter — pure Privy.
 */
export function WalletBridge() {
  const { publicKey, signTransaction } = usePrivyWallet();
  const { setWallet } = useGame();

  useEffect(() => {
    if (publicKey && signTransaction) {
      setWallet({ publicKey, signTransaction });
    } else {
      setWallet(null);
    }
  }, [publicKey, signTransaction, setWallet]);

  return null;
}
