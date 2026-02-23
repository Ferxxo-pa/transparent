import React, { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { GlowButton } from '../components/GlowButton';
import { QuestionSubmitPhase } from '../components/QuestionSubmitPhase';
import { QuestionVotePhase } from '../components/QuestionVotePhase';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';
import transparentLogo from '../assets/trans 3.svg';

export const GamePlayPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, castVote, advanceHotTakePhase } = useGame();
  const { connected, displayName, publicKey } = usePrivyWallet();

  useEffect(() => {
    if (gameState?.gameStatus === 'gameover') {
      navigate('/gameover');
    }
  }, [gameState?.gameStatus, navigate]);

  const handleVote = (vote: 'transparent' | 'fake') => {
    castVote(vote);
  };

  const handleAdvancePhase = useCallback(() => {
    advanceHotTakePhase();
  }, [advanceHotTakePhase]);

  if (!gameState) {
    navigate('/');
    return null;
  }

  const currentPlayer = gameState.players.find(
    (p) => p.id === gameState.currentPlayerInHotSeat,
  );

  const myWallet = publicKey?.toBase58() ?? '';
  const hasVoted = !!gameState.votes[myWallet];
  const isHotSeat = myWallet === gameState.currentPlayerInHotSeat;
  const isHotTake = gameState.questionMode === 'hot-take';
  const phase = gameState.gamePhase;

  // ── Hot-Take: Submitting Questions ───────────────────────
  if (isHotTake && phase === 'submitting-questions') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-8">
        <HeaderBar navigate={navigate} connected={connected} displayName={displayName} />

        <div className="flex flex-col items-center justify-center mt-[180px]">
          {isHotSeat ? (
            <GlassCard className="w-full max-w-xl">
              <div className="flex flex-col items-center gap-6 py-8">
                <div
                  className="text-[#BFFB4F] text-6xl"
                  style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
                >
                  🪑
                </div>
                <h2
                  className="text-white text-3xl font-bold text-center"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  You're in the Hot Seat!
                </h2>
                <p className="text-white/60 text-lg text-center">
                  Other players are writing questions for you...
                </p>
                <div className="text-white/40 text-lg">
                  {gameState.submittedQuestions?.length ?? 0} / {gameState.players.length - 1} submitted
                </div>
              </div>
            </GlassCard>
          ) : (
            <QuestionSubmitPhase
              hotSeatPlayerName={currentPlayer?.name || 'Unknown'}
              onTimerEnd={handleAdvancePhase}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Hot-Take: Voting on Questions ────────────────────────
  if (isHotTake && phase === 'voting-question') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-8">
        <HeaderBar navigate={navigate} connected={connected} displayName={displayName} />

        <div className="flex flex-col items-center justify-center mt-[180px]">
          <QuestionVotePhase
            hotSeatPlayerName={currentPlayer?.name || 'Unknown'}
            onTimerEnd={handleAdvancePhase}
          />
        </div>
      </div>
    );
  }

  // ── Hot-Take: Answering (hot seat player answers) ────────
  if (isHotTake && phase === 'answering') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-8">
        <HeaderBar navigate={navigate} connected={connected} displayName={displayName} />

        <div className="flex flex-col items-center justify-center mt-[180px]">
          <GlassCard className="w-full max-w-xl">
            <div className="flex flex-col items-center gap-8 py-8">
              <div className="mb-4">
                <p className="text-[#BFFB4F] text-xl text-center">
                  In Hot Seat: {currentPlayer?.name || 'Waiting...'}
                </p>
              </div>

              <p className="text-white/60 text-sm uppercase tracking-wider">
                🔥 Hot Take Question
              </p>

              <p
                className="text-white text-center text-3xl max-w-2xl leading-relaxed"
                style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
              >
                {gameState.currentQuestion || 'No question selected'}
              </p>

              {isHotSeat ? (
                <div className="flex flex-col items-center gap-4">
                  <p className="text-white/60 text-lg text-center">
                    Answer this question out loud!
                  </p>
                  <GlowButton onClick={handleAdvancePhase} variant="neon">
                    I've Answered ✓
                  </GlowButton>
                </div>
              ) : (
                <p className="text-white/60 text-lg text-center">
                  Listen to {currentPlayer?.name}'s answer...
                </p>
              )}

              <PlayersSection gameState={gameState} />
            </div>
          </GlassCard>
        </div>
      </div>
    );
  }

  // ── Default / Classic / Custom / Voting-Honesty Phase ────
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8">
      <HeaderBar navigate={navigate} connected={connected} displayName={displayName} />

      <div className="flex flex-col items-center justify-center mt-[180px]">
        <GlassCard className="w-full max-w-xl">
          <div className="flex flex-col items-center gap-8 py-8">
            <div className="mb-4">
              <p className="text-[#BFFB4F] text-xl text-center">
                In Hot Seat: {currentPlayer?.name || 'Waiting...'}
              </p>
            </div>

            {isHotTake && phase === 'voting-honesty' && (
              <p className="text-white/60 text-sm uppercase tracking-wider">
                🔥 Hot Take Question
              </p>
            )}

            <p
              className="text-white text-center text-3xl max-w-2xl leading-relaxed"
              style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
            >
              {gameState.currentQuestion}
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
                  className={`text-2xl px-12 ${hasVoted ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  Transparent
                </GlowButton>
                <GlowButton
                  onClick={() => handleVote('fake')}
                  variant="green"
                  className={`text-2xl px-12 ${hasVoted ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  Fake
                </GlowButton>
              </div>
            </div>

            {gameState.voteCount > 0 && (
              <p className="text-[#BFFB4F]/60 text-xl mt-4">
                Votes... {gameState.voteCount} / {gameState.totalVotes}
              </p>
            )}

            {/* For hot-take mode, host advances to next round after voting */}
            {isHotTake && phase === 'voting-honesty' && hasVoted && myWallet === gameState.hostWallet && (
              <GlowButton onClick={handleAdvancePhase} variant="neon" className="mt-4">
                Next Round →
              </GlowButton>
            )}

            <PlayersSection gameState={gameState} />
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

// ── Extracted sub-components for DRY-ness ────────────────────

interface HeaderBarProps {
  navigate: (path: string) => void;
  connected: boolean;
  displayName: string;
}

const HeaderBar: React.FC<HeaderBarProps> = ({ navigate, connected, displayName }) => (
  <>
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
  </>
);

interface PlayersSectionProps {
  gameState: NonNullable<ReturnType<typeof useGame>['gameState']>;
}

const PlayersSection: React.FC<PlayersSectionProps> = ({ gameState }) => (
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
          {player.name || `Player ${index + 1}`}: {gameState.buyInAmount.toFixed(2)} SOL
        </p>
      ))}
    </div>
  </div>
);
