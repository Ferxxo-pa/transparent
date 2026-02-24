import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import {
  PrivyProvider as _PrivyProvider,
  usePrivy,
  useLogin,
  useLogout,
  type ConnectedWallet,
} from '@privy-io/react-auth';
import {
  toSolanaWalletConnectors,
  useWallets as useSolanaWallets,
  useSignTransaction,
  useCreateWallet,
} from '@privy-io/react-auth/solana';
import { PublicKey, Transaction } from '@solana/web3.js';
import { PRIVY_APP_ID } from '../lib/config';

// ============================================================
// Full Privy-native Solana setup:
//
//   Auth:    Privy login (email / Google / Apple / wallet)
//   Wallet:  useWallets() from @privy-io/react-auth/solana
//            → returns BOTH embedded AND external (Phantom/Solflare)
//   Connect: connectWallet() from usePrivy() — shows Phantom/Solflare picker
//   Sign:    useSignTransaction() from @privy-io/react-auth/solana
//   Create:  useCreateWallet() — manual embedded wallet creation
//
// No @solana/wallet-adapter-react needed.
// ============================================================

export interface PrivyWallet {
  wallet: ConnectedWallet | null;
  publicKey: PublicKey | null;
  signTransaction: ((tx: Transaction) => Promise<Transaction>) | null;
  connected: boolean;         // authenticated via Privy
  walletReady: boolean;       // has a usable Solana wallet
  login: () => void;
  logout: () => Promise<void>;
  connectPhantom: () => void; // prompt Phantom/Solflare connection
  createEmbedded: () => Promise<void>; // create Privy embedded wallet
  user: ReturnType<typeof usePrivy>['user'];
  displayName: string;
}

const PrivyWalletContext = createContext<PrivyWallet | undefined>(undefined);

function WalletInner({ children }: { children: ReactNode }) {
  const { user, authenticated, ready, connectWallet } = usePrivy();
  const { login } = useLogin();
  const { logout } = useLogout();

  // All Solana wallets — embedded AND external (Phantom/Solflare)
  const { wallets } = useSolanaWallets();
  const { signTransaction: privySign } = useSignTransaction();
  const { createWallet } = useCreateWallet();

  // Pick best wallet: prefer external (Phantom) if available, else embedded
  const activeWallet = useMemo(() => {
    if (!wallets.length) return null;
    const external = wallets.find(w => w.walletClientType !== 'privy');
    return external ?? wallets[0];
  }, [wallets]);

  const publicKey = useMemo(() => {
    if (!activeWallet?.address) return null;
    try { return new PublicKey(activeWallet.address); } catch { return null; }
  }, [activeWallet?.address]);

  const signTransaction = useMemo(() => {
    if (!activeWallet || !publicKey) return null;
    return async (tx: Transaction): Promise<Transaction> => {
      const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      const { signedTransaction } = await privySign({
        transaction: serialized,
        wallet: activeWallet,
      });
      return Transaction.from(signedTransaction);
    };
  }, [activeWallet, publicKey, privySign]);

  const connectPhantom = () => {
    connectWallet({ walletList: ['phantom', 'solflare', 'detected_wallets'] });
  };

  const createEmbedded = async () => {
    try { await createWallet(); } catch { /* already exists */ }
  };

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
    walletReady: !!publicKey && !!signTransaction,
    login,
    logout,
    connectPhantom,
    createEmbedded,
    user,
    displayName,
  }), [publicKey, signTransaction, authenticated, login, logout, user, displayName]);

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
          // Auto-create Solana embedded wallet on login (silent, no UI prompt)
          solana: { createOnLogin: 'users-without-wallets' },
        },
        externalWallets: {
          solana: {
            // shouldAutoConnect: true auto-reconnects Phantom on page load
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
