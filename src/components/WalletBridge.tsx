import { useEffect } from 'react';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { useGame } from '../contexts/GameContext';

/**
 * Bridges the Privy wallet to the GameContext.
 * Keeps walletRef in GameContext in sync with the Privy wallet.
 * Renders nothing — just runs an effect.
 */
export function WalletBridge() {
  const { publicKey, signTransaction, connected } = usePrivyWallet();
  const { setWalletAdapter } = useGame();

  useEffect(() => {
    if (connected && publicKey && signTransaction) {
      setWalletAdapter({ publicKey, signTransaction });
    } else {
      setWalletAdapter(null);
    }
  }, [connected, publicKey, signTransaction, setWalletAdapter]);

  return null;
}
