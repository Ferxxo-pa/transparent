import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, X } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { QuestionMode } from '../types/game';

const MODES: { id: QuestionMode; label: string; sub: string }[] = [
  { id: 'classic',  label: 'Classic',   sub: 'Built-in questions' },
  { id: 'hot-take', label: 'Hot Take',  sub: 'Players write them' },
  { id: 'custom',   label: 'Custom',    sub: 'You write them' },
];

export const CreateGamePage: React.FC = () => {
  const navigate = useNavigate();
  const { createGame, loading, error } = useGame();
  const { displayName } = usePrivyWallet();

  const [buyIn,    setBuyIn]    = useState('0.1');
  const [roomName, setRoomName] = useState('');
  const [nickname, setNickname] = useState('');
  const [mode,     setMode]     = useState<QuestionMode>('classic');
  const [customQs, setCustomQs] = useState<string[]>(['', '']);

  const handleCreate = async () => {
    const filtered = mode === 'custom' ? customQs.filter(q => q.trim()) : undefined;
    if (mode === 'custom' && !filtered?.length) return;
    await createGame(parseFloat(buyIn) || 0.1, roomName.trim() || 'Game Room', mode, filtered, nickname.trim() || undefined);
    navigate('/created');
  };

  return (
    <div className="page fade-in">
      <nav className="navbar">
        <button
          onClick={() => navigate('/')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, fontFamily: 'Space Grotesk', fontWeight: 600 }}
        >
          <ArrowLeft size={15} /> Back
        </button>
        <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>{displayName}</span>
      </nav>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%', flex: 1 }}>
        <div>
          <div className="heading">Create a room</div>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6 }}>Set the rules, share the code</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Buy-in */}
          <div>
            <p className="label" style={{ marginBottom: 8 }}>Buy-in (SOL)</p>
            <input
              className="input"
              type="number" min="0.01" step="0.01"
              value={buyIn}
              onChange={e => setBuyIn(e.target.value)}
              placeholder="0.1"
            />
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Each player stakes this amount to join</p>
          </div>

          {/* Room name + nickname side by side on wider screens */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <p className="label" style={{ marginBottom: 8 }}>Room Name</p>
              <input className="input" type="text" value={roomName} onChange={e => setRoomName(e.target.value)} placeholder="Squad Night" maxLength={24} />
            </div>
            <div>
              <p className="label" style={{ marginBottom: 8 }}>Your Name</p>
              <input className="input" type="text" value={nickname} onChange={e => setNickname(e.target.value)} placeholder="Your nickname" maxLength={18} />
            </div>
          </div>

          {/* Mode */}
          <div>
            <p className="label" style={{ marginBottom: 10 }}>Question Mode</p>
            <div className="mode-pills">
              {MODES.map(m => (
                <button
                  key={m.id}
                  className={`mode-pill ${mode === m.id ? 'active' : ''}`}
                  onClick={() => setMode(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              {MODES.find(m => m.id === mode)?.sub}
            </p>
          </div>

          {/* Custom questions */}
          {mode === 'custom' && (
            <div>
              <p className="label" style={{ marginBottom: 10 }}>Your Questions</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {customQs.map((q, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="input"
                      value={q}
                      onChange={e => { const u = [...customQs]; u[i] = e.target.value; setCustomQs(u); }}
                      placeholder={`Question ${i + 1}...`}
                    />
                    {customQs.length > 2 && (
                      <button
                        onClick={() => setCustomQs(customQs.filter((_, j) => j !== i))}
                        style={{ width: 46, height: 46, flexShrink: 0, background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setCustomQs([...customQs, ''])}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 13, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
                >
                  <Plus size={13} /> Add question
                </button>
              </div>
            </div>
          )}

          {/* Summary chip row */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="chip chip-lime">{buyIn || '0.1'} SOL buy-in</span>
            <span className="chip chip-muted">{MODES.find(m => m.id === mode)?.label} mode</span>
          </div>

          {error && (
            <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 'var(--r-sm)', padding: '12px 14px', color: 'var(--red)', fontSize: 13 }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Sticky CTA */}
      <div style={{ width: '100%', paddingTop: 20 }}>
        <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
          {loading ? 'Creating…' : 'Create Game'}
        </button>
      </div>
    </div>
  );
};
