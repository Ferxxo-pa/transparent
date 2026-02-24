import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';

export const JoinGamePage: React.FC = () => {
  const navigate = useNavigate();
  const { joinGame, loading, error } = useGame();
  const { displayName } = usePrivyWallet();
  const [code, setCode]         = useState('');
  const [nickname, setNickname] = useState('');

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value.replace(/[^0-9]/g, '');
    if (v.length > 3) v = v.slice(0, 3) + '-' + v.slice(3, 6);
    setCode(v);
  };

  const canJoin = code.length === 7;

  const handleJoin = async () => {
    if (!canJoin) return;
    await joinGame(code, nickname.trim() || undefined);
    navigate('/waiting');
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, width: '100%', flex: 1, justifyContent: 'center', paddingBottom: 80 }}>
        <div>
          <div className="heading">Join a room</div>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6 }}>Enter the code from the host</p>
        </div>

        {/* Code input — hero element */}
        <div>
          <p className="label" style={{ marginBottom: 10 }}>Room Code</p>
          <input
            className="input-code"
            value={code}
            onChange={handleCodeChange}
            placeholder="000-000"
            maxLength={7}
            inputMode="numeric"
            autoFocus
          />
        </div>

        {/* Nickname */}
        <div>
          <p className="label" style={{ marginBottom: 8 }}>Your Name</p>
          <input
            className="input"
            type="text"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder="What should people call you?"
            maxLength={18}
          />
        </div>

        {error && (
          <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 'var(--r-sm)', padding: '12px 14px', color: 'var(--red)', fontSize: 13 }}>
            {error}
          </div>
        )}
      </div>

      {/* Sticky CTA */}
      <div style={{ width: '100%', paddingTop: 8 }}>
        <button
          className="btn btn-primary"
          onClick={handleJoin}
          disabled={!canJoin || loading}
        >
          {loading ? 'Joining…' : canJoin ? 'Join Game' : 'Enter Room Code'}
        </button>
      </div>
    </div>
  );
};
