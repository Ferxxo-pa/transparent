import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import {
  PrivyProvider as _PrivyProvider,
  usePrivy,
  useLogin,
  useLogout,
  type ConnectedWallet,
} from '@privy-io/react-auth';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { PRIVY_APP_ID } from '../lib/config';

// ============================================================
// Architecture:
//   Auth:    Privy (email / Google / Apple / wallet login)
//   Wallet:  @solana/wallet-adapter-react (Phantom / Solflare)
//   Sign:    wallet adapter's signTransaction (standard)
//
// Privy is auth-only. The wallet adapter handles all on-chain ops.
// ============================================================

export interface PrivyWallet {
  wallet: ConnectedWallet | null;
  publicKey: PublicKey | null;
  signTransaction: ((tx: Transaction) => Promise<Transaction>) | null;
  connected: boolean;         // authenticated via Privy
  walletReady: boolean;       // has a connected Solana wallet
  login: () => void;
  logout: () => Promise<void>;
  user: ReturnType<typeof usePrivy>['user'];
  displayName: string;
}

const PrivyWalletContext = createContext<PrivyWallet | undefined>(undefined);

function WalletInner({ children }: { children: ReactNode }) {
  const { user, authenticated, ready } = usePrivy();
  const { login } = useLogin();
  const { logout } = useLogout();

  // Wallet state from the standard adapter (Phantom/Solflare)
  const {
    publicKey: adapterPublicKey,
    connected: walletConnected,
    signTransaction: adapterSign,
  } = useWallet();

  const publicKey = useMemo(() => {
    if (!adapterPublicKey) return null;
    try { return new PublicKey(adapterPublicKey.toBase58()); } catch { return null; }
  }, [adapterPublicKey]);

  const signTransaction = useMemo(() => {
    if (!adapterSign || !publicKey) return null;
    return async (tx: Transaction): Promise<Transaction> => {
      const signed = await adapterSign(tx as Transaction & VersionedTransaction);
      return signed as unknown as Transaction;
    };
  }, [adapterSign, publicKey]);

  const displayName = useMemo(() => {
    if (!ready || !authenticated) return 'Anon';
    if (user?.email?.address) return user.email.address.split('@')[0];
    if (user?.google?.name)   return user.google.name.split(' ')[0];
    if (user?.twitter?.username) return `@${user.twitter.username}`;
    if (publicKey) {
      const addr = publicKey.toBase58();
      return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
    }
    return 'Player';
  }, [ready, authenticated, user, publicKey]);

  const value: PrivyWallet = useMemo(() => ({
    wallet: null,
    publicKey,
    signTransaction,
    connected: authenticated,
    walletReady: walletConnected && !!publicKey,
    login,
    logout,
    user,
    displayName,
  }), [publicKey, signTransaction, authenticated, walletConnected, login, logout, user, displayName]);

  return (
    <PrivyWalletContext.Provider value={value}>
      {children}
    </PrivyWalletContext.Provider>
  );
}

export const PrivyWalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <_PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#C4FF3C',
          logo: 'https://transparent-five.vercel.app/logo.svg',
          showWalletLoginFirst: false,
        },
        loginMethods: ['email', 'google', 'apple'],
      }}
    >
      <WalletInner>{children}</WalletInner>
    </_PrivyProvider>
  );
};

export function usePrivyWallet(): PrivyWallet {
  const ctx = useContext(PrivyWalletContext);
  if (!ctx) throw new Error('usePrivyWallet must be used within PrivyWalletProvider');
  return ctx;
}
