import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, X } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { QuestionMode } from '../types/game';

const MODES: { id: QuestionMode; icon: string; title: string; desc: string }[] = [
  { id: 'classic', icon: '🎲', title: 'Classic', desc: 'Questions from the built-in collection' },
  { id: 'hot-take', icon: '🔥', title: 'Hot Take', desc: 'Players write questions each round' },
  { id: 'custom', icon: '✏️', title: 'Custom', desc: 'You write all the questions' },
];

export const CreateGamePage: React.FC = () => {
  const navigate = useNavigate();
  const { createGame, loading, error } = useGame();
  const { connected, login, displayName } = usePrivyWallet();

  const [buyIn, setBuyIn] = useState('0.1');
  const [roomName, setRoomName] = useState('');
  const [nickname, setNickname] = useState('');
  const [mode, setMode] = useState<QuestionMode>('classic');
  const [customQs, setCustomQs] = useState<string[]>(['', '']);

  const handleCreate = async () => {
    if (!connected) { login(); return; }
    const filtered = mode === 'custom' ? customQs.filter(q => q.trim()) : undefined;
    if (mode === 'custom' && (!filtered || filtered.length === 0)) return;
    await createGame(parseFloat(buyIn) || 0.1, roomName || 'Game Room', mode, filtered, nickname.trim() || undefined);
    navigate('/created');
  };

  return (
    <div className="page">
      <nav className="navbar">
        <button className="btn btn-icon" onClick={() => navigate('/')} style={{ border: 'none' }}>
          <ArrowLeft size={18} />
        </button>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Create Game</span>
        <div className="badge badge-neutral">{connected ? displayName : 'Not connected'}</div>
      </nav>

      <div className="page-content animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Buy In */}
        <div>
          <label className="label">Buy-In (SOL)</label>
          <input
            className="input"
            type="number"
            min="0.01"
            step="0.01"
            value={buyIn}
            onChange={e => setBuyIn(e.target.value)}
            placeholder="0.1"
          />
        </div>

        {/* Room Name */}
        <div>
          <label className="label">Room Name</label>
          <input
            className="input"
            type="text"
            value={roomName}
            onChange={e => setRoomName(e.target.value)}
            placeholder="College Night, Squad Room..."
            maxLength={32}
          />
        </div>

        {/* Your Name */}
        <div>
          <label className="label">Your Nickname</label>
          <input
            className="input"
            type="text"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder="What should people call you?"
            maxLength={20}
          />
        </div>

        {/* Mode */}
        <div>
          <label className="label">Question Mode</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {MODES.map(m => (
              <button
                key={m.id}
                className={`mode-card ${mode === m.id ? 'selected' : ''}`}
                onClick={() => setMode(m.id)}
                style={{ textAlign: 'left', background: mode === m.id ? 'rgba(102,79,251,0.1)' : 'var(--surface-2)' }}
              >
                <span style={{ fontSize: 22 }}>{m.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: mode === m.id ? 'var(--purple-light)' : 'var(--text)' }}>
                    {m.title}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{m.desc}</div>
                </div>
                {mode === m.id && (
                  <div style={{ marginLeft: 'auto', color: 'var(--purple-light)', fontSize: 16 }}>✓</div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Custom questions */}
        {mode === 'custom' && (
          <div>
            <label className="label">Your Questions</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {customQs.map((q, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="input"
                    value={q}
                    onChange={e => {
                      const u = [...customQs]; u[i] = e.target.value; setCustomQs(u);
                    }}
                    placeholder={`Question ${i + 1}...`}
                  />
                  {customQs.length > 2 && (
                    <button
                      className="btn btn-icon"
                      onClick={() => setCustomQs(customQs.filter((_, j) => j !== i))}
                      style={{ flexShrink: 0 }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setCustomQs([...customQs, ''])}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  color: 'var(--text-3)', fontSize: 13, fontWeight: 600,
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0'
                }}
              >
                <Plus size={14} /> Add question
              </button>
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="card" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Buy-In</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--lime)', fontFamily: 'Pixelify Sans', marginTop: 4 }}>{buyIn || '0.1'} SOL</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mode</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', fontFamily: 'Pixelify Sans', marginTop: 4 }}>
              {MODES.find(m => m.id === mode)?.icon} {MODES.find(m => m.id === mode)?.title}
            </div>
          </div>
        </div>

        {error && <p style={{ color: 'var(--danger)', fontSize: 13, textAlign: 'center' }}>{error}</p>}

        <button
          className="btn btn-primary"
          onClick={handleCreate}
          disabled={loading}
          style={{ fontSize: 16, padding: '18px' }}
        >
          {loading ? 'Creating...' : connected ? 'Create Game →' : 'Connect Wallet to Create'}
        </button>
      </div>
    </div>
  );
};
