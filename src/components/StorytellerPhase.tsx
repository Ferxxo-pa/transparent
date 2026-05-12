import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
interface Props {
  phase: 'storyteller-prep' | 'storyteller-telling' | 'storyteller-voting' | 'storyteller-reveal';
  prompt: string;
  isHotSeat: boolean;
  isHost: boolean;
  playerName: string;
  storytellerChoice: 'truth' | 'fake' | null;
  votes: Record<string, 'transparent' | 'fake'>;
  voteCount: number;
  voterCount: number;
  myVote?: 'transparent' | 'fake';
  buyInAmount: number;
  stakeVotes?: Record<string, { vote: 'transparent' | 'fake'; stake: number }>;
  onChoose: (choice: 'truth' | 'fake') => void;
  onVote: (vote: 'transparent' | 'fake') => void;
  onStakeVote: (vote: 'transparent' | 'fake', stake: number) => void;
  onAdvance: () => void;
}

const STORYTELLER_TIME_LIMIT = 60; // seconds
const TIME_EXTENSION = 15; // seconds per purchase
const EXTENSION_COST = 0.01; // SOL

/** highlight a middle phrase in pink italic-serif */
const renderPrompt = (text: string) => {
  const words = text.split(' ');
  if (words.length <= 4) return <span className="italic-serif" style={{ color: 'var(--pink)' }}>{text.toLowerCase()}</span>;
  const mid = Math.floor(words.length / 2);
  const start = Math.max(mid - 1, 0);
  const end = Math.min(mid + 2, words.length);
  return (
    <>
      {words.slice(0, start).join(' ').toLowerCase()}{' '}
      <span className="italic-serif" style={{ color: 'var(--pink)' }}>{words.slice(start, end).join(' ').toLowerCase()}</span>
      {' '}{words.slice(end).join(' ').toLowerCase()}
    </>
  );
};

