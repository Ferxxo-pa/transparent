import { useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useGame } from '../contexts/GameContext';

/**
 * Syncs the wallet adapter (Phantom/Solflare) into GameContext.
 * publicKey + signTransaction come from wallet adapter — not Privy.
 */
export function WalletBridge() {
  const { publicKey, signTransaction, connected } = useWallet();
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
