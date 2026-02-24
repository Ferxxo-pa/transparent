import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, ChevronDown } from 'lucide-react';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { useWalletBalance } from '../hooks/useWalletBalance';
import { WalletDrawer } from './WalletDrawer';

/**
 * Fixed wallet pill — always visible in the top-right corner when logged in.
 * Shows: shortened address + SOL balance.
 * Clicking it opens the WalletDrawer.
 */
export const WalletHeader: React.FC = () => {
  const { connected, publicKey } = usePrivyWallet();
  const balance = useWalletBalance(publicKey);
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!connected || !publicKey) return null;

  const addr = publicKey.toBase58();
  const short = `${addr.slice(0, 4)}…${addr.slice(-4)}`;
  const balStr = balance === null ? '…' : `${balance.toFixed(3)} SOL`;

  return (
    <>
      <motion.button
        onClick={() => setDrawerOpen(true)}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        whileTap={{ scale: 0.96 }}
        whileHover={{ borderColor: 'var(--lime-border)' }}
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 500,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 38,
          padding: '0 14px 0 10px',
          background: 'rgba(13,15,11,0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-pill)',
          cursor: 'pointer',
          color: 'var(--text)',
          fontFamily: 'Space Grotesk',
          fontSize: 13,
          fontWeight: 600,
          transition: 'border-color 0.2s',
        }}
      >
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          background: 'rgba(196,255,60,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Wallet size={12} color="var(--lime)" />
        </div>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>{short}</span>
        <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
        <span style={{ color: 'var(--lime)', fontSize: 12, fontWeight: 700 }}>{balStr}</span>
        <ChevronDown size={12} color="var(--muted)" style={{ marginLeft: -2 }} />
      </motion.button>

      <WalletDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
};
