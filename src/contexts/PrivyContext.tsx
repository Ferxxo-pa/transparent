import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import {
  PrivyProvider as _PrivyProvider,
  usePrivy,
  useLogin,
  useLogout,
} from '@privy-io/react-auth';
import {
  useWallets as useSolanaWallets,
  useSignAndSendTransaction,
} from '@privy-io/react-auth/solana';
import { PublicKey, Transaction, Connection } from '@solana/web3.js';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import { PRIVY_APP_ID, SOLANA_RPC } from '../lib/config';

// ============================================================
// Privy v3 Solana Integration
//
// Official API: useSignAndSendTransaction from @privy-io/react-auth/solana
// Expects Uint8Array (wire-encoded transaction), NOT Transaction objects.
// Privy signs + sends via its configured RPC in one call.
// ============================================================

const wssUrl = SOLANA_RPC.replace('https', 'wss');
const connection = new Connection(SOLANA_RPC, 'confirmed');

export interface PrivyWallet {
  publicKey: PublicKey | null;
  address: string | null;
  sendTransaction: ((tx: Transaction) => Promise<string>) | null;
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

  const { wallets } = useSolanaWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();

  const activeWallet = useMemo(() => {
    if (!wallets.length) return null;
    // Prefer the Privy embedded wallet
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

  // Bridge: takes web3.js Transaction, serializes to Uint8Array, calls Privy signAndSendTransaction
  const sendTransaction = useMemo(() => {
    if (!activeWallet || !publicKey) return null;
    return async (tx: Transaction): Promise<string> => {
      // Ensure tx has blockhash and fee payer
      if (!tx.recentBlockhash) {
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        tx.recentBlockhash = blockhash;
      }
      if (!tx.feePayer) {
        tx.feePayer = publicKey;
      }

      // Serialize to Uint8Array (wire format) — this is what Privy v3 expects
      const serialized = tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });


      const result = await signAndSendTransaction({
        transaction: serialized,
        wallet: activeWallet,
        chain: 'solana:devnet',
      } as any);

      const sig = result.signature;
      // Confirmation handled by caller (anchor.ts buildAndSend)
      return sig;
    };
  }, [activeWallet, publicKey, signAndSendTransaction]);

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
    sendTransaction,
    connected: authenticated,
    walletReady: !!publicKey && !!sendTransaction,
    walletType,
    login,
    logout,
    user,
    displayName,
    connection,
  }), [publicKey, activeWallet?.address, sendTransaction, authenticated, walletType, login, logout, user, displayName]);

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
        },
        loginMethods: ['email'],
        embeddedWallets: {
          solana: {
            createOnLogin: 'all-users',
          },
        },
        solana: {
          rpcs: {
            'solana:devnet': {
              rpc: createSolanaRpc(SOLANA_RPC),
              rpcSubscriptions: createSolanaRpcSubscriptions(wssUrl),
            },
            'solana:mainnet': {
              rpc: createSolanaRpc(SOLANA_RPC),
              rpcSubscriptions: createSolanaRpcSubscriptions(wssUrl),
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
