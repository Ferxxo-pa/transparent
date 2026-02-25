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
  useSignAndSendTransaction,
} from '@privy-io/react-auth/solana';
import { PublicKey, Transaction, Connection } from '@solana/web3.js';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import { PRIVY_APP_ID, SOLANA_RPC } from '../lib/config';

// ============================================================
// PURE PRIVY — no wallet adapter
//
// Login → wallet auto-created or connected via Privy modal.
// Email/Google/Apple users → embedded Solana wallet (auto)
// Phantom/Solflare users  → connected via Privy's wallet login
//
// Signing: useSignTransaction for sign-only
// Sending: useSignAndSendTransaction for sign+send (handles Privy modal)
// ============================================================

const connection = new Connection(SOLANA_RPC, 'confirmed');

export interface PrivyWallet {
  publicKey: PublicKey | null;
  address: string | null;
  signTransaction: ((tx: Transaction) => Promise<Transaction>) | null;
  signAndSendTransaction: ((tx: Transaction) => Promise<string>) | null;
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
  const { signAndSendTransaction: privySignAndSend } = useSignAndSendTransaction();

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

  // Sign-only (returns signed tx, caller sends manually)
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

  // Sign + Send (Privy handles everything, returns tx signature)
  const signAndSendTransaction = useMemo(() => {
    if (!activeWallet || !publicKey) return null;
    return async (tx: Transaction): Promise<string> => {
      const serialized = tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
      const result = await privySignAndSend({
        transaction: serialized,
        wallet: activeWallet,
        chain: 'solana:devnet',
      });
      // result.signature is a Uint8Array, convert to base58 string
      const bs58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
      let sig: string;
      if (typeof result.signature === 'string') {
        sig = result.signature;
      } else {
        // Uint8Array → base58
        const bytes = result.signature;
        let num = BigInt(0);
        for (const b of bytes) num = num * 256n + BigInt(b);
        sig = '';
        while (num > 0n) {
          sig = bs58Chars[Number(num % 58n)] + sig;
          num = num / 58n;
        }
        for (const b of bytes) {
          if (b === 0) sig = '1' + sig;
          else break;
        }
      }
      return sig;
    };
  }, [activeWallet, publicKey, privySignAndSend]);

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
    signAndSendTransaction,
    connected: authenticated,
    walletReady: !!publicKey && !!signTransaction,
    walletType,
    login,
    logout,
    user,
    displayName,
    connection,
  }), [publicKey, activeWallet?.address, signTransaction, signAndSendTransaction, authenticated, walletType, login, logout, user, displayName]);

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
          showWalletLoginFirst: false,
          walletChainType: 'solana-only',
          walletList: ['phantom', 'solflare'],
        },
        loginMethods: ['email', 'google', 'apple', 'wallet'],
        embeddedWallets: {
          solana: {
            createOnLogin: 'all-users',
          },
        },
        solana: {
          rpcs: {
            'solana:mainnet': {
              rpc: createSolanaRpc(SOLANA_RPC),
              rpcSubscriptions: createSolanaRpcSubscriptions(SOLANA_RPC.replace('https', 'wss')),
            },
            'solana:devnet': {
              rpc: createSolanaRpc(SOLANA_RPC),
              rpcSubscriptions: createSolanaRpcSubscriptions(SOLANA_RPC.replace('https', 'wss')),
            },
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
