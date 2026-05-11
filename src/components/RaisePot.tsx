import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { SolMark } from './SolMark';

/**
 * Bottom-sheet modal to raise the pot during a round.
 * Any player can add SOL to pressure the hot seat player into answering.
 * Shows during the 'answering' phase.
 */
export const RaisePot: React.FC = () => {
  const { gameState, raisePot } = useGame();
  const { publicKey } = usePrivyWallet();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [justRaised, setJustRaised] = useState(false);

  const myWallet = publicKey?.toBase58() ?? '';
  const isHotSeat = gameState?.currentPlayerInHotSeat === myWallet;

  // Hot seat player can't raise on themselves
  if (isHotSeat) return null;

  const handleRaise = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0 || sending) return;
    setSending(true);
    try {
      await raisePot(val);
      setJustRaised(true);
      setOpen(false);
      setAmount('');
      setTimeout(() => setJustRaised(false), 3000);
    } catch (e) {
      console.error('Raise pot failed:', e);
    } finally {
      setSending(false);
    }
  };

  const presets = [0.01, 0.05, 0.1, 0.25];

  return (
    <>
      {/* floating raise button */}
      <motion.button
        onClick={() => setOpen(true)}
        whileTap={{ scale: 0.92 }}
        className="glass-flat"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          padding: '12px 20px',
          fontWeight: 700,
          fontSize: 13,
          cursor: 'pointer',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: justRaised ? 'var(--bg)' : 'var(--tangerine)',
          background: justRaised ? 'var(--acid)' : 'rgba(255,138,42,0.08)',
          borderColor: justRaised ? 'var(--acid)' : 'rgba(255,138,42,0.28)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          transition: 'all 0.2s',
        }}
      >
        {justRaised ? '✓ raised!' : 'raise +'}
      </motion.button>

      {/* scrim + bottom sheet */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="scrim"
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 100,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}
          >
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              onClick={e => e.stopPropagation()}
              className="glass glass-strong"
              style={{
                width: '100%',
                maxWidth: 480,
                borderRadius: '32px 32px 0 0',
                padding: '20px 24px 32px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* drag handle */}
                <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--glass-stroke-hi)', margin: '0 auto 4px' }} />

                {/* header */}
                <div style={{ textAlign: 'center' }}>
                  <span className="sticker sticker-tangerine" style={{ marginBottom: 12, display: 'inline-block' }}>raise</span>
                  <p className="display" style={{ fontSize: 32, marginTop: 10 }}>
                    jack the <span className="italic-serif" style={{ color: 'var(--tangerine)' }}>pot.</span>
                  </p>
                  <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 8 }}>
                    10s for everyone to match or fold.
                  </p>
                </div>

                {/* preset amounts */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {presets.map(p => (
                    <button
                      key={p}
                      onClick={() => setAmount(p.toString())}
                      className="glass-flat"
                      style={{
                        padding: '12px 0',
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: 14,
                        color: amount === p.toString() ? 'var(--bg)' : 'var(--ink)',
                        background: amount === p.toString() ? 'var(--tangerine)' : undefined,
                        borderColor: amount === p.toString() ? 'var(--tangerine)' : undefined,
                        transition: 'all 0.15s',
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                {/* CTA */}
                <button
                  onClick={handleRaise}
                  disabled={!amount || parseFloat(amount) <= 0 || sending}
                  style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: 16,
                    border: 'none',
                    background: 'var(--tangerine)',
                    color: '#0A0810',
                    fontWeight: 800,
                    fontSize: 16,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    opacity: (!amount || parseFloat(amount) <= 0 || sending) ? 0.4 : 1,
                    transition: 'opacity 0.15s',
                    boxShadow: '0 0 24px var(--tangerine-glow)',
                  }}
                >
                  {sending ? 'sending...' : (
                    <>raise +<SolMark size={16} tone="dark" /> {amount || '0'}</>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
