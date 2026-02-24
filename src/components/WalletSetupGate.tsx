import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, Loader } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PhantomWalletName } from '@solana/wallet-adapter-phantom';
import { SolflareWalletName } from '@solana/wallet-adapter-solflare';
import { usePrivyWallet } from '../contexts/PrivyContext';

/**
 * Gate: shown when authenticated but no Solana wallet is ready.
 *
 * Cases:
 *  A) Email/social user — Privy is auto-creating embedded wallet.
 *     Show a loading state briefly, then this gate disappears.
 *  B) User wants Phantom — select + connect directly via adapter.
 *  C) User wants embedded wallet created manually — call createEmbeddedWallet().
 */
export const WalletSetupGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { connected, walletReady, walletType, createEmbeddedWallet } = usePrivyWallet();
  const { select, connect, wallet, connecting } = useWallet();
  const [picked, setPicked] = useState<'phantom' | 'solflare' | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Once a wallet adapter is selected, connect immediately
  useEffect(() => {
    if (!picked || !wallet) return;
    setErr(null);
    connect().catch((e: any) => {
      setErr(e?.message ?? 'Connection failed — make sure the extension is installed');
      setPicked(null);
    });
  }, [wallet?.adapter?.name, picked]);

  // Pass through if not authenticated or if wallet is already ready
  if (!connected || walletReady) return <>{children}</>;

  const handlePhantom = () => {
    setPicked('phantom');
    select(PhantomWalletName);
  };

  const handleSolflare = () => {
    setPicked('solflare');
    select(SolflareWalletName);
  };

  const handleCreateEmbedded = async () => {
    setCreating(true);
    setErr(null);
    try {
      await createEmbeddedWallet();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to create wallet');
    } finally {
      setCreating(false);
    }
  };

  const isLoading = connecting || creating;

  return (
    <div className="page fade-in" style={{ maxWidth: 400, justifyContent: 'center' }}>
      <motion.div
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, textAlign: 'center', width: '100%' }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      >
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: 'rgba(196,255,60,0.1)', border: '1px solid var(--lime-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {isLoading
            ? <Loader size={22} color="var(--lime)" style={{ animation: 'spin 1s linear infinite' }} />
            : <Wallet size={24} color="var(--lime)" />
          }
        </div>

        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 8 }}>
            {isLoading ? 'Setting up wallet…' : 'Connect a Solana wallet'}
          </h2>
          <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
            {isLoading
              ? 'Just a moment while we set up your wallet.'
              : 'Connect Phantom, Solflare, or create a free embedded wallet — no extension needed.'}
          </p>
        </div>

        {err && (
          <p style={{ fontSize: 12, color: 'var(--red)', lineHeight: 1.5, padding: '0 8px' }}>{err}</p>
        )}

        {!isLoading && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Phantom */}
            <motion.button
              className="btn btn-primary"
              onClick={handlePhantom}
              disabled={isLoading}
              whileTap={{ scale: 0.96 }}
              whileHover={{ scale: 1.03, boxShadow: '0 0 40px rgba(196,255,60,0.45)' }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <Wallet size={15} /> Connect Phantom
            </motion.button>

            {/* Solflare */}
            <motion.button
              className="btn"
              onClick={handleSolflare}
              disabled={isLoading}
              style={{ background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              whileTap={{ scale: 0.96 }}
              whileHover={!isLoading ? { scale: 1.02 } : {}}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              <Wallet size={14} /> Connect Solflare
            </motion.button>

            {/* Embedded wallet — for email users who didn't get one auto-created */}
            {walletType === null && (
              <motion.button
                className="btn"
                onClick={handleCreateEmbedded}
                disabled={isLoading}
                style={{ background: 'var(--glass)', border: '1px solid var(--lavender-border)', color: 'var(--lavender)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                whileTap={{ scale: 0.96 }}
                whileHover={!isLoading ? { scale: 1.02 } : {}}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                ✨ Create wallet (no extension needed)
              </motion.button>
            )}
          </div>
        )}

        {!isLoading && (
          <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>
            For demo: set Phantom to <strong style={{ color: 'var(--text)' }}>devnet</strong> and fund with testnet SOL
          </p>
        )}
      </motion.div>
    </div>
  );
};
