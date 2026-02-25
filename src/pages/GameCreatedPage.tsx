import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Copy, Check } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';

export const GameCreatedPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, startGame, loading, predictions, predictionPot, placePrediction } = useGame();
  const { publicKey, displayName } = usePrivyWallet();
  const [copied, setCopied] = useState(false);
  const [selectedPlayer, setSelected] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState(0.01);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState(false);
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
      {/* Top row: status + player count */}
      <div style={{ width: '100%', paddingTop: 48, marginBottom: 12 }}>
        <span className="chip chip-lime blink" style={{ fontSize: 11 }}>● Lobby</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', flex: 1 }}>

        {/* Room code hero */}
        <motion.div
          style={{
            textAlign: 'center', padding: '32px 16px',
            background: 'var(--glass)', border: '1px solid var(--border)',
            borderRadius: 'var(--r)', position: 'relative', overflow: 'hidden',
          }}
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 24 }}
        >
          <p className="label-cipher" style={{ marginBottom: 12 }}>Share this code</p>
          <div className="code" style={{ fontSize: 'clamp(44px, 12vw, 58px)' }}>{gameState.roomCode}</div>
          <button
            onClick={copy}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              marginTop: 14, background: 'var(--card-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-pill)', padding: '8px 18px', cursor: 'pointer',
              color: copied ? 'var(--lime)' : 'var(--muted)', fontSize: 13, fontWeight: 600,
              fontFamily: 'Space Grotesk', transition: 'color 0.2s',
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied!' : 'Copy code'}
          </button>
        </motion.div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            { label: 'Buy-In', value: `${gameState.buyInAmount}`, unit: 'SOL' },
            { label: 'Players', value: `${gameState.players.length}` },
            { label: 'Pot', value: pot, unit: 'SOL' },
          ].map(s => (
            <div key={s.label} style={{
              textAlign: 'center', padding: '12px 8px',
              background: 'var(--glass)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
            }}>
              <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>{s.label}</p>
              <p style={{ fontWeight: 800, fontSize: 18, color: 'var(--lime)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                {s.value}
                {s.unit && <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500, marginLeft: 2 }}>{s.unit}</span>}
              </p>
            </div>
          ))}
        </div>

        {/* Player list */}
        <div>
          <p className="label-cipher" style={{ marginBottom: 10 }}>Players</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {gameState.players.map((p, i) => (
              <motion.div
                key={p.id}
                className={`player-row ${p.id === publicKey?.toBase58() ? 'me' : ''}`}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: 'spring', stiffness: 340, damping: 28, delay: i * 0.06 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 7, background: 'var(--card-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--muted)', flexShrink: 0 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name || `Player ${i + 1}`}</span>
                  {p.isHost && <span className="chip chip-muted" style={{ padding: '2px 7px', fontSize: 9 }}>Host</span>}
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--lime)' }}>
                  {gameState.buyInAmount} SOL
                </span>
              </motion.div>
            ))}
            <p style={{ textAlign: 'center', padding: '8px 0', color: 'var(--muted)', fontSize: 12 }}>
              Waiting for more players…
            </p>
          </div>
        </div>

        {/* Prediction Market */}
        {gameState.players.length >= 2 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <p className="label-cipher">🎯 Predictions</p>
              {predictionPot > 0 && <span style={{ fontSize: 11, color: 'var(--lavender)', fontWeight: 700 }}>{predPotSol} SOL</span>}
            </div>
            <div style={{ background: 'var(--glass)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {placed ? (
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <p style={{ color: 'var(--lime)', fontWeight: 700, fontSize: 13 }}>✅ Prediction locked!</p>
                  <button onClick={() => setPlaced(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 11, cursor: 'pointer', marginTop: 4, fontFamily: 'Space Grotesk' }}>Place another</button>
                </div>
              ) : (
                <>
                  <p style={{ fontSize: 12, color: 'var(--muted)' }}>Bet on who wins 👀</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {gameState.players.map(p => (
                      <button key={p.id} onClick={() => setSelected(p.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 'var(--r-sm)', border: `1px solid ${selectedPlayer === p.id ? 'var(--lavender)' : 'var(--border)'}`, background: selectedPlayer === p.id ? 'rgba(180,120,255,0.1)' : 'var(--glass)', cursor: 'pointer', fontFamily: 'Space Grotesk' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{p.name || 'Player'}{p.isHost ? ' 👑' : ''}</span>
                        {(predTotals[p.id] ?? 0) > 0 && <span style={{ fontSize: 10, color: 'var(--lavender)' }}>{((predTotals[p.id]) / LAMPORTS).toFixed(3)} SOL</span>}
                      </button>
                    ))}
                  </div>
                  {selectedPlayer && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      {[0.01, 0.05, 0.1, 0.25].map(amt => (
                        <button key={amt} onClick={() => setBetAmount(amt)} style={{ padding: '4px 10px', borderRadius: 'var(--r-pill)', border: `1px solid ${betAmount === amt ? 'var(--lavender)' : 'var(--border)'}`, background: betAmount === amt ? 'rgba(180,120,255,0.15)' : 'var(--glass)', color: betAmount === amt ? 'var(--lavender)' : 'var(--muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Space Grotesk' }}>{amt}</button>
                      ))}
                      <button onClick={handlePredict} disabled={placing} style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 'var(--r-pill)', background: 'rgba(180,120,255,0.2)', border: '1px solid var(--lavender)', color: 'var(--lavender)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Space Grotesk' }}>
                        {placing ? '…' : `Bet ${betAmount}`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* CTA */}
      <div style={{ width: '100%', paddingTop: 16, paddingBottom: 8 }}>
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
        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
          Start with any number of players
        </p>
      </div>
    </div>
  );
};
