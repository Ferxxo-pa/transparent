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
        <div className="badge badge-lime pulse-lime">🟢 Waiting</div>
        <div className="badge badge-neutral">{displayName}</div>
      </nav>

      <div className="page-content animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Code */}
        <div className="card-lg" style={{ textAlign: 'center' }}>
          <p className="label" style={{ textAlign: 'center', marginBottom: 10 }}>Room Code</p>
          <button
            onClick={handleCopy}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              background: 'none', border: 'none', cursor: 'pointer', width: '100%', marginBottom: 8
            }}
          >
            <span style={{ fontFamily: 'Pixelify Sans', fontSize: 36, fontWeight: 700, color: 'var(--lime)', letterSpacing: '0.2em' }}>
              {gameState.roomCode}
            </span>
            <span style={{ color: copied ? 'var(--lime)' : 'var(--text-3)' }}>
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </span>
          </button>
          {copied && <p style={{ fontSize: 12, color: 'var(--lime)', marginBottom: 4 }}>Copied!</p>}
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {gameState.players.length} player{gameState.players.length !== 1 ? 's' : ''} · {potTotal} SOL pot
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
                    background: 'var(--surface)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color: 'var(--text-3)'
                  }}>{i + 1}</span>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name || `Player ${i + 1}`}</span>
                  {p.isHost && <span className="badge badge-lime" style={{ padding: '2px 8px', fontSize: 10 }}>Host</span>}
                  {p.id === publicKey?.toBase58() && !p.isHost && (
                    <span className="badge badge-neutral" style={{ padding: '2px 8px', fontSize: 10 }}>You</span>
                  )}
                </div>
                <span style={{ fontSize: 13, color: 'var(--lime)', fontFamily: 'Pixelify Sans', fontWeight: 700 }}>
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
            style={{ fontSize: 16, padding: '18px' }}
            onClick={async () => { await startGame(); navigate('/game'); }}
          >
            Start Game →
          </button>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: '18px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              color: 'var(--text-2)', fontSize: 14
            }}>
              <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
              Waiting for host to start the game...
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
