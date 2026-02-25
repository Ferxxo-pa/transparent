import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import {
  PrivyProvider as _PrivyProvider,
  usePrivy,
  useLogin,
  useLogout,
} from '@privy-io/react-auth';
import {
  useWallets as useSolanaWallets,
  useSignTransaction,
} from '@privy-io/react-auth/solana';
import { PublicKey, Transaction, Connection } from '@solana/web3.js';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import { PRIVY_APP_ID, SOLANA_RPC } from '../lib/config';

const wssUrl = SOLANA_RPC.replace('https', 'wss');

// ============================================================
// PURE PRIVY
//
// Strategy: useSignTransaction with uiOptions.showWalletUIs = false
// to sign headlessly, then manually send via our Helius Connection.
// If headless fails, fall back to normal sign (shows modal).
// ============================================================

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
  const { signTransaction: privySign } = useSignTransaction();

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

  // Sign headlessly via useSignTransaction, then send manually via our Connection
  const sendTransaction = useMemo(() => {
    if (!activeWallet || !publicKey) return null;
    return async (tx: Transaction): Promise<string> => {
      const serialized = tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });

      console.log('[PrivyWallet] Signing transaction headlessly...');

      // Try headless first (no UI), fall back to normal (with UI)
      let signedTransaction: Uint8Array;
      try {
        const result = await privySign({
          transaction: serialized,
          wallet: activeWallet,
          chain: 'solana:devnet',
          options: { uiOptions: { showWalletUIs: false } },
        } as any);
        signedTransaction = result.signedTransaction;
        console.log('[PrivyWallet] Headless sign succeeded');
      } catch (headlessErr) {
        console.warn('[PrivyWallet] Headless sign failed, trying with UI:', headlessErr);
        const result = await privySign({
          transaction: serialized,
          wallet: activeWallet,
          chain: 'solana:devnet',
        });
        signedTransaction = result.signedTransaction;
        console.log('[PrivyWallet] UI sign succeeded');
      }

      const signedTx = Transaction.from(signedTransaction);

      console.log('[PrivyWallet] Sending via Helius RPC...');
      const sig = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      console.log('[PrivyWallet] Tx sent:', sig);

      // Confirm
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        'confirmed',
      );

      console.log('[PrivyWallet] Tx confirmed:', sig);
      return sig;
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
