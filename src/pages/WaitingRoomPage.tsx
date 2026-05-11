import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { useSolPrice, solToUsd } from '../hooks/useSolPrice';
import { Blobs, BackButton, Avatar, SolMark, Ticker, WalletChip, UsdTag } from '../components';

/* ─── helpers ─────────────────────────────────────────── */
const LAMPORTS = 1_000_000_000;

const AVATAR_EMOJIS = ['🐺', '🦊', '🐸', '🦄', '🐙', '🦅', '🐋', '🦁', '🐻', '🐲'];
const AVATAR_COLORS = [
  'rgba(196,255,60,0.25)',
  'rgba(255,59,139,0.25)',
  'rgba(77,168,255,0.25)',
  'rgba(169,104,255,0.25)',
  'rgba(255,138,42,0.25)',
  'rgba(91,229,132,0.25)',
  'rgba(255,92,92,0.25)',
  'rgba(196,255,60,0.25)',
  'rgba(255,59,139,0.25)',
  'rgba(77,168,255,0.25)',
];

function playerAvatar(index: number) {
  return {
    emoji: AVATAR_EMOJIS[index % AVATAR_EMOJIS.length],
    color: AVATAR_COLORS[index % AVATAR_COLORS.length],
  };
}

/* ─── component ───────────────────────────────────────── */

