import React from 'react';
import { motion } from 'framer-motion';
import { Loader, Wallet } from 'lucide-react';
import { usePrivyWallet } from '../contexts/PrivyContext';

/**
 * Pure Privy gate — wallet is auto-created on login.
 * This just shows a brief loading state while Privy provisions the wallet.
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
          background: 'rgba(196,255,60,0.1)', border: '1px solid var(--lime-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Loader size={22} color="var(--lime)" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 8 }}>
            Setting up your wallet…
          </h2>
          <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
            This only takes a moment. Your Solana wallet is being created automatically.
          </p>
        </div>
      </motion.div>
    </div>
  );
};
