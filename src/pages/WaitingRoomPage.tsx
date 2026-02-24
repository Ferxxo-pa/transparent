import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Copy, Check } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';

export const WaitingRoomPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, startGame } = useGame();
  const { publicKey } = usePrivyWallet();
  const [copied, setCopied] = useState(false);

  const isHost = publicKey?.toBase58() === (gameState as any)?.hostWallet;

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
      <nav className="navbar">
        <span className="chip chip-lime blink">● Waiting</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {gameState.players.length} joined · {pot} SOL pot
        </span>
      </nav>

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
            {gameState.players.map((p, i) => (
              <motion.div
                key={p.id}
                className={`player-row ${p.id === publicKey?.toBase58() ? 'me' : ''}`}
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
                  {p.id === publicKey?.toBase58() && <span className="chip chip-white" style={{ padding: '2px 8px', fontSize: 10 }}>You</span>}
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--lime)' }}>
                  {gameState.buyInAmount} SOL
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ width: '100%', paddingTop: 16 }}>
        {isHost ? (
          <>
            <motion.button
              className="btn btn-primary"
              onClick={async () => { await startGame(); navigate('/game'); }}
              whileTap={{ scale: 0.96 }}
              whileHover={{ scale: 1.03, boxShadow: '0 0 40px rgba(196,255,60,0.45)' }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              Start Game →
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
