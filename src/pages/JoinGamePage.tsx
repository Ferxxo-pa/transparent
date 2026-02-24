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
        <button className="btn btn-icon" onClick={() => navigate('/')} style={{ border: 'none' }}>
          <ArrowLeft size={18} />
        </button>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Join Game</span>
        <div className="badge badge-neutral">{connected ? displayName : 'Not connected'}</div>
      </nav>

      <div className="page-content animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Room code input */}
        <div>
          <label className="label">Room Code</label>
          <input
            className="input-code"
            value={roomCode}
            onChange={handleRoomCodeChange}
            placeholder="000-000"
            maxLength={7}
          />
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8, textAlign: 'center' }}>
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
          onClick={handleJoin}
          disabled={loading || (!connected ? false : !isReady)}
          style={{ fontSize: 16, padding: '18px' }}
        >
          {loading ? 'Joining...' : !connected ? 'Connect Wallet to Join' : isReady ? 'Join Game →' : 'Enter Room Code'}
        </button>
      </div>
    </div>
  );
};
