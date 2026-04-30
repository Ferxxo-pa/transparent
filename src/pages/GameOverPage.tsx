import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { calculateSplitPayouts } from '../types/game';

export const GameOverPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, resetGame, distributeWinnings, distributePredictions, predictions, predictionPot, pollGameState } = useGame();
  const { publicKey } = usePrivyWallet();
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

  const shareResult = () => {
    const myWallet = publicKey?.toBase58() ?? '';
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
      setDistStatus(isSplitPot ? 'Distributing game pot…' : 'Sending winnings…');
      await distributeWinnings(activeWinner);
      if (predictions.length > 0) {
        setDistStatus('Distributing prediction pot…');
        await distributePredictions(activeWinner).catch(() => {});
      }
      setDistStatus('');
      setConfirmed(true);
    } catch (e: any) {
      setDistErr(e?.message || 'Distribution failed');
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

  return (
    <div className="page fade-in">
      {/* Top row */}
      <div style={{ width: '100%', paddingTop: 16, marginBottom: 20 }}>
        <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em' }}>
          {confirmed ? '🎉 Game Over' : 'Game Over'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', flex: 1 }}>

        {/* Winner / Pot hero */}
        <AnimatePresence mode="wait">
          {confirmed ? (
            <motion.div
              key="confirmed"
              style={{
                textAlign: 'center', padding: '32px 18px',
                background: 'linear-gradient(135deg, rgba(196,255,60,0.14), rgba(196,255,60,0.04))',
                border: '1px solid var(--lime-border)', borderRadius: 'var(--r)',
                position: 'relative', overflow: 'hidden',
              }}
              initial={{ opacity: 0, scale: 0.88, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            >
              {isSplitPot ? (
                <>
                  <motion.div
                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                    transition={{ delay: 0.15, type: 'spring', stiffness: 400, damping: 18 }}
                    style={{ fontSize: 42, marginBottom: 10 }}
                  >🤝</motion.div>
                  <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>Pot Distributed</p>
                  <motion.p
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                    style={{ fontWeight: 800, fontSize: 'clamp(26px, 7vw, 34px)', color: 'var(--lime)', letterSpacing: '-0.03em', lineHeight: 1 }}
                  >
                    Split Complete
                  </motion.p>
                  <motion.p
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
                    style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}
                  >
                    {gameState.currentPot.toFixed(2)} SOL distributed by honesty score
                  </motion.p>
                </>
              ) : (
                <>
                  <motion.div
                    initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.1, type: 'spring', stiffness: 380, damping: 16 }}
                    style={{ fontSize: 48, marginBottom: 10 }}
                  >🏆</motion.div>
                  <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>Winner</p>
                  <motion.p
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                    style={{ fontWeight: 800, fontSize: 'clamp(28px, 8vw, 42px)', color: 'var(--lime)', letterSpacing: '-0.03em', lineHeight: 1 }}
                  >
                    {winnerPlayer?.name}
                  </motion.p>
                  {gameState.buyInAmount > 0 && (
                    <motion.p
                      initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35, type: 'spring', stiffness: 300 }}
                      style={{ color: 'var(--lime)', fontSize: 22, fontWeight: 800, marginTop: 8, letterSpacing: '-0.02em' }}
                    >
                      +{gameState.currentPot.toFixed(3)} SOL
                    </motion.p>
                  )}
                </>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="pending"
              style={{
                textAlign: 'center', padding: '28px 18px',
                background: 'linear-gradient(135deg, rgba(196,255,60,0.08), rgba(196,255,60,0.02))',
                border: '1px solid var(--lime-border)', borderRadius: 'var(--r)',
              }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
            >
              <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>Total Pot</p>
              <p style={{ fontWeight: 800, fontSize: 'clamp(42px, 11vw, 56px)', color: 'var(--lime)', letterSpacing: '-0.04em', lineHeight: 1 }}>
                {gameState.currentPot.toFixed(2)}
                <span style={{ fontSize: 18, color: 'var(--muted)', fontWeight: 600, marginLeft: 6 }}>SOL</span>
              </p>
              {isSplitPot && (
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                  Fake votes cost you · honest players keep more
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Leaderboard */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p className="label-cipher">
              {isSplitPot ? 'Split Pot' : isHost && !confirmed ? 'Select Winner' : 'Final Standings'}
            </p>
            {isHost && !confirmed && ranked[0] && (
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                Suggested: <span style={{ color: 'var(--lime)' }}>{ranked[0].p.name}</span>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ranked.map(({ p, s, honesty, payout }, i) => {
              const isWinner = isSplitPot ? (payout > 0) : p.id === activeWinner;
              const canSelect = isHost && !confirmed && !isSplitPot;
              const netGain = payout - gameState.buyInAmount;
              return (
                <motion.div
                  key={p.id}
                  onClick={() => canSelect && setSelected(p.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', borderRadius: 'var(--r-sm)',
                    background: isWinner ? 'rgba(196,255,60,0.06)' : 'var(--glass)',
                    border: `1px solid ${isWinner ? 'var(--lime-border)' : 'var(--border)'}`,
                    cursor: canSelect ? 'pointer' : 'default',
                  }}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  whileTap={canSelect ? { scale: 0.98 } : {}}
                >
                  <span style={{ fontWeight: 800, fontSize: 16, color: i === 0 ? 'var(--lime)' : 'var(--muted)', width: 20, flexShrink: 0 }}>
                    {i + 1}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</span>
                      {isSplitPot && netGain > 0.001 && <span className="chip chip-lime" style={{ fontSize: 9, padding: '1px 7px' }}>+{netGain.toFixed(3)} SOL</span>}
                      {isSplitPot && netGain < -0.001 && <span className="chip" style={{ fontSize: 9, padding: '1px 7px', background: 'rgba(255,80,80,0.15)', color: '#ff5050' }}>{netGain.toFixed(3)} SOL</span>}
                      {!isSplitPot && i === 0 && ranked[0].t > 0 && <span className="chip chip-lime" style={{ fontSize: 9, padding: '1px 7px' }}>Most honest</span>}
                      {!isSplitPot && isWinner && isHost && !confirmed && <span className="chip chip-white" style={{ fontSize: 9, padding: '1px 7px' }}>Selected</span>}
                    </div>
                    {s ? (
                      <div style={{ display: 'flex', gap: 8, marginTop: 2, fontSize: 11, color: 'var(--muted)' }}>
                        <span style={{ color: 'var(--lime)' }}>✓ {s.transparent}</span>
                        <span>✗ {s.fake}</span>
                        <span>{Math.round(honesty * 100)}%</span>
                        {isSplitPot && gameState.buyInAmount > 0 && (
                          <span style={{ color: 'var(--lavender)' }}>→ {payout.toFixed(3)} SOL</span>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>No votes</span>
                    )}
                  </div>
                  {confirmed && !isSplitPot && isWinner && (
                    <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--lime)', whiteSpace: 'nowrap' }}>
                      +{gameState.currentPot.toFixed(2)} SOL
                    </span>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>

        {distErr && (
          <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 'var(--r-sm)', padding: '10px 14px', color: 'var(--red)', fontSize: 12 }}>
            {distErr}
          </div>
        )}

        {/* Prediction results */}
        {predictions.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <p className="label-cipher">🎯 Predictions</p>
              <span style={{ fontSize: 11, color: 'var(--lavender)', fontWeight: 700 }}>{predPotSol} SOL</span>
            </div>
            <div style={{ background: 'var(--glass)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {correctPredictions.length > 0 ? (
                <>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--lime)' }}>
                    ✅ {correctPredictions.length} correct · ~{perWinner} SOL each
                  </p>
                  {correctPredictions.map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{p.bettor_name}</span>
                      <span style={{ color: 'var(--lime)' }}>+{perWinner}</span>
                    </div>
                  ))}
                </>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--muted)' }}>Nobody predicted the winner 🤷</p>
              )}
              {incorrectPredictions.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                  {incorrectPredictions.map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span style={{ color: 'var(--muted)' }}>{p.bettor_name}</span>
                      <span style={{ color: 'var(--red)' }}>L</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* CTA */}
      <div style={{ width: '100%', paddingTop: 16, paddingBottom: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isHost && !confirmed && (
          <motion.button
            className="btn btn-primary"
            onClick={distribute}
            disabled={distributing || (!isSplitPot && !activeWinner)}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.03, boxShadow: '0 0 40px rgba(196,255,60,0.45)' }}
          >
            {distributing ? (distStatus || 'Sending…') : isSplitPot
              ? gameState.buyInAmount > 0
                ? `Distribute ${gameState.currentPot.toFixed(2)} SOL by honesty`
                : `End Game 🤝`
              : gameState.buyInAmount > 0
                ? `Send ${gameState.currentPot.toFixed(2)} SOL → ${winnerPlayer?.name ?? 'Winner'}`
                : `Crown ${winnerPlayer?.name ?? 'Winner'} 👑`
            }
          </motion.button>
        )}

        {/* Player view: show their payout and waiting status */}
        {!isHost && gameState.buyInAmount > 0 && (() => {
          const myWallet = publicKey?.toBase58() ?? '';
          const myPayout = isSplitPot ? (splitPayouts[myWallet] ?? 0) : (activeWinner === myWallet ? gameState.currentPot : 0);
          const myNet = myPayout - gameState.buyInAmount;
          const isWinner = !isSplitPot && activeWinner === myWallet;
          return (
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              style={{
                textAlign: 'center', padding: '18px 16px', borderRadius: 'var(--r-sm)',
                background: myNet >= 0 ? 'rgba(196,255,60,0.06)' : 'rgba(255,80,80,0.06)',
                border: `1px solid ${myNet >= 0 ? 'var(--lime-border)' : 'rgba(255,80,80,0.3)'}`,
              }}
            >
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>
                Your Result
              </p>
              <p style={{
                fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em',
                color: myNet >= 0 ? 'var(--lime)' : '#ff5050',
              }}>
                {myNet >= 0 ? '+' : ''}{myNet.toFixed(3)} SOL
              </p>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                {isSplitPot
                  ? `Payout: ${myPayout.toFixed(3)} SOL (bought in ${gameState.buyInAmount.toFixed(3)})`
                  : isWinner ? `You won the pot!` : `Better luck next time`
                }
              </p>
              {!confirmed && (
                <p style={{ fontSize: 11, color: 'var(--lavender)', marginTop: 10, fontWeight: 600 }}>
                  Waiting for host to distribute…
                </p>
              )}
              {confirmed && (
                <p style={{ fontSize: 11, color: 'var(--lime)', marginTop: 10, fontWeight: 600 }}>
                  Funds sent to your wallet
                </p>
              )}
            </motion.div>
          );
        })()}

        {/* Share result — visible to everyone after game ends */}
        {(confirmed || !isHost) && (
          <motion.button
            onClick={shareResult}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            whileTap={{ scale: 0.96 }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px 20px', borderRadius: 'var(--r-sm)',
              background: 'rgba(29,161,242,0.1)', border: '1px solid rgba(29,161,242,0.3)',
              color: '#1DA1F2', fontWeight: 700, fontSize: 14,
              cursor: 'pointer', fontFamily: 'Space Grotesk',
            }}
          >
            Share Result on X
          </motion.button>
        )}

        {/* Return Home */}
        {(confirmed || !isHost) && (
          <motion.button
            className="btn btn-primary"
            onClick={() => { resetGame(); navigate('/'); }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            whileTap={{ scale: 0.96 }}
          >
            {confirmed ? 'Play Again' : 'Return Home'}
          </motion.button>
        )}
      </div>

      {/* ── Payout Received Popup ── */}
      {showPayoutPopup && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
          }}
          onClick={() => setShowPayoutPopup(false)}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--glass-bg, rgba(30,30,40,0.95))',
              border: '1px solid var(--lime-border, rgba(196,255,60,0.3))',
              borderRadius: 'var(--r-md, 16px)',
              padding: '32px 40px',
              textAlign: 'center',
              maxWidth: 360,
              width: '90%',
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>💰</div>
            <h2 style={{
              fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em',
              marginBottom: 8, color: 'var(--text, #fff)',
            }}>
              Payout Received!
            </h2>
            <p style={{
              fontSize: 36, fontWeight: 800, letterSpacing: '-0.03em',
              color: 'var(--lime, #c4ff3c)',
              marginBottom: 8,
            }}>
              {payoutAmount.toFixed(3)} SOL
            </p>
            <p style={{
              fontSize: 13, color: 'var(--muted, #888)',
              marginBottom: 4,
            }}>
              {(() => {
                const net = payoutAmount - (gameState?.buyInAmount ?? 0);
                if (net > 0) return `+${net.toFixed(3)} SOL profit 🎉`;
                if (net === 0) return `Broke even — your buy-in returned`;
                return `${net.toFixed(3)} SOL net`;
              })()}
            </p>
            <p style={{ fontSize: 11, color: 'var(--muted, #888)', marginTop: 4 }}>
              Funds have been sent to your wallet
            </p>
            <motion.button
              onClick={() => setShowPayoutPopup(false)}
              whileTap={{ scale: 0.96 }}
              style={{
                marginTop: 20, padding: '10px 32px', borderRadius: 'var(--r-sm, 10px)',
                background: 'var(--lime, #c4ff3c)', color: '#000',
                fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer',
              }}
            >
              Nice 🤙
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
};
