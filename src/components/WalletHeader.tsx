import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader } from 'lucide-react';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { useWalletBalance } from '../hooks/useWalletBalance';
import { useSolPrice, solToUsd } from '../hooks/useSolPrice';
import { SolMark } from './SolMark';
import { WalletDrawer } from './WalletDrawer';

export const WalletHeader: React.FC = () => {
  const { connected, publicKey, walletReady, displayName } = usePrivyWallet();
  const balance = useWalletBalance(publicKey);
  const solPrice = useSolPrice();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!connected) return null;

  const balStr = balance === null ? '…' : balance.toFixed(3);
  const usdStr = balance !== null ? solToUsd(balance, solPrice) : '';

  return (
    <>
      {/* ── top bar ── */}
      <div
        className="glass-flat"
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 500,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 20px',
          borderRadius: 0,
          borderTop: 'none', borderLeft: 'none', borderRight: 'none',
        }}
      >
        {/* left: wordmark */}
        <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
          transparent
        </span>

        {/* right: wallet chip */}
        <motion.button
          onClick={() => setDrawerOpen(true)}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          whileTap={{ scale: 0.96 }}
          className="chip"
          style={{
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 12px',
          }}
        >
          {walletReady ? (
            <>
              <SolMark size={14} tone="ink" />
              <span className="money" style={{ fontSize: 13, color: 'var(--ink)' }}>{balStr}</span>
              {usdStr && <span className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)' }}>({usdStr})</span>}
            </>
          ) : (
            <>
              <Loader size={12} color="var(--ink-faint)" style={{ animation: 'spin 1s linear infinite' }} />
              <span className="mono" style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{displayName || 'connecting…'}</span>
            </>
          )}
        </motion.button>
      </div>

      <WalletDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
};
