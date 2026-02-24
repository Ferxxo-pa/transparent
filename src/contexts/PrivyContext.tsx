import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import {
  PrivyProvider as _PrivyProvider,
  usePrivy,
  useLogin,
  useLogout,
  type ConnectedWallet,
} from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { PRIVY_APP_ID } from '../lib/config';

// ============================================================
// Privy handles AUTH (login/identity).
// Wallet adapter handles WALLET (publicKey, signTransaction).
// ============================================================

export interface PrivyWallet {
  wallet: ConnectedWallet | null;
  publicKey: PublicKey | null;
  signTransaction: ((tx: Transaction) => Promise<Transaction>) | null;
  connected: boolean;    // true when authenticated via Privy
  walletReady: boolean;  // true when Solana wallet is connected via wallet adapter
  login: () => void;
  logout: () => Promise<void>;
  setupWallet: () => Promise<void>;
  user: ReturnType<typeof usePrivy>['user'];
  displayName: string;
}

const PrivyWalletContext = createContext<PrivyWallet | undefined>(undefined);

function WalletInner({ children }: { children: ReactNode }) {
  const { user, authenticated, ready } = usePrivy();
  const { login } = useLogin();
  const { logout } = useLogout();

  // Wallet adapter — source of truth for Solana wallet
  const { publicKey: adapterPubkey, signTransaction: adapterSign, connected: walletConnected } = useWallet();

  const publicKey = adapterPubkey ?? null;

  const signTransaction = useMemo(() => {
    if (!adapterSign || !publicKey) return null;
    return async (tx: Transaction): Promise<Transaction> => {
      const signed = await adapterSign(tx);
      return signed;
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

  // setupWallet: open wallet adapter modal (noop — handled by WalletSetupGate UI)
  const setupWallet = async () => {};

  const value: PrivyWallet = useMemo(() => ({
    wallet: null,
    publicKey,
    signTransaction,
    connected: authenticated,
    walletReady: walletConnected && !!publicKey,
    login,
    logout,
    setupWallet,
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
          walletChainType: 'solana-only',
          walletList: ['phantom', 'solflare', 'detected_wallets'],
        },
        loginMethods: ['email', 'google', 'apple', 'wallet'],
        embeddedWallets: {
          solana: { createOnLogin: 'off' },
        },
        externalWallets: {
          solana: {
            connectors: toSolanaWalletConnectors({ shouldAutoConnect: false }),
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
