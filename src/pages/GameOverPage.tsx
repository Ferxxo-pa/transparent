import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { calculateSplitPayouts } from '../types/game';
import { Blobs, BackButton, SolMark, usdEstimate, WalletChip } from '../components';
import { useSolPrice } from '../hooks/useSolPrice';

/* ── helpers ─────────────────────────────────────────────── */
const FLAVOR = [
  'most convincing liar 🤥',
  'silver-tongued devil 😈',
  'poker-faced legend 🃏',
  'ice-cold bluffer 🧊',
  'truth bender 🌀',
];

export const GameOverPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, resetGame, distributeWinnings, distributePredictions, predictions, predictionPot, pollGameState } = useGame();
  const { publicKey } = usePrivyWallet();
  const solPrice = useSolPrice();
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [distStatus, setDistStatus] = useState('');
  const [distErr, setDistErr] = useState<string | null>(null);
  const [showPayoutPopup, setShowPayoutPopup] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState(0);

  // Fetch final state on mount
  useEffect(() => { pollGameState(); }, [pollGameState]);

  // Show payout popup when player receives funds
  useEffect(() => {
    const myPayout = (gameState as any)?.myPayout;
    const potDist = (gameState as any)?.potDistributed;
    if (potDist && myPayout > 0 && !showPayoutPopup) {
      setPayoutAmount(myPayout);
      setShowPayoutPopup(true);
      setConfirmed(true);
    }
  }, [(gameState as any)?.myPayout, (gameState as any)?.potDistributed]);

  const isHost = publicKey?.toBase58() === (gameState as any)?.hostWallet;
  const scores = gameState?.scores ?? {};
  const isSplitPot = gameState?.payoutMode === 'split-pot';
  const totalRounds = gameState ? (gameState.numQuestions > 0 ? gameState.numQuestions : gameState.players.length) : 0;
  const hostWallet = (gameState as any)?.hostWallet ?? '';

  // Calculate split-pot payouts (host excluded — they're the pot holder, not a player)
  const splitPayouts = useMemo(() => {
    if (!isSplitPot || !gameState) return {};
    const playerScores: Record<string, any> = {};
    for (const [w, s] of Object.entries(scores)) {
      if (w !== hostWallet) playerScores[w] = s;
    }
    return calculateSplitPayouts(playerScores, gameState.buyInAmount, totalRounds);
  }, [isSplitPot, scores, gameState?.buyInAmount, totalRounds, hostWallet]);

  // Guard AFTER all hooks to avoid rules-of-hooks violation
  if (!gameState) return null;

  // Exclude host from rankings — host is pot holder, not a player
  const ranked = gameState.players
    .filter(p => p.id !== hostWallet)
    .map(p => {
      const s = scores[p.id];
      const t = s ? s.transparent + s.fake : 0;
      const honesty = t > 0 ? s.transparent / t : 0;
      const answered = s ? s.rounds > 0 : false;
      const payout = splitPayouts[p.id] ?? 0;
      return { p, s, honesty, t, answered, payout };
    })
    .sort((a, b) => b.honesty - a.honesty);

  const activeWinner = selected ?? ranked[0]?.p.id ?? null;
  const winnerPlayer = gameState.players.find(p => p.id === activeWinner);
  const myWallet = publicKey?.toBase58() ?? '';

  const shareResult = () => {
    const myScore = scores[myWallet];
    const honesty = myScore && (myScore.transparent + myScore.fake) > 0
      ? Math.round((myScore.transparent / (myScore.transparent + myScore.fake)) * 100)
      : null;

    let text = '';
    if (isSplitPot && gameState.buyInAmount > 0) {
      const myPayout = splitPayouts[myWallet] ?? 0;
      const net = myPayout - gameState.buyInAmount;
      text = net > 0.0001
        ? `Just won ${net.toFixed(3)} SOL on Transparent 💰${honesty !== null ? ` — ${honesty}% transparent rating` : ''}`
        : net < -0.0001
        ? `Lost ${Math.abs(net).toFixed(3)} SOL on Transparent 😅 — couldn't fool anyone`
        : `Broke even on Transparent${honesty !== null ? ` — ${honesty}% transparent` : ''}`;
    } else if (!isSplitPot) {
      const isWinner = activeWinner === myWallet;
      text = isWinner
        ? `Just won ${gameState.currentPot.toFixed(2)} SOL on Transparent 🏆 — they couldn't read me`
        : `Got caught on Transparent 😅${honesty !== null ? ` — only ${honesty}% believed me` : ''}`;
    } else {
      text = honesty !== null
        ? `${honesty}% transparent on Transparent 👀 — can you beat me?`
        : `Just played Transparent — can you stay honest under pressure?`;
    }

    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text + '\n\ntransparent.gg')}`,
      '_blank',
    );
  };

  const distribute = async () => {
    if (!activeWinner) return;
    setDistributing(true);
    setDistErr(null);
    try {
      setDistStatus(isSplitPot ? 'distributing game pot…' : 'sending winnings…');
      await distributeWinnings(activeWinner);
      if (predictions.length > 0) {
        setDistStatus('distributing prediction pot…');
        await distributePredictions(activeWinner).catch(() => {});
      }
      setDistStatus('');
      setConfirmed(true);
    } catch (e: any) {
      setDistErr(e?.message || 'distribution failed');
      setDistStatus('');
      setConfirmed(true);
    }
    setDistributing(false);
  };

  const LAMPORTS = 1_000_000_000;
  const correctPredictions = predictions.filter(p => p.predicted_winner_wallet === activeWinner);
  const incorrectPredictions = predictions.filter(p => p.predicted_winner_wallet !== activeWinner);
  const predPotSol = (predictionPot / LAMPORTS).toFixed(3);
  const perWinner = correctPredictions.length > 0 ? (predictionPot / LAMPORTS / correctPredictions.length).toFixed(3) : '0';

  const winnerNet = isSplitPot
    ? (splitPayouts[activeWinner ?? ''] ?? 0) - gameState.buyInAmount
    : gameState.currentPot - gameState.buyInAmount;

  const usdWinner = usdEstimate(Math.abs(winnerNet), 'sol', solPrice);

  /* which row is "me"? */
  const myNet = isSplitPot
    ? (splitPayouts[myWallet] ?? 0) - gameState.buyInAmount
    : (activeWinner === myWallet ? gameState.currentPot - gameState.buyInAmount : -gameState.buyInAmount);

  return (
    <>
      <Blobs palette="win" />

      <div className="page page--game fade-in" style={{ position: 'relative', zIndex: 1 }}>
        {/* ── header row ── */}
        <div className="navbar" style={{ marginBottom: 16 }}>
          <BackButton onClick={() => { resetGame(); navigate('/'); }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="chip chip-acid">final ✦</span>
            <WalletChip />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', flex: 1 }}>

          {/* ── winner card ── */}
          <motion.div
            className="glass glass-strong"
            style={{ padding: '32px 24px', borderRadius: 32, textAlign: 'center' }}
            initial={{ opacity: 0, scale: 0.88, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          >
            <p className="mono" style={{ fontSize: 11, letterSpacing: '0.22em', color: 'var(--acid)', textTransform: 'uppercase', marginBottom: 8 }}>
              winner
            </p>

            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 400, damping: 18 }}
              style={{ fontSize: 72, lineHeight: 1, marginBottom: 4, animation: 'glow 2s ease-in-out infinite' }}
            >
              {isSplitPot ? '🤝' : '🏆'}
            </motion.div>

            <motion.p
              className="display"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              style={{ fontSize: 56, color: 'var(--acid)', lineHeight: 0.9, marginBottom: 8 }}
            >
              {isSplitPot ? 'split complete' : (winnerPlayer?.name ?? '').toLowerCase()}
            </motion.p>

            {gameState.buyInAmount > 0 && (
              <motion.div
                className="money"
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35 }}
                style={{ fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, marginBottom: 4 }}
              >
                <SolMark size={20} tone="acid" />
                <span style={{ color: 'var(--acid)' }}>
                  {winnerNet >= 0 ? '+' : ''}{winnerNet.toFixed(3)}
                </span>
                {usdWinner && <span className="mono" style={{ fontSize: 11, color: 'var(--ink-soft)' }}>({usdWinner})</span>}
              </motion.div>
            )}

            <p className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
              {isSplitPot
                ? `${gameState.currentPot.toFixed(2)} sol distributed by honesty score`
                : FLAVOR[Math.abs((winnerPlayer?.name ?? '').charCodeAt(0)) % FLAVOR.length]}
            </p>
          </motion.div>

          {/* ── leaderboard ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ranked.map(({ p, s, honesty, payout }, i) => {
              const isWinner = isSplitPot ? (payout > 0) : p.id === activeWinner;
              const canSelect = isHost && !confirmed && !isSplitPot;
              const netGain = isSplitPot ? payout - gameState.buyInAmount : (p.id === activeWinner ? gameState.currentPot - gameState.buyInAmount : -gameState.buyInAmount);
              const isMe = p.id === myWallet;

              return (
                <motion.div
                  key={p.id}
                  className="glass-flat"
                  onClick={() => canSelect && setSelected(p.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 16,
                    cursor: canSelect ? 'pointer' : 'default',
                    ...(isMe ? { background: 'rgba(255,59,139,0.10)', borderColor: 'rgba(255,59,139,0.4)' } : {}),
                  }}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  whileTap={canSelect ? { scale: 0.98 } : {}}
                >
                  {/* rank */}
                  <span className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)', width: 16, flexShrink: 0 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>

                  {/* name + stats */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 800, fontSize: 14 }}>{(p.name || 'anon').toLowerCase()}</span>
                    {s ? (
                      <div className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 2 }}>
                        ✓{s.transparent} ✗{s.fake} · {Math.round(honesty * 100)}%
                      </div>
                    ) : (
                      <span className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)' }}>no votes</span>
                    )}
                  </div>

                  {/* net P&L */}
                  <span className="money" style={{
                    fontSize: 14,
                    color: netGain >= 0.001 ? 'var(--acid)' : 'var(--ink-faint)',
                    whiteSpace: 'nowrap',
                  }}>
                    {netGain >= 0 ? '+' : ''}{netGain.toFixed(3)}
                  </span>
                </motion.div>
              );
            })}
          </div>

          {/* ── prediction results ── */}
          {predictions.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
              <p className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                predictions · {predPotSol} sol
              </p>
              <div className="glass-flat" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 16 }}>
                {correctPredictions.length > 0 ? (
                  <>
                    <p className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--acid)' }}>
                      ✅ {correctPredictions.length} correct · ~{perWinner} sol each
                    </p>
                    {correctPredictions.map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ fontWeight: 600 }}>{p.bettor_name}</span>
                        <span style={{ color: 'var(--acid)' }}>+{perWinner}</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="mono" style={{ fontSize: 12, color: 'var(--ink-faint)' }}>nobody predicted the winner 🤷</p>
                )}
                {incorrectPredictions.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--glass-stroke)', paddingTop: 6 }}>
                    {incorrectPredictions.map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ color: 'var(--ink-faint)' }}>{p.bettor_name}</span>
                        <span style={{ color: 'var(--coral)' }}>L</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {distErr && (
            <div className="glass-flat" style={{ padding: '10px 14px', borderRadius: 12, borderColor: 'rgba(255,92,92,0.3)', color: 'var(--coral)', fontSize: 12 }}>
              {distErr}
            </div>
          )}
        </div>

        {/* ── CTAs ── */}
        <div style={{ width: '100%', paddingTop: 14, paddingBottom: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isHost && !confirmed && (
            <motion.button
              className="btn btn-degen"
              onClick={distribute}
              disabled={distributing || (!isSplitPot && !activeWinner)}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              whileTap={{ scale: 0.96 }}
            >
              {distributing ? (distStatus || 'sending…') : (
                <>
                  claim <SolMark size={18} tone="dark" /> {gameState.currentPot.toFixed(2)}
                  {usdEstimate(gameState.currentPot, 'sol', solPrice) && (
                    <span> ({usdEstimate(gameState.currentPot, 'sol', solPrice)})</span>
                  )}
                  {' '}🤑
                </>
              )}
            </motion.button>
          )}

          {(confirmed || !isHost) && (
            <>
              <motion.button
                className="btn btn-ghost"
                onClick={() => { resetGame(); navigate('/'); }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                whileTap={{ scale: 0.96 }}
              >
                run it back
              </motion.button>
            </>
          )}

          {(confirmed || !isHost) && (
            <motion.button
              className="btn btn-ghost"
              onClick={shareResult}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              whileTap={{ scale: 0.96 }}
              style={{ fontSize: 14 }}
            >
              share on x
            </motion.button>
          )}
        </div>

        {/* ── payout received popup ── */}
        <AnimatePresence>
          {showPayoutPopup && (
            <motion.div
              className="scrim"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => setShowPayoutPopup(false)}
            >
              <motion.div
                className="glass glass-strong"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                onClick={e => e.stopPropagation()}
                style={{
                  padding: '36px 32px', textAlign: 'center',
                  maxWidth: 320, width: '90%', borderRadius: 32,
                  animation: 'pop 0.35s ease both',
                }}
              >
                {/* sticker */}
                <span className="sticker sticker-acid" style={{ marginBottom: 18, display: 'inline-block' }}>
                  + profit
                </span>

                {/* huge amount */}
                <div className="money" style={{ fontSize: 64, color: 'var(--acid)', lineHeight: 1, marginBottom: 6, animation: 'glow 2s ease-in-out infinite', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                  <SolMark size={48} tone="acid" />
                  {payoutAmount.toFixed(3)}
                </div>

                <p className="mono" style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 4 }}>
                  ≈ {usdEstimate(payoutAmount, 'sol', solPrice) || '$?.??'} usd
                </p>

                <p className="mono" style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                  {(() => {
                    const net = payoutAmount - (gameState?.buyInAmount ?? 0);
                    if (net > 0) return `+${net.toFixed(3)} above buy-in 🚀`;
                    if (net === 0) return 'broke even — buy-in returned';
                    return `${net.toFixed(3)} net`;
                  })()}
                </p>

                <motion.button
                  className="btn btn-degen"
                  onClick={() => setShowPayoutPopup(false)}
                  whileTap={{ scale: 0.96 }}
                  style={{ marginTop: 24 }}
                >
                  collect
                </motion.button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};
