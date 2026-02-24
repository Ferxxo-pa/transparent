import React, { useState, useEffect, useCallback } from 'react';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';

interface Props {
  hotSeatPlayerName: string;
  onTimerEnd: () => void;
}

export const QuestionVotePhase: React.FC<Props> = ({ hotSeatPlayerName, onTimerEnd }) => {
  const { gameState, voteForQuestion } = useGame();
  const { publicKey } = usePrivyWallet();
  const [timeLeft, setTimeLeft] = useState(15);
  const [votedId, setVotedId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const myWallet = publicKey?.toBase58() ?? '';
  const alreadyVoted = votedId !== null || !!(gameState?.questionVotes?.[myWallet]);

  useEffect(() => {
    if (timeLeft <= 0) {
      if (!revealed) {
        setRevealed(true);
        setTimeout(onTimerEnd, 2000);
      }
      return;
    }
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, revealed, onTimerEnd]);

  const handleVote = useCallback(async (id: string) => {
    if (alreadyVoted) return;
    setVotedId(id);
    await voteForQuestion(id);
  }, [alreadyVoted, voteForQuestion]);

  const questions = gameState?.submittedQuestions ?? [];
  const winner = questions.reduce((b, q) => (q.votes > (b?.votes ?? -1) ? q : b), questions[0]);

  return (
    <div className="card-lg animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Timer */}
      <div style={{ textAlign: 'center' }}>
        {revealed ? (
          <div style={{ fontSize: 32 }}>🔥</div>
        ) : (
          <div className={`timer ${timeLeft <= 5 ? 'urgent' : ''}`}>{timeLeft}s</div>
        )}
      </div>

      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          {revealed ? 'Winning question!' : 'Vote for the best question'}
        </p>
        <p style={{ fontFamily: 'Pixelify Sans', fontSize: 18, fontWeight: 700, color: 'var(--lime)' }}>
          for {hotSeatPlayerName}
        </p>
      </div>

      {/* Questions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {questions.map(q => {
          const isMyVote = votedId === q.id;
          const isWinner = revealed && q.id === winner?.id;

          return (
            <button
              key={q.id}
              onClick={() => handleVote(q.id)}
              disabled={alreadyVoted && !revealed}
              style={{
                textAlign: 'left',
                padding: '14px 16px',
                borderRadius: 12,
                border: isWinner ? '2px solid var(--lime)' : isMyVote ? '2px solid var(--purple)' : '1px solid var(--border)',
                background: isWinner ? 'rgba(191,251,79,0.08)' : isMyVote ? 'rgba(102,79,251,0.1)' : 'var(--surface-2)',
                cursor: alreadyVoted && !revealed ? 'default' : 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <p style={{ color: 'var(--text)', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
                "{q.text}"
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Anonymous</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: isWinner ? 'var(--lime)' : 'var(--text-3)' }}>
                  {q.votes} vote{q.votes !== 1 ? 's' : ''}
                </span>
              </div>
            </button>
          );
        })}

        {questions.length === 0 && (
          <p style={{ color: 'var(--text-3)', textAlign: 'center', fontSize: 14 }}>
            No questions submitted...
          </p>
        )}
      </div>

      {alreadyVoted && !revealed && (
        <p style={{ color: 'var(--text-2)', fontSize: 13, textAlign: 'center' }}>
          ✓ Vote cast — waiting for timer
        </p>
      )}
    </div>
  );
};
