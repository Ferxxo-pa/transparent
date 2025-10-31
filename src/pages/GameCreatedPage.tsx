import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { GlowButton } from '../components/GlowButton';
import { useGame } from '../contexts/GameContext';
import groupIcon from '../assets/Group.svg';
import moneyBagIcon from '../assets/business-products-bag-money--Streamline-Pixel.svg';
import moneyIcon from '../assets/money-payments-accounting-bill-money-2--Streamline-Pixel.svg';
import transparentLogo from '../assets/trans 3.svg';

export const GameCreatedPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, startGame } = useGame();

  if (!gameState) {
    navigate('/');
    return null;
  }

  const handleStartGame = () => {
    startGame();
    navigate('/game');
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-8">
      {/* Top buttons */}
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

      {/* Centered logo */}
      <div className="absolute top-24 left-1/2 -translate-x-1/2">
        <img
          src={transparentLogo}
          alt="Transparent"
          style={{ height: '100px', width: 'auto' }}
        />
      </div>

      {/* ✅ Match JoinGamePage card positioning */}
      <div className="flex flex-col items-center justify-center mt-[180px]">
        <GlassCard className="w-full max-w-2xl mb-8">
          <div className="flex flex-col items-center gap-8 py-12">
            <h3
              className="text-white text-4xl font-bold"
              style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
            >
              Room Code
            </h3>

            <div className="backdrop-blur-md bg-black/80 rounded-full px-8 py-4">
              <p
                className="text-[#BFFB4F] text-5xl font-bold"
                style={{
                  fontFamily: 'Pixelify Sans, sans-serif',
                  letterSpacing: '0.3em',
                }}
              >
                {gameState.roomCode}
              </p>
            </div>

            <div className="flex gap-4 w-full px-4">
              <GlowButton variant="purple" className="flex-1 !py-2">Share link</GlowButton>
              <GlowButton onClick={handleStartGame} variant="neon" className="flex-1 !py-2">
                Start Game
              </GlowButton>
            </div>
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-3 gap-12 mb-12">
        <div className="flex flex-col items-center gap-4">
          <img src={moneyIcon} alt="Buy-In" className="w-20 h-20" />
          <p
            className="text-white font-bold text-xl"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            Buy-In
          </p>
          <p
            className="text-[#BFFB4F] text-3xl font-bold"
            style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
          >
            {gameState.buyInAmount} SOL
          </p>
        </div>

        <div className="flex flex-col items-center gap-4">
          <img src={groupIcon} alt="Players" className="w-20 h-20" />
          <p
            className="text-white font-bold text-xl"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            Players
          </p>
          <p
            className="text-[#BFFB4F] text-3xl font-bold"
            style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
          >
            {gameState.players.length} / 4
          </p>
        </div>

        <div className="flex flex-col items-center gap-4">
          <img src={moneyBagIcon} alt="Total Pot" className="w-20 h-20" />
          <p
            className="text-white font-bold text-xl"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            Total Pot
          </p>
          <p
            className="text-[#BFFB4F] text-3xl font-bold"
            style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
          >
            {gameState.currentPot.toFixed(1)} SOL
          </p>
        </div>
      </div>

      {/* Players */}
      <div className="flex flex-wrap justify-center gap-8 mb-12">
        {gameState.players.map((player, index) => (
          <p
            key={player.id}
            className="text-[#BFFB4F] text-3xl font-bold"
            style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
          >
            player {index + 1}
          </p>
        ))}
      </div>
    </div>
  );
};
