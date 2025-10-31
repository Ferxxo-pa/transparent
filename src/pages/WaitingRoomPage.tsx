import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { GlowButton } from '../components/GlowButton';
import { useGame } from '../contexts/GameContext';
import transparentLogo from '../assets/transparent logo copy copy.png';

export const WaitingRoomPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, startGame } = useGame();

  useEffect(() => {
    if (gameState?.gameStatus === 'playing') {
      navigate('/game');
    }
  }, [gameState?.gameStatus, navigate]);

  const handleReady = () => {
    startGame();
  };

  if (!gameState) {
    navigate('/');
    return null;
  }

  return (
    <>
      {/* Absolute UI (same as Join page) */}
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

      {/* 1) Centered card area */}
      <div className="min-h-screen flex flex-col items-center justify-center px-8">
        <GlassCard className="w-full max-w-xl">
          <div className="flex flex-col items-center gap-8 py-8">
            <h2 className="text-white text-4xl font-bold">You're In!</h2>

            <div className="w-full text-center">
              <p
                className="text-white/90 text-3xl text-center mb-4"
                style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
              >
                Room Code
              </p>
              <p
                className="text-[#BFFB4F] text-5xl font-bold mb-6"
                style={{
                  fontFamily: 'Pixelify Sans, sans-serif',
                  letterSpacing: '0.3em',
                }}
              >
                {gameState.roomCode}
              </p>

              <div className="flex justify-center">
                <GlowButton onClick={handleReady} variant="purple">
                  READY
                </GlowButton>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* 2) Players section - moved up & horizontal line */}
      <div className="text-center -mt-20">
        <h3
          className="text-white text-4xl font-bold mb-6"
          style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
        >
          Players
        </h3>

        <div className="flex flex-wrap justify-center gap-x-12 gap-y-4">
          {gameState.players.map((player) => (
            <p
              key={player.id}
              className="text-2xl font-bold text-white"
              style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
            >
              {player.name}: {player.balance.toFixed(2)} SOL
            </p>
          ))}
        </div>
      </div>
    </>
  );
};
