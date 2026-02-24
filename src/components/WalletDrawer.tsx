import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, CheckCheck, LogOut, ExternalLink, Wallet, Zap } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PhantomWalletName } from '@solana/wallet-adapter-phantom';
import { SolflareWalletName } from '@solana/wallet-adapter-solflare';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { useWalletBalance } from '../hooks/useWalletBalance';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const WalletDrawer: React.FC<Props> = ({ open, onClose }) => {
  const { publicKey, displayName, logout, walletType, createEmbeddedWallet } = usePrivyWallet();
  const { select, connect, wallet, connecting } = useWallet();
  const balance = useWalletBalance(publicKey);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [setupErr, setSetupErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<'phantom' | 'solflare' | null>(null);

  // Auto-connect adapter after wallet is selected
  useEffect(() => {
    if (!picked || !wallet) return;
    connect().catch((e: any) => {
      setSetupErr(e?.message ?? 'Connection failed — make sure the extension is installed');
      setPicked(null);
    });
  }, [wallet?.adapter?.name, picked]);

  const handlePhantom = () => { setSetupErr(null); setPicked('phantom'); select(PhantomWalletName); };
  const handleSolflare = () => { setSetupErr(null); setPicked('solflare'); select(SolflareWalletName); };
  const handleCreateEmbedded = async () => {
    setCreating(true); setSetupErr(null);
    try { await createEmbeddedWallet(); }
    catch (e: any) { setSetupErr(e?.message ?? 'Failed to create wallet'); }
    finally { setCreating(false); }
  };

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

  const isLoading = connecting || creating;

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
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: 'min(360px, 100vw)',
              background: '#0D0F0B',
              borderLeft: '1px solid var(--border)',
              zIndex: 1001,
              display: 'flex', flexDirection: 'column',
              padding: '24px 24px 32px',
              overflowY: 'auto',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
                  Your Wallet
                </h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {walletType === 'embedded' ? 'Embedded wallet · Privy' : walletType === 'external' ? 'Phantom / Solflare' : `Signed in as ${displayName}`}
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

            {/* ── No wallet: setup prompt ─────────────────── */}
            {!publicKey && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                <div style={{
                  background: 'rgba(200,174,255,0.07)', border: '1px solid var(--lavender-border)',
                  borderRadius: 'var(--r)', padding: '16px 18px',
                }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                    No wallet connected yet
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                    Connect Phantom or Solflare, or create a free embedded wallet — no extension needed.
                  </p>
                </div>

                {setupErr && <p style={{ fontSize: 12, color: 'var(--red)', lineHeight: 1.5 }}>{setupErr}</p>}

                <motion.button
                  className="btn btn-primary"
                  onClick={handlePhantom}
                  disabled={isLoading}
                  whileTap={{ scale: 0.96 }}
                  whileHover={{ scale: 1.02, boxShadow: '0 0 32px rgba(196,255,60,0.4)' }}
                  style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <Wallet size={15} />
                  {connecting && picked === 'phantom' ? 'Connecting…' : 'Connect Phantom'}
                </motion.button>

                <motion.button
                  className="btn"
                  onClick={handleSolflare}
                  disabled={isLoading}
                  whileTap={{ scale: 0.96 }}
                  style={{ height: 48, background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <Wallet size={15} />
                  {connecting && picked === 'solflare' ? 'Connecting…' : 'Connect Solflare'}
                </motion.button>

                <motion.button
                  className="btn"
                  onClick={handleCreateEmbedded}
                  disabled={isLoading}
                  whileTap={{ scale: 0.96 }}
                  style={{ height: 48, background: 'rgba(200,174,255,0.07)', border: '1px solid var(--lavender-border)', color: 'var(--lavender)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <Zap size={15} />
                  {creating ? 'Creating wallet…' : '✨ Create wallet (no extension needed)'}
                </motion.button>

                <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.6, marginTop: 4 }}>
                  Embedded wallets are managed by Privy — no seed phrase needed. You can always link an external wallet later.
                </p>
              </div>
            )}

            {/* ── Has wallet: address + balance + QR ─────── */}
            {publicKey && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
                {/* Balance */}
                <div style={{
                  background: 'var(--glass)', border: '1px solid var(--lime-border)',
                  borderRadius: 'var(--r)', padding: '20px 24px', textAlign: 'center',
                }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--lime)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                    Balance
                  </p>
                  <p style={{ fontSize: 36, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                    {balance === null ? '—' : balance.toFixed(4)}
                    <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--muted)', marginLeft: 6 }}>SOL</span>
                  </p>
                  {balance !== null && balance < 0.01 && (
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
                      Low balance · fund with devnet SOL to play
                    </p>
                  )}
                </div>

                {/* QR Code */}
                <div style={{
                  background: 'var(--glass)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r)', padding: '20px 24px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Receive SOL
                  </p>
                  <div style={{ padding: 10, background: 'white', borderRadius: 12, display: 'inline-flex' }}>
                    <img src={qrUrl} alt="Wallet QR" width={160} height={160} style={{ borderRadius: 4, display: 'block' }} />
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>
                    Scan to send SOL to this wallet on <strong style={{ color: 'var(--text)' }}>devnet</strong>
                  </p>
                </div>

                {/* Address */}
                <div style={{
                  background: 'var(--glass)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r)', padding: '14px 16px',
                }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                    Address
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flex: 1, wordBreak: 'break-all', lineHeight: 1.6 }}>
                      {shortAddr}
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

                {/* Explorer */}
                <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, color: 'var(--lavender)', textDecoration: 'none', padding: '8px 0', fontWeight: 600 }}>
                  <ExternalLink size={12} /> View on Solana Explorer
                </a>
              </div>
            )}

            {/* Spacer */}
            <div style={{ flex: publicKey ? 0 : 1, minHeight: 16 }} />

            {/* Logout */}
            <motion.button
              onClick={handleLogout}
              whileTap={{ scale: 0.97 }}
              whileHover={{ borderColor: 'var(--red-border)', color: 'var(--red)' }}
              style={{
                marginTop: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', padding: '14px 0',
                background: 'var(--glass)', border: '1px solid var(--border)',
                borderRadius: 'var(--r)', cursor: 'pointer',
                color: 'var(--muted)', fontSize: 14, fontWeight: 600,
                fontFamily: 'Space Grotesk', transition: 'all 0.2s',
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
