import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, ArrowLeft } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { QuestionMode } from '../types/game';

import fireIconSrc from '../assets/social-rewards-trends-hot-flame--Streamline-Pixel.svg';
import moneyBagSrc from '../assets/business-products-bag-money--Streamline-Pixel.svg';
import messageIconSrc from '../assets/email-mail-chat--Streamline-Pixel.svg';

const MODES: { id: QuestionMode; pixelIcon: string; title: string; desc: string }[] = [
  { id: 'classic',  pixelIcon: moneyBagSrc,    title: 'Classic',  desc: 'Built-in question pool' },
  { id: 'hot-take', pixelIcon: fireIconSrc,     title: 'Hot Take', desc: 'Players write questions' },
  { id: 'custom',   pixelIcon: messageIconSrc,  title: 'Custom',   desc: 'You write all questions' },
];

export const CreateGamePage: React.FC = () => {
  const navigate = useNavigate();
  const { createGame, loading, error } = useGame();
  const { connected, login, displayName } = usePrivyWallet();

  const [buyIn,    setBuyIn]    = useState('0.1');
  const [roomName, setRoomName] = useState('');
  const [nickname, setNickname] = useState('');
  const [mode,     setMode]     = useState<QuestionMode>('classic');
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
        <button className="btn-icon" onClick={() => navigate('/')} style={{ border: '1px solid var(--border)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', padding: 10, borderRadius: 10, background: 'var(--glass)', color: 'var(--text-2)' }}>
          <ArrowLeft size={16} />
        </button>
        <span style={{ fontFamily: 'Space Grotesk', fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>Create Game</span>
        <div className="badge badge-neutral">{connected ? displayName : 'Not connected'}</div>
      </nav>

      <div className="page-content animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Buy In */}
        <div>
          <label className="label">Buy-In (SOL)</label>
          <input
            className="input"
            type="number" min="0.01" step="0.01"
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

        {/* Nickname */}
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
                style={{ textAlign: 'left', width: '100%' }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: mode === m.id ? 'rgba(232,223,200,0.1)' : 'var(--glass-2)',
                  border: `1px solid ${mode === m.id ? 'rgba(232,223,200,0.2)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  <img src={m.pixelIcon} alt={m.title} style={{ width: 20, height: 20, objectFit: 'contain', opacity: 0.75, filter: 'brightness(0) invert(1)' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'Space Grotesk', fontWeight: 600, fontSize: 14, color: mode === m.id ? 'var(--cream)' : 'var(--text)' }}>
                    {m.title}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{m.desc}</div>
                </div>
                {mode === m.id && (
                  <span style={{ color: 'var(--cream)', fontSize: 14 }}>✓</span>
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
                    onChange={e => { const u = [...customQs]; u[i] = e.target.value; setCustomQs(u); }}
                    placeholder={`Question ${i + 1}...`}
                  />
                  {customQs.length > 2 && (
                    <button
                      onClick={() => setCustomQs(customQs.filter((_, j) => j !== i))}
                      style={{ flexShrink: 0, background: 'var(--glass)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, cursor: 'pointer', color: 'var(--text-2)', display: 'flex' }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setCustomQs([...customQs, ''])}
                style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-3)', fontSize: 13, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
              >
                <Plus size={13} /> Add question
              </button>
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px' }}>
          <div>
            <div className="label" style={{ marginBottom: 4 }}>Buy-In</div>
            <div style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 24, color: 'var(--lime)', letterSpacing: '-0.02em' }}>
              {buyIn || '0.1'} <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-3)' }}>SOL</span>
            </div>
          </div>
          <div style={{ width: 1, height: 36, background: 'var(--border)' }} />
          <div>
            <div className="label" style={{ marginBottom: 4 }}>Mode</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <img src={MODES.find(m => m.id === mode)?.pixelIcon} alt="" style={{ width: 18, height: 18, opacity: 0.6, filter: 'brightness(0) invert(1)' }} />
              <span style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>
                {MODES.find(m => m.id === mode)?.title}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(255,100,80,0.08)', border: '1px solid rgba(255,100,80,0.25)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={connected ? handleCreate : undefined}
          disabled={!connected || loading}
          style={{ fontSize: 15, padding: '18px', marginTop: 4 }}
        >
          {loading ? 'Creating...' : connected ? 'Create Game' : '🔒 Connect Wallet'}
        </button>
      </div>
    </div>
  );
};
