import { useEffect } from 'react';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { useGame } from '../contexts/GameContext';

/**
 * Syncs Privy wallet state into GameContext.
 * Uses sendTransaction (sign+send in one call via Privy wallet).
 */
export function WalletBridge() {
  const { publicKey, sendTransaction, signMessage } = usePrivyWallet();
  const { setWalletAdapter } = useGame();

  useEffect(() => {
    if (publicKey && sendTransaction) {
      setWalletAdapter({ publicKey, sendTransaction, signMessage: signMessage ?? undefined });
    } else {
      setWalletAdapter(null);
    }
  }, [publicKey, sendTransaction, signMessage, setWalletAdapter]);

  return null;
}
