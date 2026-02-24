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
        <div className="badge badge-lime">● Lobby</div>
        <div className="badge badge-neutral">{displayName}</div>
      </nav>

      <div className="page-content animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Room code */}
        <div className="card-lg" style={{ textAlign: 'center' }}>
          <p className="label" style={{ textAlign: 'center', marginBottom: 14 }}>Share this code</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 10 }}>
            <span style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 44, color: 'var(--lime)', letterSpacing: '0.18em', fontVariantNumeric: 'tabular-nums' }}>
              {gameState.roomCode}
            </span>
            <button
              onClick={handleCopy}
              style={{ background: 'var(--glass-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, cursor: 'pointer', color: copied ? 'var(--lime)' : 'var(--text-3)', display: 'flex', alignItems: 'center', transition: 'color 0.2s' }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          {copied && <p style={{ fontSize: 12, color: 'var(--lime)', marginBottom: 4 }}>Copied!</p>}
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {gameState.players.length} player{gameState.players.length !== 1 ? 's' : ''} joined
          </p>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {[
            { label: 'Buy-In', value: `${gameState.buyInAmount}`, unit: 'SOL' },
            { label: 'Players', value: `${gameState.players.length}`, unit: '' },
            { label: 'Pot', value: potTotal, unit: 'SOL' },
          ].map(s => (
            <div key={s.label} className="card" style={{ textAlign: 'center', padding: '14px 10px' }}>
              <div className="label" style={{ marginBottom: 6, textAlign: 'center' }}>{s.label}</div>
              <div style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 20, color: 'var(--lime)', letterSpacing: '-0.02em' }}>
                {s.value}
                {s.unit && <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500, marginLeft: 3 }}>{s.unit}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Players */}
        <div>
          <label className="label">In the Lobby</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {gameState.players.map((p, i) => (
              <div key={p.id} className="player-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--glass-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Space Grotesk', fontSize: 12, fontWeight: 700, color: 'var(--text-3)' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{p.name || `Player ${i + 1}`}</span>
                  {p.isHost && <span className="badge badge-cream" style={{ fontSize: 10, padding: '2px 8px' }}>Host</span>}
                </div>
                <span style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 14, color: 'var(--lime)' }}>
                  {gameState.buyInAmount} SOL
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button
            className="btn btn-secondary"
            style={{ flex: 1, fontSize: 14 }}
            onClick={handleCopy}
          >
            {copied ? '✓ Copied' : 'Copy Code'}
          </button>
          <button
            className="btn btn-primary"
            style={{ flex: 2, fontSize: 15 }}
            onClick={handleStart}
            disabled={loading || gameState.players.length < 1}
          >
            {loading ? 'Starting...' : 'Start Game'}
          </button>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
          Waiting for players to join before starting
        </p>
      </div>
    </div>
  );
};
