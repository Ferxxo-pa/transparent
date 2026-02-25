import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, TrendingUp, Coins } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';

const PREDICTION_PRESETS = [0.01, 0.05, 0.1, 0.25];
const LAMPORTS = 1_000_000_000;

export const WaitingRoomPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, startGame, loading, error, predictions, predictionPot, placePrediction } = useGame();
  const { publicKey, displayName } = usePrivyWallet();
  const [copied, setCopied] = useState(false);

  // Prediction state
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [betAmount, setBetAmount]           = useState(0.01);
  const [placing, setPlacing]               = useState(false);
  const [placed, setPlaced]                 = useState(false);

  const myWallet = publicKey?.toBase58() ?? '';
  const isHost   = myWallet === (gameState as any)?.hostWallet;

  useEffect(() => {
    if (gameState?.gameStatus === 'playing') navigate('/game');
  }, [gameState?.gameStatus, navigate]);

  if (!gameState) { navigate('/'); return null; }

  const pot = (gameState.players.length * gameState.buyInAmount).toFixed(3);

  // Prediction totals per player
  const predTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    predictions.forEach(p => {
      totals[p.predicted_winner_wallet] = (totals[p.predicted_winner_wallet] ?? 0) + p.amount_lamports;
    });
    return totals;
  }, [predictions]);

  const predPotSol = (predictionPot / LAMPORTS).toFixed(3);
  const myBet = predictions.find(p => p.bettor_wallet === myWallet);

  const copy = () => {
    navigator.clipboard.writeText(gameState.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePredict = async () => {
    if (!selectedPlayer || placing) return;
    setPlacing(true);
    const ok = await placePrediction(selectedPlayer, betAmount, displayName);
    setPlacing(false);
    if (ok) { setPlaced(true); setSelectedPlayer(null); }
  };

  return (
    <div className="page fade-in">
      {/* Top row */}
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 48, marginBottom: 12 }}>
        <span className="chip chip-lime blink" style={{ fontSize: 11 }}>● Waiting</span>
        <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
          {gameState.players.length} player{gameState.players.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', flex: 1 }}>

        {/* Room code */}
        <div className="card-pixel corner-accent scan-lines" style={{ textAlign: 'center', padding: '28px 20px' }}>
          <p className="label-cipher" style={{ marginBottom: 14 }}>Room Code</p>
          <div className="code">{gameState.roomCode}</div>
          <button
            onClick={copy}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              marginTop: 16, background: 'var(--card-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-pill)', padding: '8px 16px', cursor: 'pointer',
              color: copied ? 'var(--lime)' : 'var(--muted)', fontSize: 13, fontWeight: 600,
              fontFamily: 'Space Grotesk', transition: 'color 0.2s'
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied!' : 'Copy code'}
          </button>
        </div>

        {/* Players */}
        <div>
          <div className="section-header" style={{ marginBottom: 10 }}>
            <p className="label-cipher">Players</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {gameState.players.map((p, i) => {
              const playerPredSol = ((predTotals[p.id] ?? 0) / LAMPORTS).toFixed(3);
              const hasPreds = (predTotals[p.id] ?? 0) > 0;
              return (
                <motion.div
                  key={p.id}
                  className={`player-row ${p.id === myWallet ? 'me' : ''}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: 'spring', stiffness: 340, damping: 28, delay: i * 0.07 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--card-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--muted)', flexShrink: 0 }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name || `Player ${i + 1}`}</span>
                    {p.isHost && <span className="chip chip-muted" style={{ padding: '2px 8px', fontSize: 10 }}>Host</span>}
                    {p.id === myWallet && <span className="chip chip-white" style={{ padding: '2px 8px', fontSize: 10 }}>You</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {hasPreds && (
                      <span style={{ fontSize: 11, color: 'var(--lavender)', fontWeight: 600 }}>
                        🎯 {playerPredSol} SOL bet
                      </span>
                    )}
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--lime)' }}>
                      {gameState.buyInAmount > 0 ? `${gameState.buyInAmount} SOL` : 'Free'}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* ── Prediction Market ── */}
        {gameState.players.length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 300, damping: 28 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <TrendingUp size={13} color="var(--lavender)" />
                <p className="label-cipher">Prediction Market</p>
              </div>
              {predictionPot > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Coins size={11} color="var(--lime)" />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--lime)' }}>
                    {predPotSol} SOL pot
                  </span>
                </div>
              )}
            </div>

            <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Header */}
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                  Who's gonna win? 🎯
                </p>
                <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                  Bet on who tells the most truth. Correct predictors split the prediction pot.
                  {myBet && (
                    <span style={{ color: 'var(--lime)', fontWeight: 600 }}>
                      {' '}You bet {(myBet.amount_lamports / LAMPORTS).toFixed(3)} SOL on {
                        gameState.players.find(p => p.id === myBet.predicted_winner_wallet)?.name ?? 'someone'
                      }.
                    </span>
                  )}
                </p>
              </div>

              <AnimatePresence>
                {placed ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    style={{
                      textAlign: 'center', padding: '16px', background: 'rgba(196,255,60,0.08)',
                      border: '1px solid var(--lime-border)', borderRadius: 'var(--r-sm)',
                    }}
                  >
                    <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--lime)' }}>✅ Prediction locked in!</p>
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      You'll earn from the prediction pot if you're right.
                    </p>
                    <button
                      onClick={() => setPlaced(false)}
                      style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'Space Grotesk' }}
                    >
                      Place another bet
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                  >
                    {/* Player selection */}
                    <div>
                      <p style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pick a player</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {gameState.players.map(p => {
                          const isMe = p.id === myWallet;
                          const playerPredSol = ((predTotals[p.id] ?? 0) / LAMPORTS).toFixed(3);
                          const totalPreds = predictions.filter(pr => pr.predicted_winner_wallet === p.id).length;
                          return (
                            <motion.button
                              key={p.id}
                              onClick={() => !isMe && setSelectedPlayer(p.id)}
                              disabled={isMe}
                              whileTap={!isMe ? { scale: 0.97 } : {}}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '10px 14px', borderRadius: 'var(--r-sm)',
                                border: `1px solid ${selectedPlayer === p.id ? 'var(--lavender)' : 'var(--border)'}`,
                                background: selectedPlayer === p.id ? 'rgba(180,120,255,0.1)' : 'var(--glass)',
                                cursor: isMe ? 'not-allowed' : 'pointer',
                                opacity: isMe ? 0.4 : 1,
                                fontFamily: 'Space Grotesk',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                                  {p.name || 'Player'}
                                </span>
                                {isMe && <span style={{ fontSize: 11, color: 'var(--muted)' }}>(you)</span>}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {totalPreds > 0 && (
                                  <span style={{ fontSize: 11, color: 'var(--lavender)' }}>
                                    {totalPreds} bet{totalPreds !== 1 ? 's' : ''} · {playerPredSol} SOL
                                  </span>
                                )}
                                {selectedPlayer === p.id && (
                                  <span style={{ fontSize: 13, color: 'var(--lavender)' }}>✓</span>
                                )}
                              </div>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Bet amount presets */}
                    <AnimatePresence>
                      {selectedPlayer && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                        >
                          <p style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bet amount</p>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                            {PREDICTION_PRESETS.map(preset => (
                              <button
                                key={preset}
                                onClick={() => setBetAmount(preset)}
                                style={{
                                  padding: '6px 14px', borderRadius: 'var(--r-pill)',
                                  border: `1px solid ${betAmount === preset ? 'var(--lavender)' : 'var(--border)'}`,
                                  background: betAmount === preset ? 'rgba(180,120,255,0.15)' : 'var(--glass)',
                                  color: betAmount === preset ? 'var(--lavender)' : 'var(--muted)',
                                  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Space Grotesk',
                                }}
                              >
                                {preset} SOL
                              </button>
                            ))}
                          </div>
                          <motion.button
                            className="btn btn-primary"
                            onClick={handlePredict}
                            disabled={placing}
                            whileTap={{ scale: 0.96 }}
                            style={{
                              width: '100%', height: 46, fontSize: 14,
                              background: 'linear-gradient(135deg, rgba(180,120,255,0.3) 0%, rgba(196,255,60,0.2) 100%)',
                              borderColor: 'var(--lavender)',
                            }}
                          >
                            {placing ? 'Placing…' : `Bet ${betAmount} SOL → ${gameState.players.find(p => p.id === selectedPlayer)?.name ?? 'player'}`}
                          </motion.button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Live prediction leaderboard */}
              {predictions.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <p style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Live Predictions</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {predictions.slice(-5).reverse().map(pred => {
                      const predPlayer = gameState.players.find(p => p.id === pred.predicted_winner_wallet);
                      const solAmt = (pred.amount_lamports / LAMPORTS).toFixed(3);
                      return (
                        <div key={pred.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--muted)' }}>
                          <span><span style={{ color: 'var(--text)', fontWeight: 600 }}>{pred.bettor_name}</span> bet on {predPlayer?.name ?? '?'}</span>
                          <span style={{ color: 'var(--lavender)', fontWeight: 600 }}>{solAmt} SOL</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {error && (
        <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 'var(--r-sm)', padding: '12px 14px', color: 'var(--red)', fontSize: 13, width: '100%', marginTop: 12 }}>
          {error}
        </div>
      )}

      {/* CTA */}
      <div style={{ width: '100%', paddingTop: 16 }}>
        {isHost ? (
          <>
            <motion.button
              className="btn btn-primary"
              onClick={async () => { await startGame(); navigate('/game'); }}
              disabled={loading}
              whileTap={{ scale: 0.96 }}
              whileHover={!loading ? { scale: 1.03, boxShadow: '0 0 40px rgba(196,255,60,0.45)' } : {}}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              {loading ? 'Starting…' : 'Start Game →'}
            </motion.button>
            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              Start with any number of players
            </p>
          </>
        ) : (
          <motion.div
            style={{ textAlign: 'center', padding: '18px 0', background: 'var(--glass)', backdropFilter: 'blur(10px)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}
            animate={{ opacity: [1, 0.6, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>⏳ Waiting for host to start…</p>
          </motion.div>
        )}
      </div>
    </div>
  );
};
