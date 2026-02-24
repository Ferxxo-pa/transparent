import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';

export const WaitingRoomPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, startGame } = useGame();
  const { publicKey, displayName } = usePrivyWallet();
  const [copied, setCopied] = useState(false);

  const isHost = publicKey?.toBase58() === (gameState as any)?.hostWallet;

  useEffect(() => {
    if (gameState?.gameStatus === 'playing') navigate('/game');
  }, [gameState?.gameStatus, navigate]);

  if (!gameState) { navigate('/'); return null; }

  const handleCopy = () => {
    navigator.clipboard.writeText(gameState.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const potTotal = (gameState.players.length * gameState.buyInAmount).toFixed(2);

  return (
    <div className="page">
      <nav className="navbar">
        <div className="badge badge-lime pulse-lime">● Live</div>
        <div className="badge badge-neutral">{displayName}</div>
      </nav>

      <div className="page-content animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Room code card */}
        <div className="card-lg" style={{ textAlign: 'center' }}>
          <p className="label" style={{ textAlign: 'center', marginBottom: 14 }}>Room Code</p>
          <button
            onClick={handleCopy}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, width: '100%', marginBottom: 10 }}
          >
            <span style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 44, color: 'var(--lime)', letterSpacing: '0.18em', fontVariantNumeric: 'tabular-nums' }}>
              {gameState.roomCode}
            </span>
            <span style={{ color: copied ? 'var(--lime)' : 'var(--text-3)', transition: 'color 0.2s' }}>
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </span>
          </button>
          {copied && <p style={{ fontSize: 12, color: 'var(--lime)', marginBottom: 6 }}>Copied!</p>}
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {gameState.players.length} player{gameState.players.length !== 1 ? 's' : ''} · <span style={{ color: 'var(--lime)' }}>{potTotal} SOL</span> pot
          </p>
        </div>

        {/* Players */}
        <div>
          <label className="label">In the Room</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {gameState.players.map((p, i) => (
              <div key={p.id} className={`player-row ${p.id === publicKey?.toBase58() ? 'active' : ''}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: 8,
                    background: 'var(--glass-2)', border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'Space Grotesk', fontSize: 12, fontWeight: 700, color: 'var(--text-3)'
                  }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{p.name || `Player ${i + 1}`}</span>
                  {p.isHost && <span className="badge badge-cream" style={{ fontSize: 10, padding: '2px 8px' }}>Host</span>}
                  {p.id === publicKey?.toBase58() && !p.isHost && (
                    <span className="badge badge-neutral" style={{ fontSize: 10, padding: '2px 8px' }}>You</span>
                  )}
                </div>
                <span style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 14, color: 'var(--lime)' }}>
                  {gameState.buyInAmount} SOL
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        {isHost ? (
          <button
            className="btn btn-primary"
            style={{ fontSize: 15, padding: '18px', marginTop: 4 }}
            onClick={async () => { await startGame(); navigate('/game'); }}
          >
            Start Game
          </button>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: '18px 24px' }}>
            <p style={{ color: 'var(--text-3)', fontSize: 14 }}>
              Waiting for host to start...
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
