import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';

/**
 * Floating button + modal to raise the pot during a round.
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
      {/* Floating raise button */}
      <motion.button
        onClick={() => setOpen(true)}
        whileTap={{ scale: 0.92 }}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          background: justRaised ? 'var(--lime)' : 'var(--card-2)',
          color: justRaised ? '#000' : 'var(--text)',
          border: `1.5px solid ${justRaised ? 'var(--lime)' : 'var(--border-2)'}`,
          borderRadius: 'var(--r)',
          padding: '12px 20px',
          fontWeight: 700,
          fontSize: 14,
          cursor: 'pointer',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          transition: 'all 0.2s',
        }}
      >
        {justRaised ? '✓ Raised!' : '🔥 Raise the Pot'}
      </motion.button>

      {/* Modal overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.7)',
              zIndex: 100,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              padding: 16,
            }}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="card"
              style={{ width: '100%', maxWidth: 380, marginBottom: 16 }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Header */}
                <div>
                  <p style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>🔥 Raise the Pot</p>
                  <p style={{ color: 'var(--muted)', fontSize: 13 }}>
                    Add SOL to pressure {gameState?.players.find(p => p.id === gameState?.currentPlayerInHotSeat)?.name || 'them'} into answering honestly
                  </p>
                </div>

                {/* Current pot */}
                <div style={{ 
                  textAlign: 'center', 
                  padding: '14px',
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--card-2)',
                  border: '1px solid var(--border)',
                }}>
                  <p className="label-sm" style={{ marginBottom: 4 }}>Current Pot</p>
                  <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--lime)' }}>
                    {(gameState?.currentPot || 0).toFixed(2)} SOL
                  </p>
                </div>

                {/* Preset amounts */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {presets.map(p => (
                    <button
                      key={p}
                      onClick={() => setAmount(p.toString())}
                      style={{
                        padding: '10px 0',
                        borderRadius: 'var(--r-sm)',
                        border: `1.5px solid ${amount === p.toString() ? 'var(--lime-border)' : 'var(--border)'}`,
                        background: amount === p.toString() ? 'var(--lime-bg)' : 'var(--card)',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 13,
                        color: 'var(--text)',
                      }}
                    >
                      +{p}
                    </button>
                  ))}
                </div>

                {/* Custom amount */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    min="0.001"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="Custom amount (SOL)"
                    style={{ flex: 1 }}
                  />
                </div>

                {/* Raise button */}
                <button
                  className="btn btn-primary"
                  onClick={handleRaise}
                  disabled={!amount || parseFloat(amount) <= 0 || sending}
                  style={{ width: '100%' }}
                >
                  {sending ? 'Sending...' : `Raise +${amount || '0'} SOL`}
                </button>

                <button
                  onClick={() => setOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--muted)',
                    fontSize: 13,
                    cursor: 'pointer',
                    padding: 8,
                  }}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
