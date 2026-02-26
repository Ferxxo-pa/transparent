import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';

export const GameOverPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, resetGame, distributeWinnings, distributePredictions, predictions, predictionPot, pollGameState } = useGame();
  const { publicKey } = usePrivyWallet();
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [distErr, setDistErr] = useState<string | null>(null);

  // Fetch final state on mount
  useEffect(() => { pollGameState(); }, [pollGameState]);

  if (!gameState) return null;

  const isHost = publicKey?.toBase58() === (gameState as any).hostWallet;
  const scores = gameState.scores ?? {};
  const isHonestTalkers = gameState.payoutMode === 'honest-talkers';

  const ranked = gameState.players
    .map(p => {
      const s = scores[p.id];
      const t = s ? s.transparent + s.fake : 0;
      const honesty = t > 0 ? s.transparent / t : 0;
      // For honest-talkers: "answered" means they were in hot seat and got votes
      const answered = s ? s.rounds > 0 : false;
      return { p, s, honesty, t, answered };
    })
    .sort((a, b) => b.honesty - a.honesty);

  const answerers = ranked.filter(r => r.answered);
  const splitAmount = answerers.length > 0 ? gameState.currentPot / answerers.length : 0;

  const activeWinner = selected ?? ranked[0]?.p.id ?? null;
  const winnerPlayer = gameState.players.find(p => p.id === activeWinner);

  const distribute = async () => {
    if (!activeWinner) return;
    setDistributing(true);
    setDistErr(null);
    try {
      await distributeWinnings(activeWinner);
      if (predictions.length > 0) await distributePredictions(activeWinner).catch(() => {});
      setConfirmed(true);
    } catch (e: any) {
      setDistErr(e?.message || 'Distribution failed');
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
        <motion.div
          style={{
            textAlign: 'center', padding: '28px 18px',
            background: 'linear-gradient(135deg, rgba(196,255,60,0.1), rgba(196,255,60,0.03))',
            border: '1px solid var(--lime-border)', borderRadius: 'var(--r)',
          }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
        >
          {confirmed ? (
            isHonestTalkers ? (
              <>
                <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>Pot Split</p>
                <p style={{ fontWeight: 800, fontSize: 'clamp(26px, 7vw, 36px)', color: 'var(--lime)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                  {answerers.length} Transparent Player{answerers.length !== 1 ? 's' : ''}
                </p>
                <p style={{ color: 'var(--lime)', fontSize: 18, fontWeight: 700, marginTop: 8 }}>
                  {splitAmount.toFixed(3)} SOL each
                </p>
              </>
            ) : (
              <>
                <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>Winner</p>
                <p style={{ fontWeight: 800, fontSize: 'clamp(26px, 7vw, 36px)', color: 'var(--lime)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                  {winnerPlayer?.name}
                </p>
                <p style={{ color: 'var(--lime)', fontSize: 18, fontWeight: 700, marginTop: 8 }}>
                  +{gameState.currentPot.toFixed(2)} SOL
                </p>
              </>
            )
          ) : (
            <>
              <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>Total Pot</p>
              <p style={{ fontWeight: 800, fontSize: 'clamp(42px, 11vw, 56px)', color: 'var(--lime)', letterSpacing: '-0.04em', lineHeight: 1 }}>
                {gameState.currentPot.toFixed(2)}
                <span style={{ fontSize: 18, color: 'var(--muted)', fontWeight: 600, marginLeft: 6 }}>SOL</span>
              </p>
              {isHonestTalkers && answerers.length > 0 && (
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                  Split among {answerers.length} player{answerers.length > 1 ? 's' : ''} · {splitAmount.toFixed(3)} SOL each
                </p>
              )}
            </>
          )}
        </motion.div>

        {/* Leaderboard */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p className="label-cipher">
              {isHonestTalkers ? 'Split Pot' : isHost && !confirmed ? 'Select Winner' : 'Final Standings'}
            </p>
            {isHost && !confirmed && ranked[0] && (
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                Suggested: <span style={{ color: 'var(--lime)' }}>{ranked[0].p.name}</span>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ranked.map(({ p, s, honesty, answered }, i) => {
              const isWinner = isHonestTalkers ? answered : p.id === activeWinner;
              const canSelect = isHost && !confirmed && !isHonestTalkers;
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
                      {isHonestTalkers && answered && <span className="chip chip-lime" style={{ fontSize: 9, padding: '1px 7px' }}>Transparent ✓</span>}
                      {!isHonestTalkers && i === 0 && ranked[0].t > 0 && <span className="chip chip-lime" style={{ fontSize: 9, padding: '1px 7px' }}>Most honest</span>}
                      {!isHonestTalkers && isWinner && isHost && !confirmed && <span className="chip chip-white" style={{ fontSize: 9, padding: '1px 7px' }}>Selected</span>}
                    </div>
                    {s ? (
                      <div style={{ display: 'flex', gap: 8, marginTop: 2, fontSize: 11, color: 'var(--muted)' }}>
                        <span style={{ color: 'var(--lime)' }}>✓ {s.transparent}</span>
                        <span>✗ {s.fake}</span>
                        <span>{Math.round(honesty * 100)}%</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>No votes</span>
                    )}
                  </div>
                  {confirmed && isWinner && (
                    <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--lime)', whiteSpace: 'nowrap' }}>
                      +{isHonestTalkers ? splitAmount.toFixed(3) : gameState.currentPot.toFixed(2)} SOL
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
            disabled={distributing || (!isHonestTalkers && !activeWinner)}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.03, boxShadow: '0 0 40px rgba(196,255,60,0.45)' }}
          >
            {distributing ? 'Sending…' : isHonestTalkers
              ? gameState.buyInAmount > 0
                ? `Split ${gameState.currentPot.toFixed(2)} SOL among ${answerers.length} players`
                : `End Game 🤝`
              : gameState.buyInAmount > 0
                ? `Send ${gameState.currentPot.toFixed(2)} SOL → ${winnerPlayer?.name ?? 'Winner'}`
                : `Crown ${winnerPlayer?.name ?? 'Winner'} 👑`
            }
          </motion.button>
        )}
        <motion.button
          className={isHost && !confirmed ? 'btn btn-secondary' : 'btn btn-primary'}
          onClick={() => { resetGame(); navigate('/'); }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          whileTap={{ scale: 0.96 }}
        >
          Return Home
        </motion.button>
      </div>
    </div>
  );
};
