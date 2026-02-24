import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletModalProvider, useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { PublicKey, Transaction } from '@solana/web3.js';
import { SOLANA_RPC } from '../lib/config';
import '@solana/wallet-adapter-react-ui/styles.css';

// ============================================================
// Wallet Context — standard Solana wallet adapter
// Same interface as old Privy context so callers don't change
// ============================================================

export interface PrivyWallet {
  wallet: ReturnType<typeof useWallet>['wallet'];
  publicKey: PublicKey | null;
  signTransaction: ((tx: Transaction) => Promise<Transaction>) | null;
  connected: boolean;
  login: () => void;
  logout: () => Promise<void>;
  user: null;
  displayName: string;
}

const PrivyWalletContext = createContext<PrivyWallet | undefined>(undefined);

function WalletInner({ children }: { children: ReactNode }) {
  const { wallet, publicKey, connected, disconnect, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();

  const displayName = useMemo(() => {
    if (!publicKey) return 'Anon';
    const addr = publicKey.toBase58();
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  }, [publicKey]);

  const value: PrivyWallet = useMemo(() => ({
    wallet,
    publicKey: publicKey ?? null,
    signTransaction: signTransaction
      ? (tx: Transaction) => signTransaction(tx)
      : null,
    connected,
    login: () => setVisible(true),
    logout: async () => { await disconnect(); },
    user: null,
    displayName,
  }), [wallet, publicKey, connected, disconnect, signTransaction, setVisible, displayName]);

  return (
    <PrivyWalletContext.Provider value={value}>
      {children}
    </PrivyWalletContext.Provider>
  );
}

const wallets = [
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter(),
];

export const PrivyWalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <ConnectionProvider endpoint={SOLANA_RPC}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <WalletInner>{children}</WalletInner>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export function usePrivyWallet(): PrivyWallet {
  const ctx = useContext(PrivyWalletContext);
  if (!ctx) throw new Error('usePrivyWallet must be used within PrivyWalletProvider');
  return ctx;
}
