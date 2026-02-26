import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, TrendingUp, Coins, RefreshCw } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { useSolPrice, solToUsd } from '../hooks/useSolPrice';

const PREDICTION_PRESETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1];
const LAMPORTS = 1_000_000_000;

export const WaitingRoomPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, startGame, loading, error, predictions, predictionPot, placePrediction, leaveGame, requestLeave, leaveRequests, approveLeave, readyUp, refreshPlayers } = useGame();
  const { publicKey, displayName } = usePrivyWallet();
  const solPrice = useSolPrice();
  const [copied, setCopied] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaveRequests, setLeaveRequests] = useState<string[]>([]);
  const [playerWantsLeave, setPlayerWantsLeave] = useState(false);
  const [readying, setReadying] = useState(false);

  // Prediction state
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [betAmount, setBetAmount]           = useState(0.01);
  const [placing, setPlacing]               = useState(false);
  const [placed, setPlaced]                 = useState(false);
  const [customBet, setCustomBet]           = useState('');

  const myWallet = publicKey?.toBase58() ?? '';
  const isHost   = myWallet === (gameState as any)?.hostWallet;

  const [hostLeft, setHostLeft] = useState(false);

  // If gameState goes null (e.g. leave approved), redirect home
  useEffect(() => {
    if (playerWantsLeave && !gameState) {
      navigate('/', { replace: true });
    }
  }, [gameState, playerWantsLeave, navigate]);

  useEffect(() => {
    if (gameState?.gameStatus === 'playing') navigate('/game');
    if (gameState?.gameStatus === 'cancelled') {
      setHostLeft(true);
      // Auto-redirect after showing message
      const t = setTimeout(() => {
        leaveGame();
        navigate('/', { replace: true });
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [gameState?.gameStatus, navigate, leaveGame]);

  // Auto-refresh players every 5s as fallback for Realtime
  useEffect(() => {
    if (!gameState || gameState.gameStatus !== 'waiting') return;
    const interval = setInterval(() => { refreshPlayers(); }, 5000);
    return () => clearInterval(interval);
  }, [gameState?.gameStatus, refreshPlayers]);

  // Prediction totals per player (must be before any early return — rules of hooks)
  const predTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    predictions.forEach(p => {
      totals[p.predicted_winner_wallet] = (totals[p.predicted_winner_wallet] ?? 0) + p.amount_lamports;
    });
    return totals;
  }, [predictions]);

  // Guard: if gameState was cleared (after leaving), render nothing
  // Must be AFTER all hooks to avoid rules-of-hooks violation
  if (!gameState) return null;

  // Host disconnected overlay
  if (hostLeft) {
    return (
      <div className="page fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔌</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Host Disconnected</h2>
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>The host left the game. Returning to home...</p>
        </div>
      </div>
    );
  }

  const pot = (gameState.players.length * gameState.buyInAmount).toFixed(3);
  const allReady = gameState.players.length >= 2 && gameState.players.every(p => p.isReady);
  const meReady = gameState.players.find(p => p.id === myWallet)?.isReady ?? false;
  const readyCount = gameState.players.filter(p => p.isReady).length;

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

  const handleReadyUp = async () => {
    setReadying(true);
    await readyUp();
    setReadying(false);
  };

  const handleLeave = async () => {
    const meReady = gameState.players.find(p => p.id === myWallet)?.isReady;
    const hasBuyIn = gameState.buyInAmount > 0;

    if (isHost) {
      // Host leaving — handled by leaveGame (cancels game)
      await leaveGame();
      navigate('/', { replace: true });
    } else if (meReady && hasBuyIn) {
      // Readied player with buy-in: request leave (host needs to refund)
      requestLeave();
      setPlayerWantsLeave(true);
    } else {
      // Not readied or free game: leave directly
      await leaveGame();
      navigate('/', { replace: true });
    }
  };

  const handleForceLeave = async () => {
    // Player forces leave without refund
    await leaveGame();
    navigate('/', { replace: true });
  };

  return (
    <div className="page fade-in">
      {/* Leave confirmation modal */}
      <AnimatePresence>
        {showLeaveConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            }}
            onClick={() => setShowLeaveConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 'var(--r)', padding: 24, maxWidth: 340, width: '100%',
                display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center',
              }}
            >
              <p style={{ fontSize: 16, fontWeight: 700 }}>Leave lobby?</p>
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                {gameState.buyInAmount > 0 && meReady
                  ? "You've already paid in. Leaving means you'll lose your buy-in."
                  : "Are you sure you want to leave this game?"}
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setShowLeaveConfirm(false)}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 'var(--r-sm)',
                    background: 'var(--glass)', border: '1px solid var(--border)',
                    color: 'var(--text)', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'Space Grotesk',
                  }}
                >
                  Stay
                </button>
                <button
                  onClick={handleLeave}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 'var(--r-sm)',
                    background: 'rgba(255,60,60,0.15)', border: '1px solid rgba(255,60,60,0.3)',
                    color: '#ff4444', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'Space Grotesk',
                  }}
                >
                  Leave
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Player waiting for refund overlay */}
      {playerWantsLeave && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <motion.div
            initial={{ scale: 0.9 }} animate={{ scale: 1 }}
            style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 'var(--r)', padding: 24, maxWidth: 340, width: '100%',
              textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14,
            }}
          >
            <div style={{ fontSize: 36 }}>🙋</div>
            <p style={{ fontSize: 16, fontWeight: 700 }}>Leave Request Sent</p>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
              The host has been notified. They need to refund your {gameState.buyInAmount} SOL before you can leave.
            </p>
            <p style={{ fontSize: 11, color: 'var(--lavender)' }}>⏳ Waiting for host to approve…</p>
            <button
              onClick={handleForceLeave}
              style={{
                padding: '10px 0', borderRadius: 'var(--r-sm)',
                background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.3)',
                color: '#ff4444', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'Space Grotesk',
              }}
            >
              Leave without refund
            </button>
          </motion.div>
        </motion.div>
      )}

      {/* Host: leave request notifications */}
      {isHost && leaveRequests.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          style={{
            position: 'fixed', top: 70, left: 16, right: 16, zIndex: 90,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          {leaveRequests.map(wallet => {
            const player = gameState.players.find(p => p.id === wallet);
            return (
              <motion.div
                key={wallet}
                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                style={{
                  background: 'var(--card)', border: '1px solid rgba(255,180,60,0.4)',
                  borderRadius: 'var(--r-sm)', padding: '12px 16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                }}
              >
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                    🙋 {player?.name ?? wallet.slice(0, 8)} wants to leave
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Refund {gameState.buyInAmount} SOL to let them go
                  </p>
                </div>
                <button
                  onClick={() => approveLeave(wallet)}
                  style={{
                    padding: '8px 14px', borderRadius: 'var(--r-pill)',
                    background: 'rgba(196,255,60,0.15)', border: '1px solid var(--lime-border)',
                    color: 'var(--lime)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'Space Grotesk', whiteSpace: 'nowrap',
                  }}
                >
                  Refund & Remove
                </button>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Top row */}
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, marginBottom: 20 }}>
        <span className="chip chip-lime blink" style={{ fontSize: 11 }}>● Waiting</span>
        <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
          {readyCount}/{gameState.players.length} ready
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
          <div className="section-header" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p className="label-cipher">Players</p>
            <button
              onClick={refreshPlayers}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'Space Grotesk' }}
            >
              <RefreshCw size={12} /> Refresh
            </button>
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
                    {p.id === myWallet && <span className="chip chip-white" style={{ padding: '2px 8px', fontSize: 10 }}>You</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {hasPreds && (
                      <span style={{ fontSize: 11, color: 'var(--lavender)', fontWeight: 600 }}>
                        🎯 {playerPredSol} SOL
                      </span>
                    )}
                    {p.isReady ? (
                      <span className="chip chip-lime" style={{ padding: '2px 8px', fontSize: 10 }}>Ready ✓</span>
                    ) : (
                      <span className="chip chip-muted" style={{ padding: '2px 8px', fontSize: 10 }}>Not ready</span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* ── Prediction Market (host sees read-only, players can bet) ── */}
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
                <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--muted)', background: 'var(--glass)', border: '1px solid var(--border)', borderRadius: 'var(--r-pill)', padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Optional</span>
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
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                  Who's gonna win? 🎯
                </p>
                <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                  {isHost
                    ? 'See what players are betting on. You can\'t bet as the host.'
                    : 'Bet on who tells the most truth. Correct predictors split the prediction pot.'
                  }
                  {myBet && (
                    <span style={{ color: 'var(--lime)', fontWeight: 600 }}>
                      {' '}You bet {(myBet.amount_lamports / LAMPORTS).toFixed(3)} SOL on {
                        gameState.players.find(p => p.id === myBet.predicted_winner_wallet)?.name ?? 'someone'
                      }.
                    </span>
                  )}
                </p>
              </div>

              {/* Host: read-only Polymarket-style view */}
              {isHost ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {gameState.players.map(p => {
                    const total = (predTotals[p.id] ?? 0) / LAMPORTS;
                    const totalAll = predictionPot / LAMPORTS;
                    const pct = totalAll > 0 ? Math.round((total / totalAll) * 100) : 0;
                    const numBets = predictions.filter(pr => pr.predicted_winner_wallet === p.id).length;
                    return (
                      <div
                        key={p.id}
                        style={{
                          padding: '10px 14px', borderRadius: 'var(--r-sm)',
                          background: 'var(--glass)', border: '1px solid var(--border)',
                          position: 'relative', overflow: 'hidden',
                        }}
                      >
                        {/* Progress bar background */}
                        <div style={{
                          position: 'absolute', left: 0, top: 0, bottom: 0,
                          width: `${pct}%`,
                          background: 'rgba(180,120,255,0.1)',
                          transition: 'width 0.3s',
                        }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                            {numBets > 0 && (
                              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                                {numBets} bet{numBets !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--lavender)' }}>
                              {pct}%
                            </span>
                            {total > 0 && (
                              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                                {total.toFixed(3)} SOL
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Players: can place bets */
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
                            {/* Horizontal scrolling presets */}
                            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 8, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
                              {PREDICTION_PRESETS.map(preset => {
                                const usd = solToUsd(preset, solPrice);
                                return (
                                  <button
                                    key={preset}
                                    onClick={() => { setBetAmount(preset); setCustomBet(''); }}
                                    style={{
                                      padding: '8px 16px', borderRadius: 'var(--r-pill)',
                                      border: `1px solid ${betAmount === preset && !customBet ? 'var(--lavender)' : 'var(--border)'}`,
                                      background: betAmount === preset && !customBet ? 'rgba(180,120,255,0.15)' : 'var(--glass)',
                                      color: betAmount === preset && !customBet ? 'var(--lavender)' : 'var(--muted)',
                                      fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Space Grotesk',
                                      whiteSpace: 'nowrap', flexShrink: 0,
                                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                                    }}
                                  >
                                    <span>{preset} SOL</span>
                                    {usd && <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.7 }}>{usd}</span>}
                                  </button>
                                );
                              })}
                            </div>
                            {/* Custom bet input */}
                            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                              <input
                                type="number"
                                step="0.01"
                                min="0.001"
                                placeholder="Custom amount"
                                value={customBet}
                                onChange={(e) => {
                                  setCustomBet(e.target.value);
                                  const val = parseFloat(e.target.value);
                                  if (val > 0) setBetAmount(val);
                                }}
                                style={{
                                  flex: 1, padding: '10px 14px', borderRadius: 'var(--r-sm)',
                                  border: `1px solid ${customBet ? 'var(--lavender)' : 'var(--border)'}`,
                                  background: 'var(--glass)', color: 'var(--text)',
                                  fontSize: 14, fontFamily: 'Space Grotesk', outline: 'none',
                                }}
                              />
                              <span style={{ display: 'flex', alignItems: 'center', fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>SOL</span>
                            </div>
                            {/* Bet button — high contrast */}
                            <motion.button
                              onClick={handlePredict}
                              disabled={placing || betAmount <= 0}
                              whileTap={{ scale: 0.96 }}
                              style={{
                                width: '100%', height: 50, fontSize: 15, fontWeight: 700,
                                borderRadius: 'var(--r-sm)', cursor: 'pointer',
                                background: 'linear-gradient(135deg, #b478ff 0%, #C4FF3C 100%)',
                                color: '#000', border: 'none',
                                fontFamily: 'Space Grotesk',
                                opacity: placing || betAmount <= 0 ? 0.5 : 1,
                              }}
                            >
                              {placing ? 'Placing…' : `🎯 Bet ${betAmount} SOL → ${gameState.players.find(p => p.id === selectedPlayer)?.name ?? 'player'}`}
                            </motion.button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}

              {/* Live prediction feed */}
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
              disabled={loading || !allReady}
              whileTap={{ scale: 0.96 }}
              whileHover={!loading && allReady ? { scale: 1.03, boxShadow: '0 0 40px rgba(196,255,60,0.45)' } : {}}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              {loading ? 'Starting…' : !allReady
                ? `Waiting for ready (${readyCount}/${gameState.players.length})`
                : 'Start Game →'}
            </motion.button>
            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              {gameState.players.length < 2
                ? 'Need at least 2 players to start'
                : allReady
                  ? `All ${gameState.players.length} players ready!`
                  : `${readyCount} of ${gameState.players.length} players ready`}
            </p>
          </>
        ) : !meReady ? (
          <motion.button
            className="btn btn-primary"
            onClick={handleReadyUp}
            disabled={readying}
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.03, boxShadow: '0 0 40px rgba(196,255,60,0.45)' }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            {readying
              ? gameState.buyInAmount > 0 ? 'Paying & readying…' : 'Readying up…'
              : gameState.buyInAmount > 0
                ? `Ready Up & Pay ${gameState.buyInAmount} SOL`
                : 'Ready Up ✓'}
          </motion.button>
        ) : (
          <motion.div
            style={{ textAlign: 'center', padding: '18px 0', background: 'var(--glass)', backdropFilter: 'blur(10px)', borderRadius: 'var(--r)', border: '1px solid var(--lime-border)' }}
            animate={{ opacity: [1, 0.7, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <p style={{ color: 'var(--lime)', fontSize: 14, fontWeight: 600 }}>✓ Ready — waiting for host to start…</p>
          </motion.div>
        )}

        {/* Leave lobby */}
        <button
          onClick={() => setShowLeaveConfirm(true)}
          style={{
            marginTop: 12, background: 'none', border: '1px solid var(--border)',
            borderRadius: 'var(--r-pill)', padding: '10px 20px', cursor: 'pointer',
            color: 'var(--muted)', fontSize: 13, fontWeight: 600,
            fontFamily: 'Space Grotesk', width: '100%',
          }}
        >
          Leave Lobby
        </button>
      </div>
    </div>
  );
};
