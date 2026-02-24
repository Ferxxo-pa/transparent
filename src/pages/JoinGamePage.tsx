import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';

export const JoinGamePage: React.FC = () => {
  const navigate = useNavigate();
  const { joinGame, loading, error } = useGame();
  const { connected, login, displayName } = usePrivyWallet();
  const [roomCode, setRoomCode] = useState('');
  const [nickname, setNickname] = useState('');

  const handleRoomCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value.replace(/[^0-9]/g, '');
    if (v.length > 3) v = v.slice(0, 3) + '-' + v.slice(3, 6);
    setRoomCode(v);
  };

  const handleJoin = async () => {
    if (!connected) { login(); return; }
    if (roomCode.length === 7) {
      await joinGame(roomCode, nickname.trim() || undefined);
      navigate('/waiting');
    }
  };

  const isReady = roomCode.length === 7 && connected;

  return (
    <div className="page">
      <nav className="navbar">
        <button
          onClick={() => navigate('/')}
          style={{ background: 'var(--glass)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, cursor: 'pointer', color: 'var(--text-2)', display: 'flex', alignItems: 'center', backdropFilter: 'blur(10px)' }}
        >
          <ArrowLeft size={16} />
        </button>
        <span style={{ fontFamily: 'Space Grotesk', fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>Join Game</span>
        <div className="badge badge-neutral">{connected ? displayName : 'Not connected'}</div>
      </nav>

      <div className="page-content animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Room code */}
        <div>
          <label className="label">Room Code</label>
          <input
            className="input-code"
            value={roomCode}
            onChange={handleRoomCodeChange}
            placeholder="000-000"
            maxLength={7}
          />
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10, textAlign: 'center' }}>
            Ask the host for the 6-digit code
          </p>
        </div>

        {/* Nickname */}
        <div>
          <label className="label">Your Nickname</label>
          <input
            className="input"
            type="text"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder="How should people know you?"
            maxLength={20}
          />
        </div>

        {error && <p style={{ color: 'var(--danger)', fontSize: 13, textAlign: 'center' }}>{error}</p>}

        <button
          className="btn btn-primary"
          onClick={connected ? handleJoin : undefined}
          disabled={!connected || loading}
          style={{ fontSize: 15, padding: '18px', opacity: connected ? (isReady ? 1 : 0.55) : 0.45 }}
        >
          {loading ? 'Joining...' : !connected ? '🔒 Connect Wallet' : isReady ? 'Join Game' : 'Enter Room Code'}
        </button>
      </div>
    </div>
  );
};
