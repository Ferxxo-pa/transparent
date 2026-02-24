import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PhantomWalletName } from '@solana/wallet-adapter-phantom';
import { SolflareWalletName } from '@solana/wallet-adapter-solflare';
import { usePrivyWallet } from '../contexts/PrivyContext';

/**
 * Gate: shows when authenticated (Privy) but no Solana wallet is connected.
 * Bypasses the wallet picker modal — directly selects Phantom and calls connect()
 * so Phantom extension immediately shows its approval popup.
 */
export const WalletSetupGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { connected, walletReady } = usePrivyWallet();
  const { select, connect, wallet, connecting } = useWallet();
  const [picked, setPicked] = useState<'phantom' | 'solflare' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // After selecting an adapter, connect() is called once wallet is ready
  useEffect(() => {
    if (!picked || !wallet) return;
    setErr(null);
    connect().catch((e: any) => {
      setErr(e?.message ?? 'Connection failed — make sure the extension is installed');
      setPicked(null);
    });
  }, [wallet?.adapter?.name, picked]);

  if (!connected || walletReady) return <>{children}</>;

  const handlePhantom = () => {
    setPicked('phantom');
    select(PhantomWalletName);
  };

  const handleSolflare = () => {
    setPicked('solflare');
    select(SolflareWalletName);
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
            Pick your wallet — the extension will ask you to approve the connection.
          </p>
        </div>

        {err && (
          <p style={{ fontSize: 12, color: 'var(--red)', lineHeight: 1.5 }}>{err}</p>
        )}

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <motion.button
            className="btn btn-primary"
            onClick={handlePhantom}
            disabled={connecting}
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.03, boxShadow: '0 0 40px rgba(196,255,60,0.45)' }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <Wallet size={15} />
            {connecting && picked === 'phantom' ? 'Connecting…' : 'Connect Phantom'}
          </motion.button>

          <motion.button
            className="btn"
            onClick={handleSolflare}
            disabled={connecting}
            style={{ background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            whileTap={{ scale: 0.96 }}
            whileHover={!connecting ? { scale: 1.02 } : {}}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            <Wallet size={14} />
            {connecting && picked === 'solflare' ? 'Connecting…' : 'Connect Solflare'}
          </motion.button>
        </div>

        <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>
          Set Phantom to <strong style={{ color: 'var(--text)' }}>devnet</strong> and fund with testnet SOL
        </p>
      </motion.div>
    </div>
  );
};
