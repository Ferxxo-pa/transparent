import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';

export const GameCreatedPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, startGame, loading } = useGame();
  const { publicKey } = usePrivyWallet();
  const [copied, setCopied] = useState(false);

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
        <span className="chip chip-lime blink">● Lobby</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {gameState.players.length} joined
        </span>
      </nav>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', flex: 1 }}>

        {/* Room code — the most important element */}
        <div className="card" style={{ textAlign: 'center', padding: '28px 20px' }}>
          <p className="label" style={{ marginBottom: 14 }}>Share this code</p>
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
              <div key={p.id} className={`player-row ${p.id === publicKey?.toBase58() ? 'me' : ''}`}>
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
              </div>
            ))}

            {/* Waiting indicator */}
            <div style={{ textAlign: 'center', padding: '10px 0', color: 'var(--muted)', fontSize: 13 }}>
              Waiting for more players…
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ width: '100%', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="btn btn-primary" onClick={async () => { await startGame(); navigate('/game'); }} disabled={loading}>
          {loading ? 'Starting…' : 'Start Game'}
        </button>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
          You can start with any number of players
        </p>
      </div>
    </div>
  );
};