/** Circular countdown timer */
const CountdownRing = ({ seconds, total }: { seconds: number; total: number }) => {
  const pct = seconds / total;
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const isLow = seconds <= 10;
  const color = isLow ? '#FF5C5C' : 'var(--acid)';

  return (
    <div style={{ position: 'relative', width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={80} height={80} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={40} cy={40} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={4} />
        <circle
          cx={40} cy={40} r={radius} fill="none"
          stroke={color}
          strokeWidth={4}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
        />
      </svg>
      <span className="money" style={{
        position: 'absolute', fontSize: 22, color,
        animation: isLow ? 'pulse 1s ease infinite' : 'none',
      }}>
        {seconds}
      </span>
    </div>
  );
};

export const StorytellerPhase: React.FC<Props> = ({
  phase, prompt, isHotSeat, isHost, playerName, storytellerChoice,
  votes, voteCount, voterCount, myVote, buyInAmount, stakeVotes,
  onChoose, onVote, onStakeVote, onAdvance,
}) => {
  const [doneTelling, setDoneTelling] = useState(false);
  const [recording, setRecording] = useState(false);
  const [stakeAmount, setStakeAmount] = useState(buyInAmount > 0 ? buyInAmount * 0.25 : 0);

  // Timer state
  const [timeLeft, setTimeLeft] = useState(STORYTELLER_TIME_LIMIT);
  const [totalTime, setTotalTime] = useState(STORYTELLER_TIME_LIMIT);
  const [extensions, setExtensions] = useState<string[]>([]); // who bought time
  const [showTimeBought, setShowTimeBought] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasAutoAdvanced = useRef(false);

  // Start/stop timer based on phase
  useEffect(() => {
    if (phase === 'storyteller-telling' && !doneTelling) {
      hasAutoAdvanced.current = false;
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, doneTelling]);

  // Auto-advance when timer hits 0
  useEffect(() => {
    if (timeLeft === 0 && phase === 'storyteller-telling' && !doneTelling && !hasAutoAdvanced.current) {
      hasAutoAdvanced.current = true;
      setDoneTelling(true);
      onAdvance();
    }
  }, [timeLeft, phase, doneTelling, onAdvance]);

  const buyMoreTime = useCallback(() => {
    setTimeLeft(prev => prev + TIME_EXTENSION);
    setTotalTime(prev => prev + TIME_EXTENSION);
    setExtensions(prev => [...prev, 'you']);
    setShowTimeBought('you');
    setTimeout(() => setShowTimeBought(null), 2000);
  }, []);

  // Reset timer when phase changes away from telling
  useEffect(() => {
    if (phase !== 'storyteller-telling') {
      setTimeLeft(STORYTELLER_TIME_LIMIT);
      setTotalTime(STORYTELLER_TIME_LIMIT);
      setDoneTelling(false);
      setExtensions([]);
      hasAutoAdvanced.current = false;
    }
  }, [phase]);

  // ── PREP PHASE: Hot-seat player sees prompt, chooses truth/fake ──
  if (phase === 'storyteller-prep') {
    if (isHotSeat) {
      return (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', alignItems: 'center', textAlign: 'center' }}
        >
          {/* header */}
          <span className="chip chip-pink" style={{ fontSize: 11 }}>you're in the chair 🪑</span>

          {/* prompt card */}
          <div className="glass glass-strong" style={{ padding: 28, borderRadius: 28, textAlign: 'center', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
              <span className="sticker sticker-pink">prompt</span>
              <span className="sticker sticker-tangerine" style={{ transform: 'rotate(2deg)' }}>spicy</span>
            </div>
            <p className="display" style={{ fontSize: 30, lineHeight: 1.3 }}>
              {renderPrompt(prompt)}
            </p>
            <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 14, maxWidth: 300, margin: '14px auto 0' }}>
              tell the table out loud. truth or made up — your call.
            </p>
          </div>

          {/* premium toggle */}
          <button
            className="glass-flat"
            onClick={() => setRecording(!recording)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer', textAlign: 'left' }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: '50%',
              background: recording ? 'var(--pink)' : 'transparent',
              border: recording ? 'none' : '2px solid var(--glass-stroke-hi)',
              boxShadow: recording ? '0 0 16px var(--pink-glow)' : 'none',
              animation: recording ? 'pulseDot 2s ease infinite' : 'none',
              flexShrink: 0,
            }} />
            <div style={{ flex: 1 }}>
              <p className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink)' }}>record this round</p>
              <p className="mono" style={{ fontSize: 9, color: 'var(--ink-faint)', marginTop: 2 }}>save the receipt to share later</p>
            </div>
            <span className="sticker sticker-acid" style={{ fontSize: 9 }}>premium ✦</span>
          </button>

          {/* choice buttons */}
          <div style={{ display: 'flex', gap: 12, width: '100%' }}>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => onChoose('truth')}
              className="vote-btn is-truth"
              style={{ flex: 1, padding: '18px' }}
            >
              <span style={{ fontSize: 24 }}>😇</span>
              <span style={{ fontSize: 14, fontWeight: 800 }}>truth</span>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => onChoose('fake')}
              className="vote-btn is-bluff"
              style={{ flex: 1, padding: '18px' }}
            >
              <span style={{ fontSize: 24 }}>🤥</span>
              <span style={{ fontSize: 14, fontWeight: 800 }}>bluff</span>
            </motion.button>
          </div>

          {/* footer */}
          <p className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)', textAlign: 'center' }}>
            the table votes truth or bluff next
          </p>
        </motion.div>
      );
    }

    // Other players wait
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ textAlign: 'center', padding: 40 }}
      >
        <p className="display" style={{ fontSize: 18, marginBottom: 8 }}>{playerName.toLowerCase()} is preparing...</p>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 8 }}>
          they're about to tell a story. your job: figure out if it's real or fake.
        </p>
        <div className="loading-dots" style={{ marginTop: 20 }}>
          <span>•</span><span>•</span><span>•</span>
        </div>
      </motion.div>
    );
  }

  // ── TELLING PHASE: Hot-seat tells the story with countdown timer ──
  if (phase === 'storyteller-telling') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', alignItems: 'center', textAlign: 'center' }}
      >
        {/* Timer */}
        <CountdownRing seconds={timeLeft} total={totalTime} />

        {/* prompt card */}
        <div className="glass glass-strong" style={{ padding: 28, borderRadius: 28, textAlign: 'center', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
            <span className="sticker sticker-pink">prompt</span>
          </div>
          <p className="display" style={{ fontSize: 26, lineHeight: 1.35 }}>
            {renderPrompt(prompt)}
          </p>
        </div>

        <p className="display" style={{ fontSize: 18, color: 'var(--ink)' }}>
          {isHotSeat ? "you're telling your story!" : `${playerName.toLowerCase()} is telling their story...`}
        </p>

        {isHotSeat && storytellerChoice && (
          <span className="chip" style={{
            background: storytellerChoice === 'truth' ? 'rgba(77,168,255,0.12)' : 'rgba(255,138,42,0.12)',
            color: storytellerChoice === 'truth' ? 'var(--azure)' : 'var(--tangerine)',
            borderColor: storytellerChoice === 'truth' ? 'rgba(77,168,255,0.3)' : 'rgba(255,138,42,0.3)',
          }}>
            {storytellerChoice === 'truth' ? '😇 you chose: truth' : '🤥 you chose: bluff'}
          </span>
        )}

        {/* Buy more time button — only for listeners (not hot seat, not host) */}
        {!isHotSeat && !doneTelling && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={buyMoreTime}
            className="glass-flat"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 10, padding: '12px 16px', cursor: 'pointer',
              border: '1px dashed rgba(196,255,60,0.3)',
            }}
          >
            <span style={{ fontSize: 16 }}>⏳</span>
            <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: 'var(--acid)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              +{TIME_EXTENSION}s more time
            </span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)' }}>
              {EXTENSION_COST} SOL
            </span>
          </motion.button>
        )}

        {/* Time bought toast */}
        <AnimatePresence>
          {showTimeBought && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="chip"
              style={{ background: 'rgba(196,255,60,0.12)', color: 'var(--acid)', borderColor: 'rgba(196,255,60,0.3)' }}
            >
              +{TIME_EXTENSION}s added
            </motion.div>
          )}
        </AnimatePresence>

        {/* Extensions log */}
        {extensions.length > 0 && (
          <p className="mono" style={{ fontSize: 9, color: 'var(--ink-faint)' }}>
            {extensions.length} time extension{extensions.length > 1 ? 's' : ''} bought
          </p>
        )}

        {/* done button for hot seat player or host */}
        {(isHotSeat || isHost) && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => { setDoneTelling(true); if (timerRef.current) clearInterval(timerRef.current); onAdvance(); }}
            className="btn-degen"
            style={{
              width: '100%', padding: '16px', marginTop: 8,
              background: doneTelling ? 'var(--ink)' : undefined,
              color: doneTelling ? 'var(--bg)' : undefined,
            }}
          >
            {doneTelling ? 'locked in ✓' : 'done telling 🎤'}
          </motion.button>
        )}

        {/* footer */}
        <p className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)', textAlign: 'center' }}>
          {timeLeft <= 10 && timeLeft > 0 ? 'time is running out...' : 'the table votes truth or bluff next'}
        </p>
      </motion.div>
    );
  }

  // ── VOTING PHASE: Everyone except hot-seat votes ──
  if (phase === 'storyteller-voting') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', alignItems: 'center', textAlign: 'center' }}
      >
        <p className="display" style={{ fontSize: 20 }}>was {playerName.toLowerCase()} being transparent?</p>

        {isHotSeat ? (
          <div className="glass glass-strong" style={{ padding: 24, borderRadius: 28, width: '100%' }}>
            <p style={{ color: 'var(--ink-soft)', fontSize: 14 }}>
              the group is voting on your story...
            </p>
            <div style={{ marginTop: 14 }}>
              <p className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)', textTransform: 'uppercase', marginBottom: 6 }}>
                {voteCount}/{voterCount} voted
              </p>
              <div className="progress" style={{ boxShadow: '0 0 12px var(--acid-glow)' }}>
                <div className="progress-bar" style={{ width: `${(voteCount / Math.max(voterCount, 1)) * 100}%` }} />
              </div>
            </div>
          </div>
        ) : myVote ? (
          <div className="glass glass-strong" style={{ padding: 24, borderRadius: 28, width: '100%' }}>
            <p style={{ fontSize: 16, fontWeight: 600 }}>
              you voted: {myVote === 'transparent' ? '😇 real' : '🤥 cap'}
            </p>
            <p className="mono" style={{ color: 'var(--ink-faint)', fontSize: 10, marginTop: 8, textTransform: 'uppercase' }}>
              {voteCount}/{voterCount} voted
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
            {/* Stake slider */}
            {buyInAmount > 0 && (
              <div className="glass" style={{ padding: '14px 16px', borderRadius: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span className="mono" style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                    your stake
                  </span>
                  <span className="money" style={{ fontSize: 16, color: 'var(--acid)' }}>
                    {stakeAmount.toFixed(3)} SOL
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={buyInAmount}
                  step={buyInAmount * 0.05}
                  value={stakeAmount}
                  onChange={e => setStakeAmount(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--acid)' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span className="mono" style={{ fontSize: 9, color: 'var(--ink-faint)' }}>0</span>
                  <span className="mono" style={{ fontSize: 9, color: 'var(--ink-faint)' }}>{buyInAmount} SOL</span>
                </div>
              </div>
            )}
            <div className="vote-wrap">
              <motion.button
                whileTap={{ scale: 0.93 }}
                onClick={() => onStakeVote('transparent', stakeAmount)}
                className="vote-btn is-truth"
                style={{ flex: 1, padding: '24px 16px' }}
              >
                <span style={{ fontSize: 28 }}>😇</span>
                <span style={{ fontSize: 14, fontWeight: 800 }}>real</span>
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.93 }}
                onClick={() => onStakeVote('fake', stakeAmount)}
                className="vote-btn is-bluff"
                style={{ flex: 1, padding: '24px 16px' }}
              >
                <span style={{ fontSize: 28 }}>🧢</span>
                <span style={{ fontSize: 14, fontWeight: 800 }}>cap</span>
              </motion.button>
            </div>
          </div>
        )}

        {isHost && voteCount >= voterCount && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onAdvance}
            className="btn-degen"
            style={{ padding: '14px 32px', marginTop: 12, width: '100%' }}
          >
            reveal answer
          </motion.button>
        )}
      </motion.div>
    );
  }

  // ── REVEAL PHASE: Show if it was truth or fake ──
  if (phase === 'storyteller-reveal') {
    const isTruth = storytellerChoice === 'truth';
    const correctVoters = Object.entries(votes).filter(([, v]) => {
      if (isTruth) return v === 'transparent';
      return v === 'fake';
    }).length;
    const totalVoters = Object.keys(votes).length;

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', alignItems: 'center', textAlign: 'center' }}
      >
        <motion.div
          animate={{ rotate: [0, -10, 10, -10, 0] }}
          transition={{ duration: 0.5 }}
          style={{ fontSize: 60 }}
        >
          {isTruth ? '😇' : '🤥'}
        </motion.div>

        <p className="display" style={{ fontSize: 28, color: isTruth ? 'var(--azure)' : 'var(--tangerine)' }}>
          {isTruth ? 'it was the truth!' : 'they faked it!'}
        </p>

        <p style={{ color: 'var(--ink-soft)', fontSize: 14 }}>
          {correctVoters}/{totalVoters} guessed correctly
        </p>

        {/* Stake results */}
        {stakeVotes && Object.keys(stakeVotes).length > 0 && (
          <div className="glass" style={{ padding: '12px 16px', borderRadius: 16, width: '100%' }}>
            <p className="mono" style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>
              stake results
            </p>
            {Object.entries(stakeVotes).map(([wallet, { vote, stake }]) => {
              const correct = (isTruth && vote === 'transparent') || (!isTruth && vote === 'fake');
              return (
                <div key={wallet} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                    {wallet.slice(0, 4)}...{wallet.slice(-4)}
                  </span>
                  <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: correct ? '#5BE584' : '#FF5C5C' }}>
                    {correct ? '+' : '-'}{stake.toFixed(3)} SOL
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Vote breakdown */}
        <div style={{ display: 'flex', gap: 20, padding: '12px 0' }}>
          <div>
            <span className="money" style={{ fontSize: 24, color: 'var(--azure)' }}>
              {Object.values(votes).filter(v => v === 'transparent').length}
            </span>
            <p className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)', textTransform: 'uppercase' }}>voted truth</p>
          </div>
          <div>
            <span className="money" style={{ fontSize: 24, color: 'var(--tangerine)' }}>
              {Object.values(votes).filter(v => v === 'fake').length}
            </span>
            <p className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)', textTransform: 'uppercase' }}>voted bluff</p>
          </div>
        </div>

        {isHost && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onAdvance}
            className="btn-degen"
            style={{ padding: '14px 32px', marginTop: 12, width: '100%' }}
          >
            next round →
          </motion.button>
        )}
      </motion.div>
    );
  }

  return null;
};
