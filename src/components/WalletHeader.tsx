import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, ChevronDown, Loader } from 'lucide-react';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { useWalletBalance } from '../hooks/useWalletBalance';
import { WalletDrawer } from './WalletDrawer';

/**
 * Fixed header bar — logo left, wallet pill right.
 * Always visible when logged in. Includes spacing so page content doesn't overlap.
 */
export const WalletHeader: React.FC = () => {
  const { connected, publicKey, walletReady, displayName } = usePrivyWallet();
  const balance = useWalletBalance(publicKey);
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!connected) return null;

  const addr = publicKey?.toBase58() ?? '';
  const short = addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : '';
  const balStr = balance === null ? '…' : `${balance.toFixed(3)} SOL`;

  return (
    <>
      {/* Fixed header bar */}
      <div
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 500,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px',
          background: 'transparent',
        }}
      >
        {/* Logo */}
        <img
          src="/logo-glass.svg"
          alt="Transparent"
          style={{ height: 32, objectFit: 'contain' }}
        />

        {/* Wallet pill */}
        <motion.button
          onClick={() => setDrawerOpen(true)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          whileTap={{ scale: 0.96 }}
          whileHover={{ borderColor: 'var(--lime-border)' }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            height: 36, padding: '0 12px 0 8px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-pill)',
            cursor: 'pointer', color: 'var(--text)',
            fontFamily: 'Space Grotesk', fontSize: 13, fontWeight: 600,
            transition: 'border-color 0.2s',
          }}
        >
          <div style={{
            width: 20, height: 20, borderRadius: '50%',
            background: walletReady ? 'rgba(196,255,60,0.15)' : 'rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {walletReady
              ? <Wallet size={11} color="var(--lime)" />
              : <Loader size={10} color="var(--muted)" style={{ animation: 'spin 1s linear infinite' }} />
            }
          </div>

          {walletReady ? (
            <>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>{short}</span>
              <span style={{ width: 1, height: 12, background: 'var(--border)', flexShrink: 0 }} />
              <span style={{ color: 'var(--lime)', fontSize: 12, fontWeight: 700 }}>{balStr}</span>
            </>
          ) : (
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>{displayName}</span>
          )}

          <ChevronDown size={11} color="var(--muted)" style={{ marginLeft: -2, flexShrink: 0 }} />
        </motion.button>
      </div>

      <WalletDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
};
