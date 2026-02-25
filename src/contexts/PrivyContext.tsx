import React, { createContext, useContext, useMemo, useCallback, ReactNode } from 'react';
import {
  PrivyProvider as _PrivyProvider,
  usePrivy,
  useLogin,
  useLogout,
} from '@privy-io/react-auth';
import {
  useWallets as useSolanaWallets,
  useSignTransaction,
  toSolanaWalletConnectors,
} from '@privy-io/react-auth/solana';
import { PublicKey, Transaction, Connection } from '@solana/web3.js';
import { PRIVY_APP_ID, SOLANA_RPC } from '../lib/config';

// ============================================================
// PURE PRIVY — no wallet adapter
//
// Login → wallet auto-created or connected via Privy modal.
// Email/Google/Apple users → embedded Solana wallet (auto)
// Phantom/Solflare users  → connected via Privy's wallet login
//
// All signing via useSignTransaction() from @privy-io/react-auth/solana
// ============================================================

const connection = new Connection(SOLANA_RPC, 'confirmed');

export interface PrivyWallet {
  publicKey: PublicKey | null;
  address: string | null;
  signTransaction: ((tx: Transaction) => Promise<Transaction>) | null;
  connected: boolean;
  walletReady: boolean;
  walletType: 'embedded' | 'external' | null;
  login: () => void;
  logout: () => Promise<void>;
  user: ReturnType<typeof usePrivy>['user'];
  displayName: string;
  connection: Connection;
}

const PrivyWalletContext = createContext<PrivyWallet | undefined>(undefined);

function WalletInner({ children }: { children: ReactNode }) {
  const { user, authenticated, ready } = usePrivy();
  const { login } = useLogin();
  const { logout } = useLogout();

  // All Solana wallets managed by Privy (embedded + connected external)
  const { wallets } = useSolanaWallets();
  const { signTransaction: privySign } = useSignTransaction();

  // Pick the best wallet: prefer embedded (always available), fallback to external
  const activeWallet = useMemo(() => {
    if (!wallets.length) return null;
    return wallets.find(w => w.walletClientType === 'privy')
      ?? wallets[0];
  }, [wallets]);

  const publicKey = useMemo((): PublicKey | null => {
    if (!activeWallet?.address) return null;
    try { return new PublicKey(activeWallet.address); }
    catch { return null; }
  }, [activeWallet?.address]);

  const walletType = useMemo((): 'embedded' | 'external' | null => {
    if (!activeWallet) return null;
    return activeWallet.walletClientType === 'privy' ? 'embedded' : 'external';
  }, [activeWallet]);

  const signTransaction = useMemo(() => {
    if (!activeWallet || !publicKey) return null;
    return async (tx: Transaction): Promise<Transaction> => {
      const serialized = tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
      const { signedTransaction } = await privySign({
        transaction: serialized,
        wallet: activeWallet,
      });
      return Transaction.from(signedTransaction);
    };
  }, [activeWallet, publicKey, privySign]);

  const displayName = useMemo(() => {
    if (!ready || !authenticated) return 'Anon';
    if (user?.email?.address) return user.email.address.split('@')[0];
    if (user?.google?.name) return user.google.name.split(' ')[0];
    if (user?.apple?.email) return user.apple.email.split('@')[0];
    if (user?.twitter?.username) return `@${user.twitter.username}`;
    if (publicKey) {
      const addr = publicKey.toBase58();
      return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
    }
    return 'Player';
  }, [ready, authenticated, user, publicKey]);

  const value: PrivyWallet = useMemo(() => ({
    publicKey,
    address: activeWallet?.address ?? null,
    signTransaction,
    connected: authenticated,
    walletReady: !!publicKey && !!signTransaction,
    walletType,
    login,
    logout,
    user,
    displayName,
    connection,
  }), [publicKey, activeWallet?.address, signTransaction, authenticated, walletType, login, logout, user, displayName]);

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
          walletChainType: 'solana-only',
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
