import React, { createContext, useContext, useMemo, useCallback, ReactNode } from 'react';
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth';
import { PublicKey, Transaction } from '@solana/web3.js';
import { PRIVY_APP_ID } from '../lib/config';

// ============================================================
// Privy Wallet Context — Solana-first auth & wallet management
// ============================================================

export interface PrivyWallet {
  wallet: ReturnType<typeof useWallets>['wallets'][0] | null;
  publicKey: PublicKey | null;
  signTransaction: ((tx: Transaction) => Promise<Transaction>) | null;
  connected: boolean;
  login: () => void;
  logout: () => Promise<void>;
  user: ReturnType<typeof usePrivy>['user'];
  displayName: string;
}

const PrivyWalletContext = createContext<PrivyWallet | undefined>(undefined);

// ── Inner hook that consumes Privy after the provider is mounted ─

function PrivyWalletInner({ children }: { children: ReactNode }) {
  const { login, logout, authenticated, user, ready } = usePrivy();
  const { wallets } = useWallets();

  // Find the first Solana wallet (embedded or external)
  const solanaWallet = useMemo(() => {
    if (!wallets.length) return null;
    // Prefer embedded wallet, fall back to first available
    const embedded = wallets.find((w) => w.walletClientType === 'privy');
    return embedded ?? wallets[0] ?? null;
  }, [wallets]);

  const publicKey = useMemo(() => {
    if (!solanaWallet?.address) return null;
    try {
      return new PublicKey(solanaWallet.address);
    } catch {
      return null;
    }
  }, [solanaWallet]);

  const signTransaction = useCallback(
    async (tx: Transaction): Promise<Transaction> => {
      if (!solanaWallet) throw new Error('No wallet connected');
      // Privy wallets expose signTransaction on the wallet object or provider
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = solanaWallet as any;
      if (typeof w.signTransaction === 'function') {
        return w.signTransaction(tx) as Promise<Transaction>;
      }
      // Try getting the provider
      if (typeof solanaWallet.getEthereumProvider === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const provider: any = await solanaWallet.getEthereumProvider();
        if (typeof provider.signTransaction === 'function') {
          return provider.signTransaction(tx) as Promise<Transaction>;
        }
      }
      throw new Error('Wallet does not support signTransaction');
    },
    [solanaWallet],
  );

  const displayName = useMemo(() => {
    if (user?.email?.address) return user.email.address;
    if (user?.google?.email) return user.google.email;
    if (user?.twitter?.username) return `@${user.twitter.username}`;
    if (publicKey) {
      const addr = publicKey.toBase58();
      return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
    }
    return 'Anon';
  }, [user, publicKey]);

  const value: PrivyWallet = useMemo(
    () => ({
      wallet: solanaWallet,
      publicKey,
      signTransaction: solanaWallet ? signTransaction : null,
      connected: authenticated && ready && !!solanaWallet,
      login,
      logout,
      user: user ?? null,
      displayName,
    }),
    [solanaWallet, publicKey, signTransaction, authenticated, ready, login, logout, user, displayName],
  );

  return (
    <PrivyWalletContext.Provider value={value}>
      {children}
    </PrivyWalletContext.Provider>
  );
}

// ── Exported Provider ───────────────────────────────────────

export const PrivyWalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#664FFB',
          walletChainType: 'solana-only',
        },
        loginMethods: ['email', 'google', 'twitter', 'wallet'],
        embeddedWallets: {
          solana: {
            createOnLogin: 'users-without-wallets',
          },
        },
      }}
    >
      <PrivyWalletInner>{children}</PrivyWalletInner>
    </PrivyProvider>
  );
};

// ── Hook ────────────────────────────────────────────────────

export function usePrivyWallet(): PrivyWallet {
  const ctx = useContext(PrivyWalletContext);
  if (!ctx) {
    throw new Error('usePrivyWallet must be used within PrivyWalletProvider');
  }
  return ctx;
}
