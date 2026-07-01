import React, { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import {
  PrivyProvider as _PrivyProvider,
  usePrivy,
  useLogin,
  useLogout,
} from '@privy-io/react-auth';
import {
  useWallets as useSolanaWallets,
  useSignAndSendTransaction,
  useSignMessage as useSolanaSignMessage,
} from '@privy-io/react-auth/solana';
import { PublicKey, Transaction, Connection } from '@solana/web3.js';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import { PRIVY_APP_ID, SOLANA_RPC, SOLANA_NETWORK } from '../lib/config';

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
  signMessage: ((message: Uint8Array) => Promise<Uint8Array>) | null;
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
  const { signMessage: privySignMessage } = useSolanaSignMessage();
  const [walletStabilized, setWalletStabilized] = useState(false);
  const walletStabilizedRef = useRef(false); // mirrors walletStabilized state for use inside async closures
  const walletWarmupRef = useRef<Promise<void> | null>(null);

  const activeWallet = useMemo(() => {
    if (!wallets.length) return null;
    // Prefer the Privy embedded wallet
    return wallets.find(w => (w as { walletClientType?: string }).walletClientType === 'privy')
      ?? wallets[0];
  }, [wallets]);

  const publicKey = useMemo((): PublicKey | null => {
    if (!activeWallet?.address) return null;
    try { return new PublicKey(activeWallet.address); }
    catch { return null; }
  }, [activeWallet?.address]);

  const walletType = useMemo((): 'embedded' | 'external' | null => {
    if (!activeWallet) return null;
    return (activeWallet as { walletClientType?: string }).walletClientType === 'privy' ? 'embedded' : 'external';
  }, [activeWallet]);

  useEffect(() => {
    if (!activeWallet?.address || !publicKey) {
      setWalletStabilized(false);
      walletWarmupRef.current = null;
      return;
    }

    let cancelled = false;
    walletStabilizedRef.current = false;

    const warmup = (async () => {
      try {
        // Give Privy a longer window to finish provisioning the embedded wallet.
        // Privy's key-derivation for embedded wallets can take 800–1500ms after
        // the wallet object first appears in `useWallets()`. Without this wait,
        // the first signAndSendTransaction call hits the key-provider before it
        // is ready and fails — forcing a second attempt.
        await new Promise((resolve) => setTimeout(resolve, 1200));

        // Pre-warm both the Privy RPC and the MagicBlock router in parallel.
        // This primes their HTTP connections so the first real transaction
        // doesn't pay the TCP/TLS setup cost.
        const { getMagicBlockConnection } = await import('../lib/magicblock');
        await Promise.allSettled([
          connection.getLatestBlockhash('confirmed'),
          getMagicBlockConnection().getLatestBlockhash('confirmed'),
        ]);
      } catch {
        // Ignore warmup failures. Transaction send path still has retry protection.
      } finally {
        if (!cancelled) {
          walletStabilizedRef.current = true;
          setWalletStabilized(true);
        }
      }
    })();

    walletWarmupRef.current = warmup;

    return () => {
      cancelled = true;
      walletStabilizedRef.current = false;
      setWalletStabilized(false);
      walletWarmupRef.current = null;
    };
  }, [activeWallet?.address, publicKey]);

  // Bridge: takes web3.js Transaction, serializes to Uint8Array, calls Privy signAndSendTransaction
  const sendTransaction = useMemo(() => {
    if (!activeWallet || !publicKey) return null;
    return async (tx: Transaction): Promise<string> => {
      // Wait for wallet to fully stabilize before any transaction.
      // Two-layer guard:
      //   1. walletWarmupRef.current — the running warmup promise (null during the
      //      brief window between effect cleanup and new effect setup)
      //   2. walletStabilizedRef — a ref that stays false until warmup completes,
      //      safe to read from inside async closures without stale closure issues.
      // Awaiting the warmup promise handles the common case; the polling loop
      // handles the edge case where walletWarmupRef is still null (race window).
      if (walletWarmupRef.current) {
        await walletWarmupRef.current.catch(() => undefined);
      } else if (!walletStabilizedRef.current) {
        // warmupRef not set yet — poll until stabilized (max 5s)
        await new Promise<void>((resolve, reject) => {
          const deadline = Date.now() + 5000;
          const check = setInterval(() => {
            if (walletStabilizedRef.current) { clearInterval(check); resolve(); return; }
            if (Date.now() > deadline) { clearInterval(check); reject(new Error('Wallet warmup timed out')); }
          }, 100);
        });
      }

      const serializeForPrivy = async () => {
        // Always fetch a fresh blockhash immediately before serialising so
        // it can't expire between warmup and the actual signing call.
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;
        // Clear any stale signatures from a previous (failed) attempt so
        // Privy doesn't reject the transaction as already-partially-signed.
        tx.signatures = [];

        return tx.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        });
      };

      const MAX_ATTEMPTS = 3;
      const RETRY_DELAYS = [0, 1200, 2000]; // ms before each attempt
      let lastError: unknown = null;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        if (attempt > 0) {
          console.warn(`[privy] Transaction attempt ${attempt} failed, retrying in ${RETRY_DELAYS[attempt]}ms:`, lastError);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
        }
        try {
          const serialized = await serializeForPrivy();
          const chain = SOLANA_NETWORK === 'mainnet-beta' ? 'solana:mainnet-beta' : 'solana:devnet';
          const result = await signAndSendTransaction({
            transaction: serialized,
            wallet: activeWallet,
            chain,
          } as any);

          // Privy v3 returns the signature as a base58 string at runtime, but
          // the SDK types declare Uint8Array. Normalise to a base58 string so
          // downstream getSignatureStatus() calls work in both cases.
          const sig = (result as { signature: unknown }).signature;
          if (typeof sig === 'string') return sig;
          const bs58 = ((await import('bs58')) as { default: { encode: (b: Uint8Array) => string } }).default;
          return bs58.encode(sig as Uint8Array);
        } catch (err) {
          lastError = err;
        }
      }

      throw lastError instanceof Error
        ? lastError
        : new Error('Failed to send Solana transaction');
    };
  }, [activeWallet, publicKey, signAndSendTransaction]);

  // Bridge: sign an arbitrary message with the active Solana wallet (ed25519).
  // Used to prove wallet identity to the Supabase Edge Functions.
  const signMessage = useMemo(() => {
    if (!activeWallet || !publicKey) return null;
    return async (message: Uint8Array): Promise<Uint8Array> => {
      const { signature } = await privySignMessage({
        message,
        wallet: activeWallet,
      } as any);
      return signature;
    };
  }, [activeWallet, publicKey, privySignMessage]);

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
    signMessage,
    connected: authenticated,
    walletReady: !!publicKey && !!sendTransaction && walletStabilized,
    walletType,
    login,
    logout,
    user,
    displayName,
    connection,
  }), [publicKey, activeWallet?.address, sendTransaction, signMessage, authenticated, walletStabilized, walletType, login, logout, user, displayName]);

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
          // Cast: @solana/kit's generic RPC type doesn't structurally match
          // Privy's test-cluster RPC index signature, but the runtime value is
          // correct for both devnet and mainnet-beta.
          rpcs: {
            'solana:devnet': {
              rpc: createSolanaRpc(SOLANA_RPC),
              rpcSubscriptions: createSolanaRpcSubscriptions(wssUrl),
            },
            'solana:mainnet-beta': {
              rpc: createSolanaRpc(SOLANA_RPC),
              rpcSubscriptions: createSolanaRpcSubscriptions(wssUrl),
            },
          } as any,
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
