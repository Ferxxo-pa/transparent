import React from 'react';
import { motion } from 'framer-motion';
import { usePrivyWallet } from '../contexts/PrivyContext';

/**
 * Pure Privy gate — wallet is auto-created on login.
 * Shows a brief loading state while Privy provisions the wallet.
 * Once walletReady = true, renders children.
 */
export const WalletSetupGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { connected, walletReady } = usePrivyWallet();

  // Not logged in or wallet ready — pass through
  if (!connected || walletReady) return <>{children}</>;

  // Logged in but wallet still initializing
  return (
    <div className="page fade-in" style={{ maxWidth: 400, justifyContent: 'center' }}>
      <motion.div
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center' }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      >
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: 'rgba(196,255,60,0.10)', border: '1px solid rgba(196,255,60,0.28)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--acid)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>
        <div>
          <h2 className="display" style={{ fontSize: 20, color: 'var(--ink)', letterSpacing: '-0.02em', marginBottom: 8 }}>
            setting up your wallet…
          </h2>
          <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
            this only takes a moment. your solana wallet is being created automatically.
          </p>
        </div>
      </motion.div>
    </div>
  );
};
