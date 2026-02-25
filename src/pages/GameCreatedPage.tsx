import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Copy, Check } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';

export const GameCreatedPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, startGame, loading, predictions, predictionPot, placePrediction } = useGame();
  const { publicKey } = usePrivyWallet();
  const [copied, setCopied]         = useState(false);
  const [selectedPlayer, setSelected] = useState<string | null>(null);
  const [betAmount, setBetAmount]     = useState(0.01);
  const [placing, setPlacing]         = useState(false);
  const [placed, setPlaced]           = useState(false);
  const { displayName } = usePrivyWallet();
  const LAMPORTS = 1_000_000_000;
  const predTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    predictions.forEach(p => { totals[p.predicted_winner_wallet] = (totals[p.predicted_winner_wallet] ?? 0) + p.amount_lamports; });
    return totals;
  }, [predictions]);
  const predPotSol = (predictionPot / LAMPORTS).toFixed(3);
  const handlePredict = async () => {
    if (!selectedPlayer || placing) return;
    setPlacing(true);
    const ok = await placePrediction(selectedPlayer, betAmount, displayName);
    setPlacing(false);
    if (ok) { setPlaced(true); setSelected(null); }
  };

  // Auto-navigate when game starts (real-time update)
  useEffect(() => {
    if (gameState?.gameStatus === 'playing') navigate('/game');
  }, [gameState?.gameStatus, navigate]);

  if (!gameState) { navigate('/'); return null; }

  const copy = () => {
    navigator.clipboard.writeText(gameState.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const pot = (gameState.players.length * gameState.buyInAmount).toFixed(2);

  return (
    <div className="page fade-in">
      {/* Spacer for wallet pill row */}
      <div style={{ width: '100%', minHeight: 38, marginBottom: 28 }} />

      <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="chip chip-lime blink">● Lobby</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {gameState.players.length} joined
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', flex: 1 }}>

        {/* Room code — the most important element */}
        <motion.div
          className="card-pixel corner-accent"
          style={{ textAlign: 'center', padding: '28px 20px' }}
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 24 }}
        >
          <p className="label-cipher" style={{ marginBottom: 14 }}>Share this code</p>
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
        </motion.div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            { label: 'Buy-In', value: `${gameState.buyInAmount}`, unit: 'SOL' },
            { label: 'Players', value: `${gameState.players.length}` },
            { label: 'Pot',    value: pot, unit: 'SOL' },
          ].map(s => (
            <div key={s.label} className="card" style={{ textAlign: 'center', padding: '14px 10px' }}>
              <p className="label-sm" style={{ marginBottom: 6 }}>{s.label}</p>
              <p style={{ fontWeight: 800, fontSize: 20, color: 'var(--lime)', letterSpacing: '-0.03em' }}>
                {s.value}
                {s.unit && <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500, marginLeft: 2 }}>{s.unit}</span>}
              </p>
            </div>
          ))}
        </div>

        {/* Player list */}
        <div>
          <p className="label" style={{ marginBottom: 10 }}>In the lobby</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {gameState.players.map((p, i) => (
              <motion.div
                key={p.id}
                className={`player-row ${p.id === publicKey?.toBase58() ? 'me' : ''}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: 'spring', stiffness: 340, damping: 28, delay: i * 0.07 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--card-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name || `Player ${i + 1}`}</span>
                  {p.isHost && <span className="chip chip-muted" style={{ padding: '2px 8px', fontSize: 10 }}>Host</span>}
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--lime)' }}>
                  {gameState.buyInAmount} SOL
                </span>
              </motion.div>
            ))}

            {/* Waiting indicator */}
            <div style={{ textAlign: 'center', padding: '10px 0', color: 'var(--muted)', fontSize: 13 }}>
              Waiting for more players…
            </div>
          </div>
        </div>
      </div>

      {/* Prediction Market */}
      {gameState.players.length >= 2 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p className="label-cipher">🎯 Prediction Market</p>
            {predictionPot > 0 && <span style={{ fontSize: 12, color: 'var(--lavender)', fontWeight: 700 }}>{predPotSol} SOL pot</span>}
          </div>
          <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {placed ? (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <p style={{ color: 'var(--lime)', fontWeight: 700 }}>✅ Prediction locked!</p>
                <button onClick={() => setPlaced(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', marginTop: 6, fontFamily: 'Space Grotesk' }}>Place another</button>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>Bet on who you think wins. Even you can bet on yourself 👀</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {gameState.players.map(p => (
                    <button key={p.id} onClick={() => setSelected(p.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 13px', borderRadius: 'var(--r-sm)', border: `1px solid ${selectedPlayer === p.id ? 'var(--lavender)' : 'var(--border)'}`, background: selectedPlayer === p.id ? 'rgba(180,120,255,0.1)' : 'var(--glass)', cursor: 'pointer', fontFamily: 'Space Grotesk' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.name || 'Player'}{p.isHost ? ' 👑' : ''}</span>
                      {(predTotals[p.id] ?? 0) > 0 && <span style={{ fontSize: 11, color: 'var(--lavender)' }}>{((predTotals[p.id]) / LAMPORTS).toFixed(3)} SOL bet</span>}
                    </button>
                  ))}
                </div>
                {selectedPlayer && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {[0.01, 0.05, 0.1, 0.25].map(amt => (
                      <button key={amt} onClick={() => setBetAmount(amt)} style={{ padding: '5px 12px', borderRadius: 'var(--r-pill)', border: `1px solid ${betAmount === amt ? 'var(--lavender)' : 'var(--border)'}`, background: betAmount === amt ? 'rgba(180,120,255,0.15)' : 'var(--glass)', color: betAmount === amt ? 'var(--lavender)' : 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Space Grotesk' }}>{amt} SOL</button>
                    ))}
                    <button onClick={handlePredict} disabled={placing} style={{ marginLeft: 'auto', padding: '7px 16px', borderRadius: 'var(--r-pill)', background: 'rgba(180,120,255,0.2)', border: '1px solid var(--lavender)', color: 'var(--lavender)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Space Grotesk' }}>
                      {placing ? 'Placing…' : `Bet ${betAmount} SOL`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      )}

      {/* CTA */}
      <div style={{ width: '100%', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <motion.button
          className="btn btn-primary"
          onClick={async () => { await startGame(); navigate('/game'); }}
          disabled={loading}
          whileTap={{ scale: 0.96 }}
          whileHover={{ scale: 1.03, boxShadow: '0 0 40px rgba(196,255,60,0.45)' }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        >
          {loading ? 'Starting…' : 'Start Game →'}
        </motion.button>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
          Start with any number of players
        </p>
      </div>
    </div>
  );
};
