import { useEffect } from 'react';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { useGame } from '../contexts/GameContext';

/**
 * Syncs Privy wallet state into GameContext.
 * Passes signAndSendTransaction so anchor.ts can use Privy's
 * built-in sign+send flow (avoids modal hanging on sign-only).
 */
export function WalletBridge() {
  const { publicKey, signTransaction, signAndSendTransaction } = usePrivyWallet();
  const { setWalletAdapter } = useGame();

  useEffect(() => {
    if (publicKey && signTransaction) {
      setWalletAdapter({ publicKey, signTransaction, signAndSendTransaction: signAndSendTransaction ?? undefined });
    } else {
      setWalletAdapter(null);
    }
  }, [publicKey, signTransaction, signAndSendTransaction, setWalletAdapter]);

  return null;
}
