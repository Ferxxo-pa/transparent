import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { GlowButton } from '../components/GlowButton';
import { useGame } from '../contexts/GameContext';
import transparentLogo from '../assets/trans 3.svg';

export const GamePlayPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, castVote, simulateAutoPlay } = useGame();

  useEffect(() => {
    if (gameState?.gameStatus === 'gameover') {
      navigate('/gameover');
    }
  }, [gameState?.gameStatus, navigate]);

  const handleVote = (vote: 'transparent' | 'fake') => {
    castVote(vote);
    simulateAutoPlay();
  };

  if (!gameState) {
    navigate('/');
    return null;
  }

  const currentPlayer = gameState.players.find(
    (p) => p.id === gameState.currentPlayerInHotSeat
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8">
      {/* Header buttons (same as other pages) */}
      <div className="absolute top-10 left-10">
        <button
          onClick={() => navigate('/gameover')}
          className="flex items-center gap-2 backdrop-blur-md bg-black/80 text-white px-6 py-2 rounded-full hover:bg-black/90 transition-all font-['Plus_Jakarta_Sans']"
        >
          <Trash2 size={20} color="#BFFB4F" />
          <span>End Game</span>
        </button>
      </div>

      <div className="absolute top-10 right-10">
        <div className="backdrop-blur-md bg-black/80 text-white px-6 py-2 rounded-full font-['Plus_Jakarta_Sans']">
          waa.sol
        </div>
      </div>

      {/* Centered logo — identical placement */}
      <div className="absolute top-24 left-1/2 -translate-x-1/2">
        <img
          src={transparentLogo}
          alt="Transparent"
          style={{ height: '100px', width: 'auto' }}
        />
      </div>

      {/* ✅ Main card centered and same vertical position as Join/Waiting pages */}
      <div className="flex flex-col items-center justify-center mt-[180px]">
        <GlassCard className="w-full max-w-xl">
          <div className="flex flex-col items-center gap-8 py-8">
            <div className="mb-4">
              <p className="text-[#BFFB4F] text-xl text-center">
                In Hot Seat: {currentPlayer?.name || 'Player 2'}
              </p>
            </div>

            <p
              className="text-white text-center text-3xl max-w-2xl leading-relaxed"
              style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
            >
              You're trapped between your naked parents. To escape, you either have to push forward or back. What direction are you choosing?
            </p>

            <div className="mt-8">
              <h3
                className="text-white text-4xl font-bold mb-6 text-center"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                Your Vote
              </h3>
              <div className="flex gap-8">
                <GlowButton
                  onClick={() => handleVote('transparent')}
                  variant="purple"
                  className="text-2xl px-12"
                >
                  Transparent
                </GlowButton>
                <GlowButton
                  onClick={() => handleVote('fake')}
                  variant="green"
                  className="text-2xl px-12"
                >
                  Fake
                </GlowButton>
              </div>
            </div>

            {gameState.voteCount > 0 && (
              <p className="text-[#BFFB4F]/60 text-xl mt-4">
                Votes... {gameState.voteCount}
              </p>
            )}

            {/* Players inside card */}
            <div className="text-center mt-8 pt-8 border-t border-white/10 w-full">
              <h3
                className="text-white/90 text-3xl mb-6"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                Players
              </h3>
              <div className="flex flex-wrap justify-center gap-x-12 gap-y-4">
                {gameState.players.map((player, index) => (
                  <p
                    key={player.id}
                    className="text-white text-2xl font-bold"
                    style={{
                      fontFamily: 'Pixelify Sans, sans-serif',
                    }}
                  >
                    Player {index + 1}: {player.balance.toFixed(2)} SOL
                  </p>
                ))}
              </div>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};
