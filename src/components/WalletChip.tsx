import React, { useState } from 'react';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { useWalletBalance } from '../hooks/useWalletBalance';
import { useSolPrice, solToUsd } from '../hooks/useSolPrice';
import { TokenMark } from './TokenMark';
import { WalletDrawer } from './WalletDrawer';

/**
 * Compact wallet chip — shows balance if connected, "connect" if not.
 * Includes the WalletDrawer so any page that uses this gets wallet management for free.
 */
export const WalletChip: React.FC = () => {
  const { connected, login, publicKey } = usePrivyWallet();
  const balance = useWalletBalance(publicKey);
  const solPrice = useSolPrice();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const balStr = balance !== null ? balance.toFixed(3) : '—';
  const usdStr = balance !== null && solPrice ? solToUsd(balance, solPrice) : '';

  return (
    <>
      {connected && balance !== null ? (
        <button
          onClick={() => setDrawerOpen(true)}
          className="chip"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <TokenMark token="sol" size={11} />
          <span>{balStr}</span>
          {usdStr && (
            <span className="mono" style={{ fontSize: 9, color: 'var(--ink-faint)', marginLeft: 2 }}>
              {usdStr}
            </span>
          )}
        </button>
      ) : (
        <button
          onClick={login}
          className="chip"
          style={{ cursor: 'pointer', border: '1px solid var(--glass-stroke-hi)' }}
        >
          connect
        </button>
      )}
      <WalletDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
};
