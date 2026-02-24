import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { usePrivyWallet } from '../contexts/PrivyContext';

/**
 * Shows a wallet setup screen when the user is logged in but has no Solana wallet.
 * Wrap any page that requires a wallet with this gate.
 */
export const WalletSetupGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { connected, walletReady, setupWallet } = usePrivyWallet();
  const { linkWallet } = usePrivy();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Not logged in or wallet already ready — render children normally
  if (!connected || walletReady) return <>{children}</>;

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      await setupWallet();
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
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
            Connect a wallet to play
          </h2>
          <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
            You need a Solana wallet to create or join a game.
          </p>
        </div>

        {error && (
          <p style={{ fontSize: 12, color: 'var(--red)' }}>{error}</p>
        )}

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Connect Phantom / external wallet */}
          <motion.button
            className="btn btn-primary"
            onClick={() => linkWallet()}
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.03, boxShadow: '0 0 40px rgba(196,255,60,0.45)' }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            Connect Phantom / Solflare →
          </motion.button>

          {/* Create embedded wallet (no seed phrase) */}
          <motion.button
            className="btn"
            onClick={handleCreate}
            disabled={loading}
            style={{ background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--text)' }}
            whileTap={{ scale: 0.96 }}
            whileHover={!loading ? { scale: 1.02 } : {}}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            {loading ? 'Setting up…' : 'Create embedded wallet (no seed phrase)'}
          </motion.button>
        </div>

        <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
          Make sure your wallet is set to <strong style={{ color: 'var(--text)' }}>devnet</strong> for testnet play
        </p>
      </motion.div>
    </div>
  );
};
