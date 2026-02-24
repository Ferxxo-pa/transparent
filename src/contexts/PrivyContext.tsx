import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import {
  PrivyProvider as _PrivyProvider,
  usePrivy,
  useLogin,
  useLogout,
  type ConnectedWallet,
} from '@privy-io/react-auth';
import {
  useWallets as useSolanaWallets,
  useSignTransaction,
  useCreateWallet,
} from '@privy-io/react-auth/solana';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { PRIVY_APP_ID } from '../lib/config';

// ============================================================
// Auth:   Privy modal — email / Google / Apple / Phantom login
// Wallet:
//   Path A — Login with Phantom via Privy modal
//             → wallet adapter picks it up via autoConnect
//   Path B — Login with email/social
//             → Privy auto-creates embedded Solana wallet
//             → signing via Privy's useSignTransaction()
//
// Priority: adapter (Phantom) > Privy embedded wallet
// ============================================================

export type WalletType = 'external' | 'embedded' | null;

export interface PrivyWallet {
  wallet: ConnectedWallet | null;
  publicKey: PublicKey | null;
  signTransaction: ((tx: Transaction) => Promise<Transaction>) | null;
  connected: boolean;         // authenticated via Privy
  walletReady: boolean;       // has a usable Solana wallet
  walletType: WalletType;
  login: () => void;
  logout: () => Promise<void>;
  connectPhantom: () => void;
  createEmbeddedWallet: () => Promise<void>;
  user: ReturnType<typeof usePrivy>['user'];
  displayName: string;
}

const PrivyWalletContext = createContext<PrivyWallet | undefined>(undefined);

function WalletInner({ children }: { children: ReactNode }) {
  const { user, authenticated, ready, connectWallet } = usePrivy();
  const { login } = useLogin();
  const { logout } = useLogout();

  // ── Privy embedded Solana wallets ──────────────────────
  const { wallets: privyWallets } = useSolanaWallets();
  const { signTransaction: privySign } = useSignTransaction();
  const { createWallet } = useCreateWallet();

  // The first privy-managed wallet (embedded or Privy-linked)
  const privyWallet = useMemo(
    () => privyWallets.find(w => w.walletClientType === 'privy') ?? null,
    [privyWallets],
  );

  // ── Wallet Adapter (Phantom / Solflare) ────────────────
  const {
    publicKey: adapterPubkey,
    connected: adapterConnected,
    signTransaction: adapterSign,
  } = useWallet();

  // ── Resolve active wallet ──────────────────────────────
  // Prefer adapter (Phantom) if connected, else fall back to embedded
  const walletType: WalletType = useMemo(() => {
    if (adapterConnected && adapterPubkey) return 'external';
    if (privyWallet?.address) return 'embedded';
    return null;
  }, [adapterConnected, adapterPubkey, privyWallet]);

  const publicKey = useMemo((): PublicKey | null => {
    try {
      if (walletType === 'external' && adapterPubkey)
        return new PublicKey(adapterPubkey.toBase58());
      if (walletType === 'embedded' && privyWallet?.address)
        return new PublicKey(privyWallet.address);
    } catch { /* bad key */ }
    return null;
  }, [walletType, adapterPubkey, privyWallet?.address]);

  const signTransaction = useMemo(() => {
    if (!publicKey) return null;

    if (walletType === 'external' && adapterSign) {
      // Adapter (Phantom) signing
      return async (tx: Transaction): Promise<Transaction> => {
        const signed = await adapterSign(tx as Transaction & VersionedTransaction);
        return signed as unknown as Transaction;
      };
    }

    if (walletType === 'embedded' && privyWallet) {
      // Privy embedded wallet signing
      return async (tx: Transaction): Promise<Transaction> => {
        const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
        const { signedTransaction } = await privySign({
          transaction: serialized,
          wallet: privyWallet,
        });
        return Transaction.from(signedTransaction);
      };
    }

    return null;
  }, [walletType, publicKey, adapterSign, privySign, privyWallet]);

  const connectPhantom = () => {
    connectWallet({ walletList: ['phantom', 'solflare'] });
  };

  const createEmbeddedWallet = async () => {
    try { await createWallet(); } catch { /* already exists */ }
  };

  const displayName = useMemo(() => {
    if (!ready || !authenticated) return 'Anon';
    if (user?.email?.address) return user.email.address.split('@')[0];
    if (user?.google?.name)   return user.google.name.split(' ')[0];
    if (user?.apple?.email)   return user.apple.email.split('@')[0];
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
    walletType,
    login,
    logout,
    connectPhantom,
    createEmbeddedWallet,
    user,
    displayName,
  }), [publicKey, signTransaction, authenticated, walletType, login, logout, user, displayName]);

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
