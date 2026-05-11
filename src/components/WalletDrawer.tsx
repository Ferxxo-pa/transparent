import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, CheckCheck, LogOut, ExternalLink } from 'lucide-react';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { useWalletBalance } from '../hooks/useWalletBalance';
import { useSolPrice, solToUsd } from '../hooks/useSolPrice';
import { SolMark } from './SolMark';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const WalletDrawer: React.FC<Props> = ({ open, onClose }) => {
  const { publicKey, displayName, logout, walletType } = usePrivyWallet();
  const balance = useWalletBalance(publicKey);
  const solPrice = useSolPrice();
  const [copied, setCopied] = useState(false);

  const address = publicKey?.toBase58() ?? '';
  const shortAddr = address ? `${address.slice(0, 6)}...${address.slice(-6)}` : '';
  const qrUrl = address
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${address}&bgcolor=ffffff&color=000000&qzone=2`
    : '';
  const explorerUrl = address
    ? `https://explorer.solana.com/address/${address}?cluster=devnet`
    : '';

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleLogout = async () => {
    onClose();
    await logout();
  };

  const balStr = balance === null ? '—' : balance.toFixed(4);
  const usdStr = balance !== null ? solToUsd(balance, solPrice) : '';

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* scrim */}
          <motion.div
            key="scrim"
            className="scrim"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
          />

          {/* bottom sheet */}
          <motion.div
            key="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            className="glass glass-strong"
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              zIndex: 1001,
              borderRadius: '24px 24px 0 0',
              padding: '12px 24px 32px',
              maxHeight: '85vh',
              overflowY: 'auto',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--ink-dim)' }} />
            </div>

            {/* header */}
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
                your wallet
              </h2>
              <p className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 2, letterSpacing: '0.04em' }}>
                {walletType === 'embedded' ? 'managed by privy' : walletType === 'external' ? 'phantom / solflare' : 'loading…'}
              </p>
            </div>

            {/* balance */}
            <div className="glass-flat" style={{ padding: '20px 24px', borderRadius: 20, marginBottom: 16, textAlign: 'center' }}>
              <p className="mono" style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acid)', marginBottom: 6 }}>
                balance
              </p>
              <div className="money" style={{ fontSize: 36, color: 'var(--ink)', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <SolMark size={28} tone="ink" />
                {balStr}
              </div>
              {usdStr && (
                <p className="mono" style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 6 }}>
                  {usdStr}
                </p>
              )}
              {balance !== null && balance < 0.01 && (
                <p className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 8, lineHeight: 1.5 }}>
                  fund with devnet sol to play
                </p>
              )}
            </div>

            {/* QR Code */}
            {qrUrl && (
              <div className="glass-flat" style={{ padding: '20px 24px', borderRadius: 20, marginBottom: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <p className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                  receive sol
                </p>
                <div style={{ padding: 10, background: 'white', borderRadius: 12, display: 'inline-flex' }}>
                  <img src={qrUrl} alt="Wallet QR" width={160} height={160} style={{ borderRadius: 4, display: 'block' }} />
                </div>
                <p className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)', textAlign: 'center', lineHeight: 1.5 }}>
                  scan or tap nfc to send sol · <strong style={{ color: 'var(--ink)' }}>devnet</strong>
                </p>
              </div>
            )}

            {/* address */}
            {address && (
              <div className="glass-flat" style={{ padding: '14px 16px', borderRadius: 16, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <p className="mono" style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4 }}>address</p>
                  <p className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', wordBreak: 'break-all', lineHeight: 1.6 }}>
                    {shortAddr}
                  </p>
                </div>
                <motion.button
                  onClick={handleCopy} whileTap={{ scale: 0.9 }}
                  className="glass-flat"
                  style={{
                    width: 34, height: 34, flexShrink: 0, borderRadius: 10,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: copied ? 'var(--acid)' : 'var(--ink-faint)',
                    transition: 'all 0.2s',
                  }}
                >
                  {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
                </motion.button>
              </div>
            )}

            {/* explorer link */}
            {explorerUrl && (
              <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
                className="mono"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  fontSize: 11, color: 'var(--purple)', textDecoration: 'none', padding: '8px 0', fontWeight: 600,
                }}>
                <ExternalLink size={12} /> view on solana explorer
              </a>
            )}

            <div style={{ flex: 1 }} />

            {/* logout */}
            <motion.button
              onClick={handleLogout} whileTap={{ scale: 0.97 }}
              className="btn btn-ghost"
              style={{ marginTop: 16, fontSize: 14 }}
            >
              <LogOut size={15} /> sign out · {displayName}
            </motion.button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
