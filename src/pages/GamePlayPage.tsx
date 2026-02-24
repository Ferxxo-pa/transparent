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

  const myWallet = publicKey?.toBase58() ?? '';
  const isHost = myWallet === (gameState as any)?.hostWallet;

  useEffect(() => {
    if (gameState?.gameStatus === 'gameover') {
      navigate('/gameover');
    }
  }, [gameState?.gameStatus, navigate]);

  const handleVote = (vote: 'transparent' | 'fake') => {
    castVote(vote);
  };

  // FIX: Only the host advances phases. Non-host clients rely on
  // the Supabase real-time subscription to sync phase changes.
  const handleAdvancePhase = useCallback(() => {
    if (isHost) {
      advanceHotTakePhase();
    }
  }, [advanceHotTakePhase, isHost]);

  if (!gameState) {
    navigate('/');
    return null;
  }

  const currentPlayer = gameState.players.find(
    (p) => p.id === gameState.currentPlayerInHotSeat,
  );

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
                className="text-white text-center text-xl max-w-2xl leading-relaxed"
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
            {/* Round + hot seat indicator */}
            <div className="flex items-center justify-between w-full px-2 mb-2">
              <span className="text-white/40 text-sm uppercase tracking-widest">
                Round {(gameState.currentRound ?? 0) + 1} / {gameState.players.length}
              </span>
              <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                isHotTake && phase === 'voting-honesty'
                  ? 'bg-[#BFFB4F]/10 text-[#BFFB4F]'
                  : 'bg-[#664FFB]/20 text-[#A67BEC]'
              }`}>
                {isHotTake && phase === 'voting-honesty' ? '🔥 Hot Take' : '💬 Honesty Check'}
              </span>
            </div>

            <div className="mb-2">
              <p className="text-[#BFFB4F] text-xl text-center">
                🪑 {currentPlayer?.name || 'Waiting...'} is in the Hot Seat
              </p>
            </div>

            <p
              className="text-white text-center text-xl max-w-2xl leading-relaxed"
              style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
            >
              {gameState.currentQuestion}
            </p>

            {isHotSeat ? (
              <div className="mt-6 px-4 py-3 bg-[#BFFB4F]/10 border border-[#BFFB4F]/20 rounded-xl text-center">
                <p className="text-[#BFFB4F] text-lg">You're in the hot seat — answer out loud!</p>
              </div>
            ) : (
              <div className="mt-6">
                <h3
                  className="text-white text-3xl font-bold mb-5 text-center"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  Is {currentPlayer?.name} being transparent?
                </h3>
                <div className="flex gap-6 justify-center">
                  <GlowButton
                    onClick={() => handleVote('transparent')}
                    variant="purple"
                    className={`text-xl px-10 ${hasVoted ? 'opacity-40 pointer-events-none' : ''}`}
                  >
                    ✅ Transparent
                  </GlowButton>
                  <GlowButton
                    onClick={() => handleVote('fake')}
                    variant="green"
                    className={`text-xl px-10 ${hasVoted ? 'opacity-40 pointer-events-none' : ''}`}
                  >
                    ❌ Fake
                  </GlowButton>
                </div>
              </div>
            )}

            {/* Voting progress bar */}
            {gameState.voteCount > 0 && (
              <div className="w-full mt-4">
                <div className="flex justify-between text-sm text-white/40 mb-1">
                  <span>Votes in</span>
                  <span>{gameState.voteCount} / {Math.max(gameState.players.length - 1, 1)}</span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#BFFB4F] rounded-full transition-all duration-500"
                    style={{
                      width: `${(gameState.voteCount / Math.max(gameState.players.length - 1, 1)) * 100}%`
                    }}
                  />
                </div>
                {hasVoted && <p className="text-[#BFFB4F]/60 text-sm text-center mt-2">Vote cast ✓</p>}
              </div>
            )}

            {/* Host-only: advance hot-take voting phase */}
            {isHotTake && phase === 'voting-honesty' && hasVoted && isHost && (
              <GlowButton onClick={handleAdvancePhase} variant="neon" className="mt-2">
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

const PlayersSection: React.FC<PlayersSectionProps> = ({ gameState }) => {
  const scores = gameState.scores ?? {};
  const hasScores = Object.keys(scores).length > 0;

  return (
    <div className="text-center mt-8 pt-8 border-t border-white/10 w-full">
      <h3
        className="text-white/90 text-2xl mb-4"
        style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
      >
        {hasScores ? '🏆 Live Scores' : 'Players'}
      </h3>
      <div className="flex flex-col gap-2 w-full">
        {gameState.players.map((player, index) => {
          const score = scores[player.id];
          const isHotSeat = player.id === gameState.currentPlayerInHotSeat;
          const total = score ? score.transparent + score.fake : 0;
          const honestyPct = total > 0 ? Math.round((score.transparent / total) * 100) : null;

          return (
            <div
              key={player.id}
              className={`flex items-center justify-between px-4 py-2 rounded-xl transition-all ${
                isHotSeat ? 'bg-[#BFFB4F]/10 border border-[#BFFB4F]/30' : 'bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2">
                {isHotSeat && <span className="text-[#BFFB4F] text-sm">🔥</span>}
                <span
                  className="text-white font-bold text-lg"
                  style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
                >
                  {player.name || `Player ${index + 1}`}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                {score ? (
                  <>
                    <span className="text-[#BFFB4F]">✅ {score.transparent}</span>
                    <span className="text-white/40">❌ {score.fake}</span>
                    {honestyPct !== null && (
                      <span className="text-white/30">{honestyPct}%</span>
                    )}
                  </>
                ) : (
                  <span className="text-white/30">{gameState.buyInAmount.toFixed(2)} SOL</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
