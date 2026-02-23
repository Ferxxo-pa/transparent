import React, { useState, useEffect, useCallback } from 'react';
import { GlassCard } from './GlassCard';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';

interface QuestionVotePhaseProps {
  hotSeatPlayerName: string;
  onTimerEnd: () => void;
}

export const QuestionVotePhase: React.FC<QuestionVotePhaseProps> = ({
  hotSeatPlayerName,
  onTimerEnd,
}) => {
  const { gameState, voteForQuestion } = useGame();
  const { publicKey } = usePrivyWallet();
  const [timeLeft, setTimeLeft] = useState(15);
  const [votedId, setVotedId] = useState<string | null>(null);
  const [winnerRevealed, setWinnerRevealed] = useState(false);

  const myWallet = publicKey?.toBase58() ?? '';
  const alreadyVoted = votedId !== null || !!(gameState?.questionVotes?.[myWallet]);

  useEffect(() => {
    if (timeLeft <= 0) {
      // Brief delay to show winner before advancing
      if (!winnerRevealed) {
        setWinnerRevealed(true);
        setTimeout(() => onTimerEnd(), 2000);
      }
      return;
    }

    const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, winnerRevealed, onTimerEnd]);

  const handleVote = useCallback(
    async (questionId: string) => {
      if (alreadyVoted) return;
      setVotedId(questionId);
      await voteForQuestion(questionId);
    },
    [alreadyVoted, voteForQuestion],
  );

  const questions = gameState?.submittedQuestions ?? [];

  // Find the winning question
  const winningQuestion = questions.reduce(
    (best, q) => (q.votes > (best?.votes ?? -1) ? q : best),
    questions[0],
  );

  return (
    <GlassCard className="w-full max-w-xl">
      <div className="flex flex-col items-center gap-6 py-8">
        {/* Timer */}
        <div
          className="text-[#BFFB4F] text-7xl font-bold"
          style={{
            fontFamily: 'Pixelify Sans, sans-serif',
            textShadow: timeLeft <= 5 ? '0 0 20px #ff4444, 0 0 40px #ff4444' : '0 0 20px #BFFB4F',
          }}
        >
          {winnerRevealed ? '🔥' : `${timeLeft}s`}
        </div>

        <h2
          className="text-white text-3xl font-bold text-center"
          style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
        >
          {winnerRevealed ? 'Winning Question!' : 'Vote for the Best Question'}
        </h2>

        <p className="text-white/60 text-lg text-center">
          for <span className="text-[#BFFB4F] font-bold">{hotSeatPlayerName}</span>
        </p>

        {/* Question Cards */}
        <div className="w-full space-y-4">
          {questions.map((q) => {
            const isMyVote = votedId === q.id;
            const isWinner = winnerRevealed && q.id === winningQuestion?.id;

            return (
              <button
                key={q.id}
                onClick={() => handleVote(q.id)}
                disabled={alreadyVoted && !winnerRevealed}
                className={`
                  w-full text-left backdrop-blur-md rounded-3xl p-5 transition-all duration-300
                  ${isWinner
                    ? 'bg-[#BFFB4F]/30 ring-2 ring-[#BFFB4F] shadow-[0_0_30px_#BFFB4F,0_0_60px_#BFFB4F] scale-105'
                    : isMyVote
                      ? 'bg-[#664FFB]/40 ring-2 ring-[#664FFB]'
                      : 'bg-black/80 hover:bg-black/60'
                  }
                  ${!alreadyVoted ? 'cursor-pointer hover:scale-[1.02]' : 'cursor-default'}
                `}
              >
                <p
                  className="text-white text-xl mb-2"
                  style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
                >
                  "{q.text}"
                </p>
                <div className="flex justify-between items-center">
                  <span className="text-white/40 text-sm">Anonymous</span>
                  <span
                    className={`text-sm font-bold ${
                      isWinner ? 'text-[#BFFB4F]' : 'text-white/60'
                    }`}
                  >
                    {q.votes} vote{q.votes !== 1 ? 's' : ''}
                  </span>
                </div>
              </button>
            );
          })}

          {questions.length === 0 && (
            <p className="text-white/40 text-center text-lg">
              No questions were submitted...
            </p>
          )}
        </div>

        {alreadyVoted && !winnerRevealed && (
          <p className="text-[#BFFB4F]/60 text-lg mt-2">
            Vote cast! Waiting for timer...
          </p>
        )}
      </div>
    </GlassCard>
  );
};
