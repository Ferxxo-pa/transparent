import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, LogOut } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { usePrivyWallet } from '../contexts/PrivyContext';

/**
 * Shows a wallet setup screen when the user is logged in but has no Solana wallet.
 */
export const WalletSetupGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { connected, walletReady, setupWallet, logout, login } = usePrivyWallet();
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!connected || walletReady) return <>{children}</>;

  const handleCreate = async () => {
    setCreatingWallet(true);
    setError(null);
    try {
      await setupWallet();
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong');
    } finally {
      setCreatingWallet(false);
    }
  };

  const handleSwitchToPhantom = async () => {
    await logout();
    login();
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
            This game runs on Solana. Sign in with Phantom or Solflare to play — or create a free embedded wallet below.
          </p>
        </div>

        {error && <p style={{ fontSize: 12, color: 'var(--red)' }}>{error}</p>}

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Primary: log out + re-login with wallet */}
          <motion.button
            className="btn btn-primary"
            onClick={handleSwitchToPhantom}
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.03, boxShadow: '0 0 40px rgba(196,255,60,0.45)' }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <LogOut size={15} />
            Sign in with Phantom / Solflare
          </motion.button>

          {/* Secondary: create embedded wallet */}
          <motion.button
            className="btn"
            onClick={handleCreate}
            disabled={creatingWallet}
            style={{ background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--text)' }}
            whileTap={{ scale: 0.96 }}
            whileHover={!creatingWallet ? { scale: 1.02 } : {}}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            {creatingWallet ? 'Creating wallet…' : 'Create embedded wallet (no seed phrase)'}
          </motion.button>
        </div>

        <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
          Set Phantom to <strong style={{ color: 'var(--text)' }}>devnet</strong> to play with testnet SOL
        </p>
      </motion.div>
    </div>
  );
};
