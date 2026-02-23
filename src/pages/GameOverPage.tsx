import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gamepad2 } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { GlowButton } from '../components/GlowButton';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';

export const GameOverPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, resetGame, distributeWinnings, loading } = useGame();
  const { connected, displayName, publicKey } = usePrivyWallet();
  const [selectedWinners, setSelectedWinners] = useState<string[]>([]);
  const [isConfirmed, setIsConfirmed] = useState(false);

  if (!gameState) {
    navigate('/');
    return null;
  }

  const isHost = publicKey?.toBase58() === (gameState as any).hostWallet;

  // Calculate per-player vote results
  const transparentVotes = Object.values(gameState.votes).filter((v) => v === 'transparent').length;
  const fakeVotes = Object.values(gameState.votes).filter((v) => v === 'fake').length;
  const totalVotesCast = transparentVotes + fakeVotes;

  const handleToggleWinner = (playerId: string) => {
    if (isConfirmed) return;

    setSelectedWinners((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId]
    );
  };

  const handleConfirmDistribution = async () => {
    if (selectedWinners.length === 0) return;

    // Distribute to first selected winner on-chain
    if (isHost && selectedWinners[0]) {
      try {
        await distributeWinnings(selectedWinners[0]);
      } catch (err) {
        console.error('Distribution failed:', err);
      }
    }

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

      {/* wallet badge (top right) */}
      <div className="absolute top-10 right-10">
        <div className="backdrop-blur-md bg-black/80 text-white px-6 py-2 rounded-full font-['Plus_Jakarta_Sans']">
          {connected ? displayName : 'Not Connected'}
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

      {/* Vote results summary */}
      <GlassCard className="w-full max-w-xl mb-12 mt-[180px]">
        <div className="flex flex-col items-center gap-6 py-8">
          <h2
            className="text-white text-4xl font-bold"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            Total Pot
          </h2>
          <p
            className="text-[#A67BEC] text-7xl font-bold"
            style={{
              fontFamily: 'Pixelify Sans, sans-serif',
              textShadow: '0px 4px 4px rgba(0, 0, 0, 0.25)',
            }}
          >
            {gameState.currentPot.toFixed(2)} SOL
          </p>
          {totalVotesCast > 0 && (
            <div className="flex gap-8 text-xl">
              <span className="text-[#BFFB4F]">Transparent: {transparentVotes}</span>
              <span className="text-white/60">Fake: {fakeVotes}</span>
            </div>
          )}
        </div>
      </GlassCard>

      <h3
        className="text-white text-4xl font-bold mb-4"
        style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
      >
        {isHost ? 'Select Winner & Distribute' : 'Results'}
      </h3>

      <div className="flex flex-wrap justify-center gap-8 mb-12">
        {gameState.players.map((player, index) => {
          const isSelected = selectedWinners.includes(player.id);
          const winnings = isConfirmed && isSelected ? winningsPerPlayer : 0;
          return (
            <div
              key={player.id}
              onClick={() => isHost && handleToggleWinner(player.id)}
              className={`backdrop-blur-md bg-black/80 px-8 py-6 rounded-3xl transition-all ${
                isHost && !isConfirmed ? 'cursor-pointer hover:bg-black/60' : ''
              } ${isSelected ? 'ring-2 ring-[#BFFB4F]' : ''}`}
            >
              <p
                className="text-white text-2xl font-bold mb-2"
                style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
              >
                {player.name || `Player ${index + 1}`}
                {isConfirmed && isSelected ? `: ${winnings.toFixed(2)} SOL` : ''}
              </p>
            </div>
          );
        })}
      </div>

      {/* Host can distribute */}
      {isHost && !isConfirmed && selectedWinners.length > 0 && (
        <div className="mb-8">
          <GlowButton onClick={handleConfirmDistribution} variant="neon">
            {loading ? 'Distributing...' : `Distribute ${gameState.currentPot.toFixed(2)} SOL`}
          </GlowButton>
        </div>
      )}

      {/* Leaderboard */}
      {gameState.scores && Object.keys(gameState.scores).length > 0 && (
        <div className="w-full max-w-2xl mb-12 mt-4">
          <h3
            className="text-white text-4xl font-bold text-center mb-6"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            🏆 Leaderboard
          </h3>

          {(() => {
            const scores = gameState.scores!;
            const ranked = gameState.players
              .filter((p) => scores[p.id])
              .map((p) => ({
                player: p,
                score: scores[p.id],
                honesty: scores[p.id].transparent / Math.max(scores[p.id].transparent + scores[p.id].fake, 1),
              }))
              .sort((a, b) => b.honesty - a.honesty);

            const mostHonest = ranked[0];

            return ranked.map(({ player, score, honesty }, i) => (
              <div
                key={player.id}
                className="flex items-center justify-between backdrop-blur-md bg-black/80 px-6 py-4 rounded-2xl mb-3"
              >
                <div className="flex items-center gap-4">
                  <span
                    className="text-2xl font-bold"
                    style={{
                      fontFamily: 'Pixelify Sans, sans-serif',
                      color: i === 0 ? '#BFFB4F' : 'white',
                    }}
                  >
                    {i + 1}.
                  </span>
                  <span
                    className="text-xl font-bold text-white"
                    style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
                  >
                    {player.name}
                    {mostHonest?.player.id === player.id && (
                      <span className="ml-2 text-sm text-[#BFFB4F]">🌟 Most Honest</span>
                    )}
                  </span>
                </div>
                <div className="flex gap-6 text-lg">
                  <span className="text-[#BFFB4F]">✅ {score.transparent}</span>
                  <span className="text-white/50">❌ {score.fake}</span>
                  <span className="text-white/40 text-sm self-center">
                    {Math.round(honesty * 100)}% honest
                  </span>
                </div>
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
};
