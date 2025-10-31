import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gamepad2 } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { GlowButton } from '../components/GlowButton';
import { useGame } from '../contexts/GameContext';

export const GameOverPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, resetGame } = useGame();
  const [selectedWinners, setSelectedWinners] = useState<string[]>([]);
  const [isConfirmed, setIsConfirmed] = useState(false);

  if (!gameState) {
    navigate('/');
    return null;
  }

  const playerWinnings: Record<string, number> = {
    'player-1': 1.73,
    'player-2': 0.85,
    'player-3': 0.24,
    'player-4': 1.18,
  };

  const handleToggleWinner = (playerId: string) => {
    if (isConfirmed) return;

    setSelectedWinners((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId]
    );
  };

  const handleConfirmDistribution = () => {
    if (selectedWinners.length === 0) return;
    setIsConfirmed(true);
  };

  const handleNewGame = () => {
    resetGame();
    navigate('/');
  };

  const calculateWinnings = () => {
    if (selectedWinners.length === 0) return 0;
    return gameState.currentPot / selectedWinners.length;
  };

  const winningsPerPlayer = calculateWinnings();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 py-8">
      {/* New Game button (top left) */}
      <div className="absolute top-10 left-10">
        <button
          onClick={handleNewGame}
          className="flex items-center gap-2 backdrop-blur-md bg-black/80 text-white px-6 py-2 rounded-full hover:bg-black/90 transition-all font-['Plus_Jakarta_Sans']"
        >
          <Gamepad2 size={20} color="#BFFB4F" />
          <span>New Game</span>
        </button>
      </div>

      {/* waa.sol badge (top right) */}
      <div className="absolute top-10 right-10">
        <div className="backdrop-blur-md bg-black/80 text-white px-6 py-2 rounded-full font-['Plus_Jakarta_Sans']">
          waa.sol
        </div>
      </div>

      {/* ✅ "GAME OVER" replaces transparent logo position */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2">
        <h1
          className="text-[#BFFB4F] text-8xl font-bold text-center"
          style={{
            fontFamily: 'Pixelify Sans, sans-serif',
            textShadow: '0px 4px 4px rgba(0, 0, 0, 0.25)',
          }}
        >
          GAME OVER
        </h1>
      </div>

      {/* Keep existing spacing and layout below */}
      <GlassCard className="w-full max-w-xl mb-12 mt-[180px]">
        <div className="flex flex-col items-center gap-6 py-8">
          <h2
            className="text-white text-4xl font-bold"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            Total Winnings
          </h2>
          <p
            className="text-[#A67BEC] text-7xl font-bold"
            style={{
              fontFamily: 'Pixelify Sans, sans-serif',
              textShadow: '0px 4px 4px rgba(0, 0, 0, 0.25)',
            }}
          >
            1.73 SOL
          </p>
        </div>
      </GlassCard>

      <h3
        className="text-white text-4xl font-bold mb-4"
        style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
      >
        Distributed Winnings
      </h3>

      <div className="flex flex-wrap justify-center gap-8 mb-12">
        {gameState.players.map((player, index) => {
          const winnings = playerWinnings[player.id] || 0;
          return (
            <div
              key={player.id}
              className="backdrop-blur-md bg-black/80 px-8 py-6 rounded-3xl transition-all"
            >
              <p
                className="text-white text-2xl font-bold mb-2"
                style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
              >
                Player {index + 1}: {winnings.toFixed(2)} SOL
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
