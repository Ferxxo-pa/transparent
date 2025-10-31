import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { GlowButton } from '../components/GlowButton';
import { useGame } from '../contexts/GameContext';
import transparentLogo from '../assets/transparent logo copy copy.png';

export const JoinGamePage: React.FC = () => {
  const navigate = useNavigate();
  const { joinGame } = useGame();
  const [roomCode, setRoomCode] = useState('');

  const handleRoomCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/[^0-9]/g, '');
    if (value.length > 3) {
      value = value.slice(0, 3) + '-' + value.slice(3, 6);
    }
    setRoomCode(value);
  };

  const handleJoin = () => {
    if (roomCode.length === 7) {
      joinGame(roomCode);
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
          waa.sol
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

            <div className="flex justify-center">
              <GlowButton onClick={handleJoin} variant="purple">
                ACCESS GAME
              </GlowButton>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};
