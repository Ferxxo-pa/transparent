import { useEffect } from 'react';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { useGame } from '../contexts/GameContext';

/**
 * Bridges Privy wallet to GameContext walletRef.
 * Uses walletReady (publicKey exists) rather than connected (authenticated)
 * because GameContext needs an actual PublicKey to operate.
 */
export function WalletBridge() {
  const { publicKey, signTransaction, walletReady } = usePrivyWallet();
  const { setWalletAdapter } = useGame();

  useEffect(() => {
    if (walletReady && publicKey) {
      setWalletAdapter({
        publicKey,
        signTransaction: signTransaction ?? (async () => { throw new Error('Wallet does not support signTransaction'); }),
      });
    } else {
      setWalletAdapter(null);
    }
  }, [walletReady, publicKey, signTransaction, setWalletAdapter]);

  return null;
}
