import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Wallet, ChevronDown, Loader } from 'lucide-react';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { useWalletBalance } from '../hooks/useWalletBalance';
import { WalletDrawer } from './WalletDrawer';

// Pages where we show the full wallet pill — everything else gets compact icon
const FULL_PILL_PATHS = ['/', '/join', '/create', '/waitlist'];

export const WalletHeader: React.FC = () => {
  const { connected, publicKey, walletReady, displayName } = usePrivyWallet();
  const balance = useWalletBalance(publicKey);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  if (!connected) return null;

  const compact = !FULL_PILL_PATHS.includes(location.pathname);

  const addr = publicKey?.toBase58() ?? '';
  const short = addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : '';
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
          position: 'absolute', top: 12, right: 16, zIndex: 500,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: compact ? 0 : 8,
          height: compact ? 34 : 38,
          width: compact ? 34 : 'auto',
          padding: compact ? 0 : '0 14px 0 10px',
          background: compact ? 'rgba(255,255,255,0.06)' : 'rgba(13,15,11,0.90)',
          backdropFilter: 'blur(12px)',
          border: `1px solid ${compact ? 'rgba(255,255,255,0.08)' : 'var(--border)'}`,
          borderRadius: 'var(--r-pill)',
          cursor: 'pointer', color: 'var(--text)',
          fontFamily: 'Space Grotesk', fontSize: 13, fontWeight: 600,
          transition: 'border-color 0.2s',
        }}
      >
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          background: walletReady ? 'rgba(196,255,60,0.15)' : 'rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {walletReady
            ? <Wallet size={12} color="var(--lime)" />
            : <Loader size={11} color="var(--muted)" style={{ animation: 'spin 1s linear infinite' }} />
          }
        </div>

        {!compact && walletReady && (
          <>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>{short}</span>
            <span style={{ width: 1, height: 14, background: 'var(--border)', flexShrink: 0 }} />
            <span style={{ color: 'var(--lime)', fontSize: 12, fontWeight: 700 }}>{balStr}</span>
          </>
        )}

        {!compact && !walletReady && (
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>{displayName}</span>
        )}

        {!compact && <ChevronDown size={12} color="var(--muted)" style={{ marginLeft: -2, flexShrink: 0 }} />}
      </motion.button>

      <WalletDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
};
