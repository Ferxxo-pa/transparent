import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import {
  PrivyProvider as _PrivyProvider,
  usePrivy,
  useLogin,
  useLogout,
} from '@privy-io/react-auth';
import {
  useWallets as useSolanaWallets,
} from '@privy-io/react-auth/solana';
import { PublicKey, Transaction, Connection, SendOptions } from '@solana/web3.js';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import { PRIVY_APP_ID, SOLANA_RPC } from '../lib/config';

const wssUrl = SOLANA_RPC.replace('https', 'wss');

// ============================================================
// PURE PRIVY
//
// ConnectedStandardSolanaWallet has:
//   - signTransaction(input): signs tx, returns signed bytes
//   - signAndSendTransaction is available as a standard wallet feature
//
// We use the wallet-standard features directly via the standardWallet
// property, which gives us access to solana:signAndSendTransaction.
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

  // Sign + Send using the wallet-standard signAndSendTransaction feature
  const sendTransaction = useMemo(() => {
    if (!activeWallet || !publicKey) return null;
    return async (tx: Transaction): Promise<string> => {
      const wallet = activeWallet as any;

      // Try multiple approaches in order of preference:

      // Approach 1: wallet-standard signAndSendTransaction via standardWallet
      if (wallet.standardWallet?.features?.['solana:signAndSendTransaction']) {
        const feature = wallet.standardWallet.features['solana:signAndSendTransaction'];
        const serialized = tx.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        });
        const account = wallet.standardWallet.accounts[0];
        const result = await feature.signAndSendTransaction({
          transaction: serialized,
          account,
          chain: 'solana:devnet',
          options: {
            preflightCommitment: 'confirmed',
          },
        });
        // result.signature is a Uint8Array — convert to base58
        const sig = Buffer.from(result.signature).toString('base64');
        // Actually we need base58, let's use bs58 encoding
        const bs58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        const bytes = result.signature;
        let num = BigInt(0);
        for (const b of bytes) num = num * 256n + BigInt(b);
        let encoded = '';
        while (num > 0n) {
          encoded = bs58Chars[Number(num % 58n)] + encoded;
          num = num / 58n;
        }
        for (const b of bytes) {
          if (b === 0) encoded = '1' + encoded;
          else break;
        }
        return encoded;
      }

      // Approach 2: signTransaction then manual send via our Connection
      if (wallet.signTransaction) {
        const serialized = tx.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        });
        const result = await wallet.signTransaction({
          transaction: serialized,
          chain: 'solana:devnet',
        });
        const signedTx = Transaction.from(result.signedTransaction);
        const sig = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
        return sig;
      }

      // Approach 3: getProvider (EVM-style, but some Privy versions support it)
      if (wallet.getProvider) {
        const provider = await wallet.getProvider();
        if (provider?.request) {
          const result = await provider.request({
            method: 'signAndSendTransaction',
            params: {
              transaction: tx,
              connection: connection,
              options: { skipPreflight: false, preflightCommitment: 'confirmed' },
            },
          });
          return result.signature;
        }
      }

      throw new Error('No supported signing method found on wallet');
    };
  }, [activeWallet, publicKey]);

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
