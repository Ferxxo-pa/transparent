import { useEffect } from 'react';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { useGame } from '../contexts/GameContext';

/**
 * Bridges the wallet adapter to the GameContext walletRef.
 * Sets walletRef whenever publicKey is available (connected).
 * signTransaction may be undefined on some wallets until first use — that's OK,
 * createGame only needs publicKey; signing is only needed for on-chain transfers.
 */
export function WalletBridge() {
  const { publicKey, signTransaction, connected } = usePrivyWallet();
  const { setWalletAdapter } = useGame();

  useEffect(() => {
    if (connected && publicKey) {
      setWalletAdapter({
        publicKey,
        // signTransaction may be undefined on first render; use a wrapper that re-resolves
        signTransaction: signTransaction ?? (async (tx) => { throw new Error('Wallet does not support signTransaction'); }),
      });
    } else {
      setWalletAdapter(null);
    }
  }, [connected, publicKey, signTransaction, setWalletAdapter]);

  return null;
}
