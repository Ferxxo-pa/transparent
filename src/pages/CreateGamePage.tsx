import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { WalletSetupGate } from '../components/WalletSetupGate';
import { useSolPrice, solToUsd } from '../hooks/useSolPrice';
import { QuestionMode, PayoutMode } from '../types/game';

const MODES: { id: QuestionMode; label: string; sub: string; emoji: string }[] = [
  { id: 'classic',  label: 'Classic',   sub: 'Curated questions from the vault',   emoji: '🎲' },
  { id: 'hot-take', label: 'Hot Take',  sub: 'Players write, crowd picks best one', emoji: '🔥' },
  { id: 'custom',   label: 'Custom',    sub: 'You write every question',            emoji: '✍️' },
];

const PAYOUT_MODES: { id: PayoutMode; label: string; sub: string; emoji: string }[] = [
  { id: 'winner-takes-all', label: 'Winner Takes All', sub: 'Most honest player wins the entire pot', emoji: '🏆' },
  { id: 'honest-talkers',   label: 'Honest Talkers',   sub: 'Pot splits evenly among everyone who answered', emoji: '🤝' },
];

const field = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

export const CreateGamePage: React.FC = () => {
  const navigate = useNavigate();
  const { createGame, loading, error } = useGame();
  const { displayName, walletReady } = usePrivyWallet();
  const solPrice = useSolPrice();

  const [buyIn,      setBuyIn]      = useState('0');
  const [roomName,   setRoomName]   = useState('');
  const [mode,       setMode]       = useState<QuestionMode>('classic');
  const [payoutMode, setPayoutMode] = useState<PayoutMode>('winner-takes-all');
  const [customQs,   setCustomQs]   = useState<string[]>(['', '']);

  const handleCreate = async () => {
    const filtered = mode === 'custom' ? customQs.filter(q => q.trim()) : undefined;
    if (mode === 'custom' && !filtered?.length) return;
    const ok = await createGame(
      parseFloat(buyIn) || 0,
      roomName.trim() || 'Game Room',
      mode,
      filtered,
      undefined, // no host name
      payoutMode,
    );
    if (ok) navigate('/waiting');
  };

  return (
    <WalletSetupGate>
    <div className="page fade-in">
      {/* Top spacing */}
      <div style={{ width: '100%', paddingTop: 16, marginBottom: 8 }}>
        <motion.button
          onClick={() => navigate('/')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, fontFamily: 'Space Grotesk', fontWeight: 600 }}
          whileTap={{ scale: 0.95 }}
        >
          <ArrowLeft size={15} /> Back
        </motion.button>
      </div>

      <motion.div
        style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', flex: 1 }}
        initial="initial" animate="animate"
        variants={{ animate: { transition: { staggerChildren: 0.07 } } }}
      >
        <motion.div variants={field}>
          <div className="heading">Create a room</div>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6 }}>Set the rules, share the code</p>
        </motion.div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Room name */}
          <motion.div variants={field}>
            <p className="label-cipher" style={{ marginBottom: 8 }}>Room Name</p>
            <input className="input" type="text" value={roomName} onChange={e => setRoomName(e.target.value)} placeholder="Squad Night" maxLength={24} />
          </motion.div>

          {/* Buy-in */}
          <motion.div variants={field}>
            <p className="label-cipher" style={{ marginBottom: 8 }}>Entry fee (SOL)</p>
            {/* Presets */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', paddingBottom: 4 }}>
              {['0', '0.01', '0.05', '0.1', '0.5', '1'].map(preset => {
                const usd = preset !== '0' ? solToUsd(parseFloat(preset), solPrice) : '';
                return (
                  <button
                    key={preset}
                    onClick={() => setBuyIn(preset)}
                    style={{
                      padding: '5px 14px',
                      borderRadius: 'var(--r-pill)',
                      border: `1px solid ${buyIn === preset ? 'var(--lime)' : 'var(--border)'}`,
                      background: buyIn === preset ? 'rgba(196,255,60,0.12)' : 'var(--glass)',
                      color: buyIn === preset ? 'var(--lime)' : 'var(--muted)',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      fontFamily: 'Space Grotesk',
                      transition: 'all 0.15s',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, flexShrink: 0,
                    }}
                  >
                    <span>{preset === '0' ? 'Free' : `${preset} SOL`}</span>
                    {usd && <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.7 }}>{usd}</span>}
                  </button>
                );
              })}
            </div>
            <input
              className="input"
              type="number" min="0" step="0.01"
              value={buyIn}
              onChange={e => setBuyIn(e.target.value)}
              placeholder="or enter custom amount"
            />
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
              {parseFloat(buyIn) > 0
                ? `Each player puts in ${buyIn} SOL${solToUsd(parseFloat(buyIn), solPrice) ? ` ${solToUsd(parseFloat(buyIn), solPrice)}` : ''} · ${payoutMode === 'honest-talkers' ? 'pot splits among answerers' : 'winner takes everything'}`
                : 'Free game · no entry fee'}
            </p>
          </motion.div>

          {/* Mode */}
          <motion.div variants={field}>
            <p className="label-cipher" style={{ marginBottom: 10 }}>Question Mode</p>
            <div className="mode-pills">
              {MODES.map(m => (
                <motion.button
                  key={m.id}
                  className={`mode-pill ${mode === m.id ? 'active' : ''}`}
                  onClick={() => setMode(m.id)}
                  whileTap={{ scale: 0.95 }}
                  layout
                >
                  {m.emoji} {m.label}
                </motion.button>
              ))}
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={mode}
                style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                {MODES.find(m => m.id === mode)?.sub}
              </motion.p>
            </AnimatePresence>
          </motion.div>

          {/* Payout Mode */}
          <motion.div variants={field}>
            <p className="label-cipher" style={{ marginBottom: 10 }}>Payout Mode</p>
            <div className="mode-pills">
              {PAYOUT_MODES.map(m => (
                <motion.button
                  key={m.id}
                  className={`mode-pill ${payoutMode === m.id ? 'active' : ''}`}
                  onClick={() => setPayoutMode(m.id)}
                  whileTap={{ scale: 0.95 }}
                  layout
                >
                  {m.emoji} {m.label}
                </motion.button>
              ))}
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={payoutMode}
                style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                {PAYOUT_MODES.find(m => m.id === payoutMode)?.sub}
              </motion.p>
            </AnimatePresence>
          </motion.div>

          {/* Custom questions */}
          <AnimatePresence>
            {mode === 'custom' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              >
                <p className="label-cipher" style={{ marginBottom: 10 }}>Your Questions</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {customQs.map((q, i) => (
                    <motion.div
                      key={i}
                      style={{ display: 'flex', gap: 8 }}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <input
                        className="input"
                        value={q}
                        onChange={e => { const u = [...customQs]; u[i] = e.target.value; setCustomQs(u); }}
                        placeholder={`Question ${i + 1}…`}
                      />
                      {customQs.length > 2 && (
                        <button
                          onClick={() => setCustomQs(customQs.filter((_, j) => j !== i))}
                          style={{ width: 46, height: 46, flexShrink: 0, background: 'var(--glass)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </motion.div>
                  ))}
                  <button
                    onClick={() => setCustomQs([...customQs, ''])}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--lavender)', fontSize: 13, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
                  >
                    <Plus size={13} /> Add question
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Summary chips */}
          <motion.div variants={field} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="chip chip-lime">
              {parseFloat(buyIn) > 0 ? `${buyIn} SOL` : 'Free'} game
            </span>
            <span className="chip chip-lavender">{MODES.find(m => m.id === mode)?.label} mode</span>
            <span className="chip chip-muted">{PAYOUT_MODES.find(m => m.id === payoutMode)?.emoji} {PAYOUT_MODES.find(m => m.id === payoutMode)?.label}</span>
          </motion.div>

          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
              style={{ background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 'var(--r-sm)', padding: '12px 14px', color: 'var(--red)', fontSize: 13 }}
            >
              {error}
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Sticky CTA */}
      <div style={{ width: '100%', paddingTop: 10 }}>
        <motion.button
          className="btn btn-primary"
          onClick={handleCreate}
          disabled={loading}
          whileTap={{ scale: 0.96 }}
          whileHover={!loading ? { scale: 1.03, boxShadow: '0 0 40px rgba(196,255,60,0.45)' } : {}}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        >
          {loading ? 'Creating…' : 'Create Game →'}
        </motion.button>
      </div>
    </div>
    </WalletSetupGate>
  );
};
