import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';

export const GameCreatedPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, startGame, loading } = useGame();
  const { displayName } = usePrivyWallet();
  const [copied, setCopied] = useState(false);

  if (!gameState) { navigate('/'); return null; }

  const handleCopy = () => {
    navigator.clipboard.writeText(gameState.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStart = async () => {
    await startGame();
    navigate('/game');
  };

  const potTotal = (gameState.players.length * gameState.buyInAmount).toFixed(2);

  return (
    <div className="page">
      <nav className="navbar">
        <div className="badge badge-lime">🎮 Lobby</div>
        <div className="badge badge-neutral">{displayName}</div>
      </nav>

      <div className="page-content animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Room code */}
        <div className="card-lg" style={{ textAlign: 'center' }}>
          <p className="label" style={{ textAlign: 'center', marginBottom: 12 }}>Share this code</p>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
            marginBottom: 12
          }}>
            <span style={{
              fontFamily: 'Space Grotesk', fontSize: 40, fontWeight: 700,
              color: 'var(--lime)', letterSpacing: '0.2em'
            }}>
              {gameState.roomCode}
            </span>
            <button
              onClick={handleCopy}
              className="btn btn-icon"
              style={{ color: copied ? 'var(--lime)' : 'var(--text-2)' }}
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {gameState.players.length} player{gameState.players.length !== 1 ? 's' : ''} in lobby
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {[
            { label: 'Buy-In', value: `${gameState.buyInAmount} SOL` },
            { label: 'Players', value: `${gameState.players.length}` },
            { label: 'Total Pot', value: `${potTotal} SOL` },
          ].map(s => (
            <div key={s.label} className="card" style={{ textAlign: 'center', padding: '14px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                {s.label}
              </div>
              <div style={{ fontFamily: 'Space Grotesk', fontSize: 18, fontWeight: 700, color: 'var(--lime)' }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Players */}
        <div>
          <label className="label">Players</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {gameState.players.map((p, i) => (
              <div key={p.id} className="player-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: 8,
                    background: 'var(--glass)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color: 'var(--text-3)'
                  }}>{i + 1}</span>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name || `Player ${i + 1}`}</span>
                  {p.isHost && <span className="badge badge-lime" style={{ padding: '2px 8px', fontSize: 10 }}>Host</span>}
                </div>
                <span style={{ fontSize: 13, color: 'var(--lime)', fontFamily: 'Space Grotesk', fontWeight: 700 }}>
                  {gameState.buyInAmount} SOL
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={handleCopy}>
            {copied ? '✓ Copied!' : '📋 Copy Code'}
          </button>
          <button
            className="btn btn-primary"
            style={{ flex: 2 }}
            onClick={handleStart}
            disabled={loading || gameState.players.length < 1}
          >
            {loading ? 'Starting...' : 'Start Game →'}
          </button>
        </div>
      </div>
    </div>
  );
};
