import React, { useState, useEffect, useCallback } from 'react';
import { GlassCard } from './GlassCard';
import { GlowButton } from './GlowButton';
import { useGame } from '../contexts/GameContext';

interface QuestionSubmitPhaseProps {
  hotSeatPlayerName: string;
  onTimerEnd: () => void;
}

export const QuestionSubmitPhase: React.FC<QuestionSubmitPhaseProps> = ({
  hotSeatPlayerName,
  onTimerEnd,
}) => {
  const { gameState, submitQuestion } = useGame();
  const [question, setQuestion] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);

  const handleSubmit = useCallback(async () => {
    if (!question.trim() || submitted) return;
    await submitQuestion(question.trim());
    setSubmitted(true);
  }, [question, submitted, submitQuestion]);

  useEffect(() => {
    if (timeLeft <= 0) {
      if (!submitted && question.trim()) {
        handleSubmit();
      }
      onTimerEnd();
      return;
    }

    const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, submitted, question, handleSubmit, onTimerEnd]);

  const submittedCount = gameState?.submittedQuestions?.length ?? 0;
  const totalOtherPlayers = (gameState?.players.length ?? 1) - 1;

  return (
    <GlassCard className="w-full max-w-xl">
      <div className="flex flex-col items-center gap-6 py-8">
        {/* Timer */}
        <div className="relative">
          <div
            className="text-[#BFFB4F] text-7xl font-bold"
            style={{
              fontFamily: 'Pixelify Sans, sans-serif',
              textShadow: timeLeft <= 10 ? '0 0 20px #ff4444, 0 0 40px #ff4444' : '0 0 20px #BFFB4F',
            }}
          >
            {timeLeft}s
          </div>
        </div>

        {/* Phase title */}
        <h2
          className="text-white text-3xl font-bold text-center"
          style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
        >
          Write a Question
        </h2>

        <p className="text-white/60 text-lg text-center">
          for <span className="text-[#BFFB4F] font-bold">{hotSeatPlayerName}</span>
        </p>

        {!submitted ? (
          <>
            <div className="w-full">
              <div className="backdrop-blur-md bg-black/80 rounded-3xl p-4">
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={`Ask ${hotSeatPlayerName} something spicy...`}
                  maxLength={200}
                  rows={3}
                  className="w-full bg-transparent text-white text-xl outline-none placeholder:text-white/30 resize-none"
                  style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
                />
              </div>
              <p className="text-white/30 text-sm text-right mt-2">
                {question.length}/200
              </p>
            </div>

            <GlowButton onClick={handleSubmit} variant="purple">
              Submit Question
            </GlowButton>
          </>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div
              className="text-[#BFFB4F] text-4xl font-bold"
              style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
            >
              ✓ Submitted!
            </div>
            <p className="text-white/60 text-lg">
              Waiting for others...
            </p>
          </div>
        )}

        {/* Submission count */}
        <div className="text-white/40 text-lg mt-2">
          {submittedCount} / {totalOtherPlayers} players submitted
        </div>
      </div>
    </GlassCard>
  );
};
