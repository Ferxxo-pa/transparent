import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Copy, Check, Link } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { Blobs, BackButton } from '../components';

export const GameCreatedPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, startGame, loading, predictions, predictionPot, placePrediction } = useGame();
  const { publicKey, displayName } = usePrivyWallet();
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
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

  if (!gameState) return null;

  const copy = () => {
    navigator.clipboard.writeText(gameState.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyLink = () => {
    const link = `${window.location.origin}/join/${gameState.roomCode}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <>
      <Blobs palette="lobby" />

      <div className="page page--game fade-in" style={{ position: 'relative', zIndex: 1 }}>
        {/* ── header ── */}
        <div className="navbar" style={{ marginBottom: 16 }}>
          <BackButton onClick={() => navigate('/')} />
          <span className="chip chip-acid">room created</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', flex: 1 }}>

          {/* ── room code hero ── */}
          <motion.div
            className="glass glass-strong"
            style={{ textAlign: 'center', padding: '32px 16px', borderRadius: 32 }}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
          >
            <p className="mono" style={{ fontSize: 11, letterSpacing: '0.18em', color: 'var(--ink-faint)', textTransform: 'uppercase', marginBottom: 12 }}>
              share this code
            </p>
            <div className="code" style={{ fontSize: 'clamp(44px, 12vw, 58px)' }}>{gameState.roomCode}</div>
            <p className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 8, letterSpacing: '0.06em' }}>
              tap to copy
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={copy}
                className="glass-flat"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 18px', cursor: 'pointer', borderRadius: 100,
                  color: copied ? 'var(--acid)' : 'var(--ink-faint)', fontSize: 13, fontWeight: 600,
                  fontFamily: 'inherit', transition: 'color 0.2s',
                }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'copied!' : 'copy code'}
              </button>
              <button
                onClick={copyLink}
                className="glass-flat"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 18px', cursor: 'pointer', borderRadius: 100,
                  color: copiedLink ? 'var(--acid)' : 'var(--ink-faint)', fontSize: 13, fontWeight: 600,
                  fontFamily: 'inherit', transition: 'color 0.2s',
                }}
              >
                {copiedLink ? <Check size={13} /> : <Link size={13} />}
                {copiedLink ? 'link copied!' : 'share link'}
              </button>
            </div>
          </motion.div>

          {/* ── stats row ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { label: 'buy-in', value: `${gameState.buyInAmount}`, unit: 'sol' },
              { label: 'players', value: `${gameState.players.length}` },
              { label: 'pot', value: (gameState.players.length * gameState.buyInAmount).toFixed(2), unit: 'sol' },
            ].map(s => (
              <div key={s.label} className="glass-flat" style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 16 }}>
                <p className="mono" style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4 }}>{s.label}</p>
                <p className="money" style={{ fontSize: 18, color: 'var(--acid)', lineHeight: 1 }}>
                  {s.value}
                  {s.unit && <span className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)', marginLeft: 2 }}>{s.unit}</span>}
                </p>
              </div>
            ))}
          </div>

          {/* ── player list ── */}
          <div>
            <p className="mono" style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>players</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {gameState.players.map((p, i) => (
                <motion.div
                  key={p.id}
                  className="glass-flat"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '13px 16px', borderRadius: 16,
                    ...(p.id === publicKey?.toBase58() ? { background: 'rgba(255,59,139,0.08)', borderColor: 'rgba(255,59,139,0.28)' } : {}),
                  }}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: 'spring', stiffness: 340, damping: 28, delay: i * 0.06 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)', width: 20 }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{(p.name || `player ${i + 1}`).toLowerCase()}</span>
                    {p.isHost && <span className="chip" style={{ padding: '2px 7px', fontSize: 9 }}>host</span>}
                  </div>
                  <span className="money" style={{ fontSize: 13, color: 'var(--acid)' }}>
                    {gameState.buyInAmount} sol
                  </span>
                </motion.div>
              ))}
              <p className="mono" style={{ textAlign: 'center', padding: '8px 0', color: 'var(--ink-faint)', fontSize: 11 }}>
                waiting for more players…
              </p>
            </div>
          </div>

          {/* ── prediction market ── */}
          {gameState.players.length >= 2 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <p className="mono" style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                  🎯 predictions
                </p>
                {predictionPot > 0 && <span className="mono" style={{ fontSize: 11, color: 'var(--purple)', fontWeight: 700 }}>{predPotSol} sol</span>}
              </div>
              <div className="glass-flat" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, borderRadius: 16 }}>
                {placed ? (
                  <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    <p style={{ color: 'var(--acid)', fontWeight: 700, fontSize: 13 }}>✅ prediction locked!</p>
                    <button onClick={() => setPlaced(false)} style={{ background: 'none', border: 'none', color: 'var(--ink-faint)', fontSize: 11, cursor: 'pointer', marginTop: 4, fontFamily: 'inherit' }}>place another</button>
                  </div>
                ) : (
                  <>
                    <p className="mono" style={{ fontSize: 12, color: 'var(--ink-faint)' }}>bet on who wins 👀</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {gameState.players.map(p => (
                        <button key={p.id} onClick={() => setSelected(p.id)} className="glass-flat" style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '8px 12px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
                          ...(selectedPlayer === p.id ? { borderColor: 'rgba(169,104,255,0.4)', background: 'rgba(169,104,255,0.1)' } : {}),
                        }}>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{(p.name || 'player').toLowerCase()}{p.isHost ? ' 👑' : ''}</span>
                          {(predTotals[p.id] ?? 0) > 0 && <span className="mono" style={{ fontSize: 10, color: 'var(--purple)' }}>{((predTotals[p.id]) / LAMPORTS).toFixed(3)} sol</span>}
                        </button>
                      ))}
                    </div>
                    {selectedPlayer && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {[0.01, 0.05, 0.1, 0.25].map(amt => (
                          <button key={amt} onClick={() => setBetAmount(amt)} className="chip" style={{
                            cursor: 'pointer', fontFamily: 'inherit',
                            ...(betAmount === amt ? { borderColor: 'rgba(169,104,255,0.4)', background: 'rgba(169,104,255,0.15)', color: 'var(--purple)' } : { color: 'var(--ink-faint)' }),
                          }}>{amt}</button>
                        ))}
                        <button onClick={handlePredict} disabled={placing} className="chip chip-acid" style={{ marginLeft: 'auto', cursor: 'pointer', fontFamily: 'inherit' }}>
                          {placing ? '…' : `bet ${betAmount}`}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          )}
        </div>

        {/* ── CTA ── */}
        <div style={{ width: '100%', paddingTop: 20, paddingBottom: 8 }}>
          <motion.button
            className="btn btn-degen"
            onClick={async () => { await startGame(); navigate('/game'); }}
            disabled={loading}
            whileTap={{ scale: 0.96 }}
          >
            {loading ? 'starting…' : 'start game'}
          </motion.button>
          <p className="mono" style={{ textAlign: 'center', fontSize: 10, color: 'var(--ink-faint)', marginTop: 8, letterSpacing: '0.04em' }}>
            start with any number of players
          </p>
        </div>
      </div>
    </>
  );
};
