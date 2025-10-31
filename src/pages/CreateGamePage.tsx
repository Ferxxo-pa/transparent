import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { GlowButton } from '../components/GlowButton';
import { useGame } from '../contexts/GameContext';
import transparentLogo from '../assets/trans 3.svg';

export const CreateGamePage: React.FC = () => {
  const navigate = useNavigate();
  const { createGame } = useGame();
  const [buyIn, setBuyIn] = useState('');
  const [roomName, setRoomName] = useState('');

  const handleCreate = () => {
    const buyInAmount = parseFloat(buyIn) || 0.1;
    createGame(buyInAmount, roomName);
    navigate('/created');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8">
      {/* Back button */}
      <div className="absolute top-10 left-10">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 backdrop-blur-md bg-black/80 text-white px-6 py-2 rounded-full hover:bg-black/90 transition-all font-['Plus_Jakarta_Sans']"
        >
          <ArrowLeft size={20} color="#BFFB4F" />
          <span>Back</span>
        </button>
      </div>

      {/* waa.sol badge */}
      <div className="absolute top-10 right-10">
        <div className="backdrop-blur-md bg-black/80 text-white px-6 py-2 rounded-full font-['Plus_Jakarta_Sans']">
          waa.sol
        </div>
      </div>

      {/* Centered logo */}
      <div className="absolute top-24 left-1/2 -translate-x-1/2">
        <img
          src={transparentLogo}
          alt="Transparent"
          style={{ height: '100px', width: 'auto' }}
        />
      </div>

      {/* ✅ Match JoinGamePage box position */}
      <div className="flex flex-col items-center justify-center mt-[180px]">
        <GlassCard className="w-full max-w-xl">
          <div className="flex flex-col items-center gap-8 py-8">
            <div className="w-full space-y-8">
              {/* Buy-In Section */}
              <div>
                <h3
                  className="text-white text-4xl text-center mb-4 font-bold"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  Buy-In Amount
                </h3>
                <div className="backdrop-blur-md bg-black/80 rounded-full p-4">
                  <input
                    type="text"
                    value={buyIn}
                    onChange={(e) => setBuyIn(e.target.value)}
                    placeholder="0.1 SOL"
                    className="w-full bg-transparent text-[#BFFB4F]/50 text-4xl text-center font-bold outline-none placeholder:text-[#BFFB4F]/50"
                    style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
                  />
                </div>
              </div>

              {/* Room Name Section */}
              <div>
                <h3
                  className="text-white text-4xl text-center mb-4 font-bold"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  Room Name
                </h3>
                <div className="backdrop-blur-md bg-black/80 rounded-full p-4">
                  <input
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="College Night"
                    className="w-full bg-transparent text-[#BFFB4F]/50 text-4xl text-center font-bold outline-none placeholder:text-[#BFFB4F]/50"
                    style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
                  />
                </div>
              </div>
            </div>

            {/* Create Button */}
            <div className="flex justify-center mt-4">
              <GlowButton onClick={handleCreate} variant="purple">
                Create Game
              </GlowButton>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};
