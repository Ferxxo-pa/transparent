import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { GlowButton } from '../components/GlowButton';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';
import transparentLogo from '../assets/trans 3.svg';

export const JoinGamePage: React.FC = () => {
  const navigate = useNavigate();
  const { joinGame, loading, error } = useGame();
  const { connected, login, displayName } = usePrivyWallet();
  const [roomCode, setRoomCode] = useState('');
  const [nickname, setNickname] = useState('');

  const handleRoomCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/[^0-9]/g, '');
    if (value.length > 3) {
      value = value.slice(0, 3) + '-' + value.slice(3, 6);
    }
    setRoomCode(value);
  };

  const handleJoin = async () => {
    if (!connected) {
      login();
      return;
    }
    if (roomCode.length === 7) {
      await joinGame(roomCode, nickname.trim() || undefined);
      navigate('/waiting');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8">
      <div className="absolute top-10 left-10">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 backdrop-blur-md bg-black/80 text-white px-6 py-2 rounded-full hover:bg-black/90 transition-all font-['Plus_Jakarta_Sans']"
        >
          <ArrowLeft size={20} color="#BFFB4F" />
          <span>Back</span>
        </button>
      </div>

      <div className="absolute top-10 right-10">
        <div className="backdrop-blur-md bg-black/80 text-white px-6 py-2 rounded-full font-['Plus_Jakarta_Sans']">
          {connected ? displayName : 'Not Connected'}
        </div>
      </div>

      <div className="absolute top-10 left-1/2 -translate-x-1/2">
        <img
          src={transparentLogo}
          alt="Transparent"
          style={{ height: '100px', width: 'auto' }}
        />
      </div>

      <GlassCard className="w-full max-w-xl">
        <div className="flex flex-col items-center gap-8 py-8">
          <h2 className="text-white text-4xl font-bold">Join Game</h2>

          <div className="w-full">
            {/* Nickname input */}
            <p
              className="text-white/90 text-2xl text-center mb-3 font-bold"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              Your Name
            </p>
            <div className="backdrop-blur-md bg-black/80 rounded-full p-4 mb-6">
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Enter nickname..."
                maxLength={20}
                className="w-full bg-transparent text-[#BFFB4F] text-2xl text-center font-bold outline-none placeholder-[#BFFB4F]/40"
                style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
              />
            </div>

            <p
              className="text-white/90 text-3xl text-center mb-6"
              style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
            >
              Enter The Room Code To Join
            </p>

            <div className="backdrop-blur-md bg-black/80 rounded-full p-4 mb-6">
              <input
                type="text"
                value={roomCode}
                onChange={handleRoomCodeChange}
                placeholder="X X X - X X X"
                maxLength={7}
                className="w-full bg-transparent text-[#BFFB4F] text-4xl text-center font-bold outline-none placeholder-[#BFFB4F]/40"
                style={{ fontFamily: 'Pixelify Sans, sans-serif', letterSpacing: '0.5em' }}
              />
            </div>

            {/* Error display */}
            {error && (
              <p className="text-red-400 text-sm text-center mb-4">{error}</p>
            )}

            <div className="flex justify-center">
              <GlowButton onClick={handleJoin} variant="purple">
                {loading ? 'Joining...' : connected ? 'ACCESS GAME' : 'Connect Wallet'}
              </GlowButton>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};
