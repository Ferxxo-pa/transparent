import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, Zap } from 'lucide-react';
import { usePrivyWallet } from '../contexts/PrivyContext';

/**
 * Gate that shows when the user is authenticated but has no Solana wallet ready.
 * Offers two paths:
 *   1. Connect Phantom / Solflare (external wallet — recommended for demo)
 *   2. Create embedded wallet (no seed phrase, no extension needed)
 */
export const WalletSetupGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { connected, walletReady, connectPhantom, createEmbedded } = usePrivyWallet();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!connected || walletReady) return <>{children}</>;

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      await createEmbedded();
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page fade-in" style={{ maxWidth: 400, justifyContent: 'center' }}>
      <motion.div
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, textAlign: 'center', width: '100%' }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      >
        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(196,255,60,0.1)', border: '1px solid var(--lime-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Wallet size={24} color="var(--lime)" />
        </div>

        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 8 }}>
            Connect a Solana wallet
          </h2>
          <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
            This game runs on Solana. Connect Phantom to play with real stakes — or create a free embedded wallet.
          </p>
        </div>

        {error && <p style={{ fontSize: 12, color: 'var(--red)' }}>{error}</p>}

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Option 1: Connect Phantom / Solflare */}
          <motion.button
            className="btn btn-primary"
            onClick={connectPhantom}
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.03, boxShadow: '0 0 40px rgba(196,255,60,0.45)' }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <Wallet size={15} />
            Connect Phantom / Solflare
          </motion.button>

          {/* Option 2: Create embedded wallet */}
          <motion.button
            className="btn"
            onClick={handleCreate}
            disabled={creating}
            style={{ background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            whileTap={{ scale: 0.96 }}
            whileHover={!creating ? { scale: 1.02 } : {}}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            <Zap size={14} />
            {creating ? 'Creating…' : 'Create embedded wallet (no extension needed)'}
          </motion.button>
        </div>

        <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>
          For demo: set Phantom to <strong style={{ color: 'var(--text)' }}>devnet</strong> and use testnet SOL
        </p>
      </motion.div>
    </div>
  );
};
