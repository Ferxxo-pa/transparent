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
} from '@privy-io/react-auth/solana';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { PRIVY_APP_ID } from '../lib/config';

// ============================================================
// Auth:   Privy (email / Google / Apple / wallet login)
// Wallet: wallet adapter (Phantom/Solflare) takes priority.
//         Falls back to Privy embedded Solana wallet for
//         email/social users who don't have Phantom installed.
// ============================================================

export interface PrivyWallet {
  wallet: ConnectedWallet | null;
  publicKey: PublicKey | null;
  signTransaction: ((tx: Transaction) => Promise<Transaction>) | null;
  connected: boolean;
  walletReady: boolean;
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

  // ── Privy embedded Solana wallet ──────────────────────────
  const { wallets: privyWallets } = useSolanaWallets();
  const { signTransaction: privySignTx } = useSignTransaction();
  const privyWallet = privyWallets[0] ?? null;

  // ── Wallet adapter (Phantom / Solflare) ───────────────────
  const {
    publicKey: adapterPubkey,
    signTransaction: adapterSignTx,
    connected: adapterConnected,
  } = useWallet();

  // Wallet adapter takes priority; Privy embedded is fallback
  const publicKey = useMemo(() => {
    if (adapterConnected && adapterPubkey) return adapterPubkey;
    if (privyWallet?.address) {
      try { return new PublicKey(privyWallet.address); } catch { return null; }
    }
    return null;
  }, [adapterConnected, adapterPubkey, privyWallet?.address]);

  const signTransaction = useMemo(() => {
    // Wallet adapter path
    if (adapterConnected && adapterSignTx && adapterPubkey) {
      return async (tx: Transaction): Promise<Transaction> => adapterSignTx(tx);
    }
    // Privy embedded wallet path
    if (privyWallet && publicKey) {
      return async (tx: Transaction): Promise<Transaction> => {
        const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
        const { signedTransaction } = await privySignTx({
          transaction: serialized,
          wallet: privyWallet,
        });
        return Transaction.from(signedTransaction);
      };
    }
    return null;
  }, [adapterConnected, adapterSignTx, adapterPubkey, privyWallet, publicKey, privySignTx]);

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

  const setupWallet = async () => {};

  const walletReady = !!(publicKey && signTransaction);

  const value: PrivyWallet = useMemo(() => ({
    wallet: null,
    publicKey,
    signTransaction,
    connected: authenticated,
    walletReady,
    login,
    logout,
    setupWallet,
    user,
    displayName,
  }), [publicKey, signTransaction, authenticated, walletReady, login, logout, user, displayName]);

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
          // Auto-create embedded Solana wallet for email/social users
          solana: { createOnLogin: 'users-without-wallets' },
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
