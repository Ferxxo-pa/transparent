import React, { createContext, useContext, useEffect, useMemo, ReactNode } from 'react';
import {
  PrivyProvider as _PrivyProvider,
  usePrivy,
  useLogin,
  useLogout,
  type ConnectedWallet,
} from '@privy-io/react-auth';
import {
  toSolanaWalletConnectors,
  useCreateWallet,
  useWallets as useSolanaWallets,
} from '@privy-io/react-auth/solana';
import { PublicKey, Transaction } from '@solana/web3.js';
import { PRIVY_APP_ID } from '../lib/config';

// ============================================================
// Privy v3 Context — embedded wallets + social login
// ============================================================

export interface PrivyWallet {
  wallet: ConnectedWallet | null;
  publicKey: PublicKey | null;
  signTransaction: ((tx: Transaction) => Promise<Transaction>) | null;
  connected: boolean;    // true when authenticated (gates navigation/UI)
  walletReady: boolean;  // true when publicKey is available (gates on-chain ops)
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

  // Use the Solana-specific useWallets — only returns actual Solana wallets
  // (embedded Solana + external Phantom/Solflare), NOT Ethereum wallets
  const { wallets: solanaWallets, ready: solanaReady } = useSolanaWallets();
  const { createWallet: createSolanaWallet } = useCreateWallet();

  // Auto-create Solana embedded wallet if none exists after login
  useEffect(() => {
    if (!ready || !authenticated || !solanaReady) return;
    if (solanaWallets.length === 0) {
      createSolanaWallet().catch(() => {
        // Fails silently (user already has one, or dismissed modal)
      });
    }
  }, [ready, authenticated, solanaReady, solanaWallets.length]);

  // Pick the first available Solana wallet
  const solanaWallet = solanaWallets[0] ?? null;

  const publicKey = useMemo(() => {
    if (!solanaWallet?.address) return null;
    try { return new PublicKey(solanaWallet.address); } catch { return null; }
  }, [solanaWallet?.address]);

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

  // Bridge Standard Wallet signTransaction (Uint8Array) → web3.js Transaction
  const signTransaction = useMemo(() => {
    if (!solanaWallet || !publicKey) return null;
    return async (tx: Transaction): Promise<Transaction> => {
      // Serialize to Uint8Array (Standard Wallet interface)
      const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      const result = await solanaWallet.signTransaction({ transaction: serialized });
      return Transaction.from(result.signedTransaction);
    };
  }, [solanaWallet, publicKey]);

  const value: PrivyWallet = useMemo(() => ({
    wallet: solanaWallet as any,
    publicKey,
    signTransaction,
    connected: authenticated,
    walletReady: !!publicKey,
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

// ── Root provider ─────────────────────────────────────────────

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
