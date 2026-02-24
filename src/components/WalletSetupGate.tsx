import React from 'react';
import { motion } from 'framer-motion';
import { Wallet } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { usePrivyWallet } from '../contexts/PrivyContext';

/**
 * Shows a wallet connect screen when the user is logged in but has no Solana wallet.
 */
export const WalletSetupGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { connected, walletReady } = usePrivyWallet();
  const { disconnect, publicKey } = useWallet();
  const { setVisible } = useWalletModal();

  // Not logged in or wallet already connected — render children
  if (!connected || walletReady) return <>{children}</>;

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
            This game runs on Solana. Connect Phantom or Solflare to play.
          </p>
        </div>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <motion.button
            className="btn btn-primary"
            onClick={() => setVisible(true)}
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.03, boxShadow: '0 0 40px rgba(196,255,60,0.45)' }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            Connect Wallet →
          </motion.button>
        </div>

        <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
          Set Phantom to <strong style={{ color: 'var(--text)' }}>devnet</strong> to play with testnet SOL
        </p>
      </motion.div>
    </div>
  );
};
