import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, CheckCheck, LogOut, ExternalLink } from 'lucide-react';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { useWalletBalance } from '../hooks/useWalletBalance';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const WalletDrawer: React.FC<Props> = ({ open, onClose }) => {
  const { publicKey, displayName, logout, walletType } = usePrivyWallet();
  const balance = useWalletBalance(publicKey);
  const [copied, setCopied] = useState(false);

  const address = publicKey?.toBase58() ?? '';
  const shortAddr = address ? `${address.slice(0, 6)}...${address.slice(-6)}` : '';
  const qrUrl = address
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${address}&bgcolor=0D0F0B&color=C4FF3C&qzone=2`
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

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(4px)',
              zIndex: 1000,
            }}
          />

          {/* Drawer */}
          <motion.div
            key="drawer"
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 32 }}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: 'min(360px, 100vw)',
              background: '#0D0F0B',
              borderLeft: '1px solid var(--border)',
              zIndex: 1001,
              display: 'flex',
              flexDirection: 'column',
              padding: '24px 24px 32px',
              gap: 0,
              overflowY: 'auto',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
                  Your Wallet
                </h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {walletType === 'embedded' ? 'Embedded wallet · Privy' : 'Phantom / Solflare'}
                </p>
              </div>
              <motion.button
                onClick={onClose}
                whileTap={{ scale: 0.9 }}
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'var(--glass)', border: '1px solid var(--border)',
                  cursor: 'pointer', color: 'var(--muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={16} />
              </motion.button>
            </div>

            {/* Balance */}
            <div style={{
              background: 'var(--glass)', border: '1px solid var(--lime-border)',
              borderRadius: 'var(--r)', padding: '20px 24px', marginBottom: 20,
              textAlign: 'center',
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--lime)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                Balance
              </p>
              <p style={{ fontSize: 36, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                {balance === null ? '—' : `${balance.toFixed(4)}`}
                <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--muted)', marginLeft: 6 }}>SOL</span>
              </p>
              {balance !== null && balance < 0.01 && (
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
                  Low balance · send devnet SOL to play
                </p>
              )}
            </div>

            {/* QR Code + Receive */}
            <div style={{
              background: 'var(--glass)', border: '1px solid var(--border)',
              borderRadius: 'var(--r)', padding: '20px 24px', marginBottom: 16,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Receive SOL
              </p>
              {qrUrl ? (
                <div style={{
                  padding: 10, background: 'white', borderRadius: 12,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <img
                    src={qrUrl}
                    alt="Wallet QR"
                    width={160}
                    height={160}
                    style={{ borderRadius: 4, display: 'block' }}
                    onError={(e) => {
                      // Fallback: hide QR if API fails
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              ) : (
                <div style={{ width: 160, height: 160, background: 'var(--glass)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>No wallet</span>
                </div>
              )}
              <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>
                Scan to send SOL to this wallet on <strong style={{ color: 'var(--text)' }}>devnet</strong>
              </p>
            </div>

            {/* Address */}
            <div style={{
              background: 'var(--glass)', border: '1px solid var(--border)',
              borderRadius: 'var(--r)', padding: '14px 16px', marginBottom: 12,
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                Address
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1, wordBreak: 'break-all', lineHeight: 1.6 }}>
                  {shortAddr || '—'}
                </p>
                <motion.button
                  onClick={handleCopy}
                  whileTap={{ scale: 0.9 }}
                  style={{
                    width: 34, height: 34, flexShrink: 0,
                    background: copied ? 'rgba(196,255,60,0.12)' : 'var(--glass)',
                    border: `1px solid ${copied ? 'var(--lime-border)' : 'var(--border)'}`,
                    borderRadius: 8, cursor: 'pointer',
                    color: copied ? 'var(--lime)' : 'var(--muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s',
                  }}
                >
                  {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
                </motion.button>
              </div>
            </div>

            {/* Explorer link */}
            {explorerUrl && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  fontSize: 12, color: 'var(--lavender)', textDecoration: 'none',
                  padding: '10px 0', marginBottom: 8,
                  fontWeight: 600,
                }}
              >
                <ExternalLink size={12} /> View on Solana Explorer
              </a>
            )}

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Logout */}
            <motion.button
              onClick={handleLogout}
              whileTap={{ scale: 0.97 }}
              whileHover={{ borderColor: 'var(--red-border)', color: 'var(--red)' }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', padding: '14px 0',
                background: 'var(--glass)', border: '1px solid var(--border)',
                borderRadius: 'var(--r)', cursor: 'pointer',
                color: 'var(--muted)', fontSize: 14, fontWeight: 600,
                fontFamily: 'Space Grotesk',
                transition: 'all 0.2s',
              }}
            >
              <LogOut size={15} /> Sign out · {displayName}
            </motion.button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