export const WaitingRoomPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    gameState, startGame, loading, error,
    predictions, predictionPot, placePrediction,
    leaveGame, requestLeave, leaveRequests, approveLeave,
    readyUp, refreshPlayers,
  } = useGame();
  const { publicKey, displayName } = usePrivyWallet();
  const solPrice = useSolPrice();

  const [copied, setCopied] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [playerWantsLeave, setPlayerWantsLeave] = useState(false);
  const [deniedLeaves, setDeniedLeaves] = useState<string[]>([]);
  const [refunding, setRefunding] = useState<string | null>(null);
  const [hostLeaving, setHostLeaving] = useState(false);
  const [readying, setReadying] = useState(false);
  const [readyError, setReadyError] = useState<string | null>(null);
  const [hostLeft, setHostLeft] = useState(false);

  const myWallet = publicKey?.toBase58() ?? '';
  const isHost = myWallet === (gameState as any)?.hostWallet;

  // Re-broadcast leave request every 10s
  useEffect(() => {
    if (!playerWantsLeave) return;
    const interval = setInterval(() => { requestLeave(); }, 10000);
    return () => clearInterval(interval);
  }, [playerWantsLeave, requestLeave]);

  // If gameState goes null (leave approved), redirect home
  useEffect(() => {
    if (playerWantsLeave && !gameState) {
      navigate('/', { replace: true });
    }
  }, [gameState, playerWantsLeave, navigate]);

  useEffect(() => {
    if (gameState?.gameStatus === 'playing') navigate('/game');
    if (gameState?.gameStatus === 'cancelled') {
      setHostLeft(true);
      const t = setTimeout(() => {
        leaveGame();
        navigate('/', { replace: true });
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [gameState?.gameStatus, navigate, leaveGame]);

  // Auto-refresh players every 5s
  useEffect(() => {
    if (!gameState || gameState.gameStatus !== 'waiting') return;
    const interval = setInterval(() => { refreshPlayers(); }, 5000);
    return () => clearInterval(interval);
  }, [gameState?.gameStatus, refreshPlayers]);

  // Must be before early returns (rules of hooks)
  const predTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    predictions.forEach(p => {
      totals[p.predicted_winner_wallet] = (totals[p.predicted_winner_wallet] ?? 0) + p.amount_lamports;
    });
    return totals;
  }, [predictions]);

  if (!gameState) return null;

  // Host disconnected overlay
  if (hostLeft) {
    return (
      <div className="page page--game fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#x1f50c;</div>
          <h2 className="display" style={{ fontSize: 22, marginBottom: 8 }}>host disconnected</h2>
          <p style={{ fontSize: 14, color: 'var(--ink-faint)' }}>returning to home...</p>
        </div>
      </div>
    );
  }

  const pot = (gameState.players.length * gameState.buyInAmount).toFixed(3);
  const potNum = gameState.players.length * gameState.buyInAmount;
  const allReady = gameState.players.length >= 2 && gameState.players.every(p => p.isReady);
  const meReady = gameState.players.find(p => p.id === myWallet)?.isReady ?? false;
  const readyCount = gameState.players.filter(p => p.isReady).length;
  const notReadyCount = gameState.players.length - readyCount;

  const copy = () => {
    navigator.clipboard.writeText(gameState.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReadyUp = async () => {
    setReadying(true);
    setReadyError(null);
    try {
      await readyUp();
    } catch (err: any) {
      setReadyError(err?.message || 'transaction failed — tap to retry');
    } finally {
      setReadying(false);
    }
  };

  const handleLeave = async () => {
    const meReadyNow = gameState.players.find(p => p.id === myWallet)?.isReady;
    const hasBuyIn = gameState.buyInAmount > 0;
    if (isHost) {
      await leaveGame();
      navigate('/', { replace: true });
    } else if (meReadyNow && hasBuyIn) {
      requestLeave();
      setPlayerWantsLeave(true);
    } else {
      await leaveGame();
      navigate('/', { replace: true });
    }
  };

  const handleForceLeave = async () => {
    await leaveGame();
    navigate('/', { replace: true });
  };

  // Format room code as "XXX XXX"
  const rawCode = gameState.roomCode.replace(/[^0-9]/g, '');
  const formattedCode = rawCode.length === 6
    ? `${rawCode.slice(0, 3)} ${rawCode.slice(3)}`
    : gameState.roomCode;

  return (
    <div style={{ width: '100%', minHeight: '100dvh', position: 'relative' }}>
      <Blobs palette="lobby" />

    <div className="page page--game fade-in scroll-no-bar" style={{ position: 'relative', zIndex: 1, overflowY: 'auto' }}>

      {/* ─── leave confirmation modal ─── */}
      <AnimatePresence>
        {showLeaveConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            onClick={() => setShowLeaveConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="glass glass-strong"
              style={{ padding: 24, maxWidth: 340, width: '100%', borderRadius: 24, display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center' }}
            >
              <p style={{ fontSize: 16, fontWeight: 700 }}>leave lobby?</p>
              {(() => {
                const readiedCount = isHost ? gameState.players.filter(p => p.isReady && p.id !== (gameState as any).hostWallet).length : 0;
                const refundTotal = readiedCount * gameState.buyInAmount;
                return (
                  <p style={{ fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.5 }}>
                    {isHost && readiedCount > 0 && gameState.buyInAmount > 0
                      ? `${readiedCount} player${readiedCount !== 1 ? 's have' : ' has'} paid in. you'll refund ${refundTotal.toFixed(3)} sol before the game closes.`
                      : isHost ? "this will end the game for everyone."
                      : gameState.buyInAmount > 0 && meReady ? "you've already paid in. leaving means you'll lose your buy-in."
                      : "are you sure you want to leave this game?"}
                  </p>
                );
              })()}
              {hostLeaving && (
                <p className="mono" style={{ fontSize: 12, color: 'var(--acid)' }}>refunding players...</p>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-ghost" disabled={hostLeaving} onClick={() => setShowLeaveConfirm(false)}
                  style={{ flex: 1, padding: '12px 0', fontSize: 13, opacity: hostLeaving ? 0.5 : 1 }}>
                  stay
                </button>
                <button
                  className="btn"
                  disabled={hostLeaving}
                  onClick={async () => { if (isHost) setHostLeaving(true); await handleLeave(); setHostLeaving(false); }}
                  style={{ flex: 1, padding: '12px 0', borderRadius: 100, background: 'rgba(255,60,60,0.15)', border: '1px solid rgba(255,60,60,0.3)', color: '#ff4444', fontSize: 13, fontWeight: 700, opacity: hostLeaving ? 0.5 : 1 }}>
                  leave
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── player waiting for refund overlay ─── */}
      {playerWantsLeave && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}
            className="glass glass-strong"
            style={{ padding: 24, maxWidth: 340, width: '100%', borderRadius: 24, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 16, fontWeight: 700 }}>leave request sent</p>
            <p style={{ fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.5 }}>
              the host has been notified. they need to refund your {gameState.buyInAmount} sol before you can leave.
            </p>
            <p className="mono" style={{ fontSize: 11, color: 'var(--acid)' }}>waiting for host to approve...</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setPlayerWantsLeave(false)}
                style={{ flex: 1, padding: '10px 0', fontSize: 12 }}>
                cancel
              </button>
              <button className="btn" onClick={handleForceLeave}
                style={{ flex: 1, padding: '10px 0', borderRadius: 100, background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.3)', color: '#ff4444', fontSize: 12, fontWeight: 700 }}>
                leave without refund
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* ─── host: leave request modal ─── */}
      {isHost && leaveRequests.filter(w => !deniedLeaves.includes(w)).length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}
            className="glass glass-strong"
            style={{ padding: 24, maxWidth: 360, width: '100%', borderRadius: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {leaveRequests.filter(w => !deniedLeaves.includes(w)).map(wallet => {
              const player = gameState.players.find(p => p.id === wallet);
              return (
                <div key={wallet} style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
                    {player?.name ?? wallet.slice(0, 8)} wants to leave
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.5 }}>
                    refund their {gameState.buyInAmount} sol buy-in to remove them.
                  </p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-ghost" onClick={() => setDeniedLeaves(prev => [...prev, wallet])}
                      style={{ flex: 1, padding: '12px 0', fontSize: 13 }}>
                      deny
                    </button>
                    <button className="btn btn-degen" disabled={refunding === wallet}
                      onClick={async () => { setRefunding(wallet); await approveLeave(wallet); setRefunding(null); }}
                      style={{ flex: 1, padding: '12px 0', fontSize: 13, opacity: refunding === wallet ? 0.5 : 1 }}>
                      {refunding === wallet ? 'refunding...' : 'refund & remove'}
                    </button>
                  </div>
                </div>
              );
            })}
          </motion.div>
        </motion.div>
      )}

      {/* ─── header ─── */}
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, marginBottom: 20 }}>
        <BackButton onClick={() => setShowLeaveConfirm(true)} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="chip chip-acid" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--acid)', display: 'inline-block' }} />
            {readyCount} ready
          </span>
          <WalletChip />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', flex: 1 }}>

        {/* ─── room code hero ─── */}
        <motion.div
          className="glass glass-strong"
          style={{ width: '100%', padding: '30px 24px', borderRadius: 30, textAlign: 'center', cursor: 'pointer' }}
          onClick={copy}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 26 }}
          whileTap={{ scale: 0.98 }}
        >
          <p className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 12 }}>
            tap to copy
          </p>
          <div className="display" style={{ fontSize: 'clamp(48px, 14vw, 76px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, color: 'var(--ink)', marginBottom: 8 }}>
            {formattedCode}
          </div>
          <p className="mono" style={{ fontSize: 12, fontWeight: 600, color: copied ? 'var(--acid)' : 'var(--ink-faint)', transition: 'color 0.3s' }}>
            {copied ? '✓ copied' : 'tap to copy code'}
          </p>
        </motion.div>

        {/* ─── pot tracker ─── */}
        <div className="glass-flat" style={{ marginTop: 12, padding: '14px 18px', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>pot</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <SolMark size={16} tone="ink" />
              <span className="money" style={{ fontSize: 24, color: 'var(--acid)' }}>
                <Ticker value={potNum} decimals={3} />
              </span>
            </div>
            <UsdTag amount={potNum} token="sol" className="mono" />
          </div>
          <div style={{ textAlign: 'right' }}>
            <p className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>buy-in</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
              <SolMark size={14} tone="ink" />
              <span className="money" style={{ fontSize: 24, color: 'var(--ink)' }}>{gameState.buyInAmount}</span>
            </div>
          </div>
        </div>

        {/* ─── player list (squad) ─── */}
        <div>
          <p className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 }}>
            squad
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {gameState.players.map((p, i) => {
              const av = playerAvatar(i);
              const isMe = p.id === myWallet;
              return (
                <motion.div
                  key={p.id}
                  className="glass-flat"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 16 }}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: 'spring', stiffness: 340, damping: 28, delay: i * 0.06 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar emoji={av.emoji} color={av.color} size={32} />
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{p.name || `player ${i + 1}`}</span>
                    {isMe && <span className="chip chip-pink" style={{ padding: '2px 8px', fontSize: 9 }}>you</span>}
                  </div>
                  <div>
                    {p.isReady ? (
                      <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: 'var(--acid)', letterSpacing: '0.06em' }}>● READY</span>
                    ) : (
                      <span className="mono" style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-faint)', letterSpacing: '0.06em' }}>○ WAIT</span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* error */}
      {error && (
        <div style={{ width: '100%', marginTop: 12, background: 'rgba(255,92,92,0.08)', border: '1px solid rgba(255,92,92,0.25)', borderRadius: 16, padding: '12px 14px', color: 'var(--coral)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ─── CTA ─── */}
      <div style={{ width: '100%', paddingTop: 16, paddingBottom: 8 }}>
        {isHost ? (
          <>
            <motion.button
              className="btn btn-degen"
              onClick={async () => { await startGame(); navigate('/game'); }}
              disabled={loading || !allReady}
              whileTap={!loading && allReady ? { scale: 0.96 } : {}}
              style={{ opacity: loading || !allReady ? 0.4 : 1, textTransform: 'lowercase' }}
            >
              {loading
                ? 'starting...'
                : allReady
                  ? 'send it 🚀'
                  : `waiting on ${notReadyCount}...`}
            </motion.button>
          </>
        ) : !meReady ? (
          <>
            <motion.button
              className="btn btn-degen"
              onClick={handleReadyUp}
              disabled={readying}
              whileTap={{ scale: 0.96 }}
              style={{ textTransform: 'lowercase' }}
            >
              {readying
                ? gameState.buyInAmount > 0 ? 'paying & readying...' : 'readying up...'
                : readyError
                  ? 'retry'
                  : gameState.buyInAmount > 0
                    ? `ready up & pay ${gameState.buyInAmount} sol`
                    : 'ready up ✓'}
            </motion.button>
            {readyError && (
              <p style={{ color: 'var(--coral)', fontSize: 13, textAlign: 'center', marginTop: 8 }}>
                {readyError}
              </p>
            )}
          </>
        ) : (
          <motion.div
            className="glass-flat"
            style={{ textAlign: 'center', padding: '18px 0', borderRadius: 100, border: '1px solid rgba(196,255,60,0.25)' }}
            animate={{ opacity: [1, 0.7, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <p className="mono" style={{ color: 'var(--acid)', fontSize: 13, fontWeight: 600 }}>✓ ready — waiting for host...</p>
          </motion.div>
        )}

        {/* leave lobby */}
        <button
          className="btn btn-ghost"
          onClick={() => setShowLeaveConfirm(true)}
          style={{ marginTop: 10, padding: '14px 0', fontSize: 14, textTransform: 'lowercase' }}
        >
          leave lobby
        </button>
      </div>
    </div>
    </div>
  );
};
