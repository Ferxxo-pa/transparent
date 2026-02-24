import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import {
  PrivyProvider as _PrivyProvider,
  usePrivy,
  useLogin,
  useWallets,
  useLogout,
  getEmbeddedConnectedWallet,
  type ConnectedWallet,
} from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { PublicKey, Transaction } from '@solana/web3.js';
import { PRIVY_APP_ID } from '../lib/config';

// ============================================================
// Privy v3 Context — embedded wallets + social login
// Maintains same interface as wallet-adapter version
// ============================================================

export interface PrivyWallet {
  wallet: ConnectedWallet | null;
  publicKey: PublicKey | null;
  signTransaction: ((tx: Transaction) => Promise<Transaction>) | null;
  connected: boolean;
  login: () => void;
  logout: () => Promise<void>;
  user: ReturnType<typeof usePrivy>['user'];
  displayName: string;
}

const PrivyWalletContext = createContext<PrivyWallet | undefined>(undefined);

// ── Inner component (has access to Privy hooks) ───────────────

function WalletInner({ children }: { children: ReactNode }) {
  const { user, authenticated, ready } = usePrivy();
  const { login } = useLogin();
  const { logout } = useLogout();
  const { wallets } = useWallets();

  // Prefer embedded wallet, fall back to first connected Solana wallet
  const solanaWallet = useMemo(() => {
    if (!wallets.length) return null;
    const embedded = getEmbeddedConnectedWallet(wallets);
    if (embedded) return embedded;
    return wallets.find(w => w.type === 'solana') ?? wallets[0] ?? null;
  }, [wallets]);

  const publicKey = useMemo(() => {
    if (!solanaWallet?.address) return null;
    try { return new PublicKey(solanaWallet.address); } catch { return null; }
  }, [solanaWallet?.address]);

  const displayName = useMemo(() => {
    if (!ready || !authenticated) return 'Anon';
    if (user?.email?.address) return user.email.address.split('@')[0];
    if (user?.google?.name)  return user.google.name.split(' ')[0];
    if (user?.twitter?.username) return `@${user.twitter.username}`;
    if (publicKey) {
      const addr = publicKey.toBase58();
      return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
    }
    return 'Player';
  }, [ready, authenticated, user, publicKey]);

  const signTransaction = useMemo(() => {
    if (!solanaWallet) return null;
    return async (tx: Transaction): Promise<Transaction> => {
      // Privy v3 signTransaction accepts a Transaction and returns it signed
      const signed = await (solanaWallet as any).signTransaction(tx);
      return signed as Transaction;
    };
  }, [solanaWallet]);

  const value: PrivyWallet = useMemo(() => ({
    wallet: solanaWallet,
    publicKey,
    signTransaction,
    connected: authenticated && !!publicKey,
    login,
    logout,
    user,
    displayName,
  }), [solanaWallet, publicKey, signTransaction, authenticated, login, logout, user, displayName]);

  return (
    <PrivyWalletContext.Provider value={value}>
      {children}
    </PrivyWalletContext.Provider>
  );
}

// ── Root provider (wraps with PrivyProvider) ──────────────────

export const PrivyWalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <_PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#C4FF3C',
          logo: 'https://transparent-five.vercel.app/favicon.png',
          showWalletLoginFirst: false,
          walletList: ['phantom', 'solflare', 'detected_wallets'],
        },
        loginMethods: ['email', 'google', 'apple', 'wallet'],
        embeddedWallets: {
          solana: {
            createOnLogin: 'all-users',
          },
        },
        externalWallets: {
          solana: {
            connectors: toSolanaWalletConnectors({ shouldAutoConnect: true }),
          },
        },
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
