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
  const [votedId,  setVotedId]  = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const myWallet    = publicKey?.toBase58() ?? '';
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

  const vote = useCallback(async (id: string) => {
    if (alreadyVoted) return;
    setVotedId(id);
    await voteForQuestion(id);
  }, [alreadyVoted, voteForQuestion]);

  const questions = gameState?.submittedQuestions ?? [];
  const winner    = questions.length > 0
    ? questions.reduce((b, q) => (q.votes > (b?.votes ?? -1) ? q : b), questions[0])
    : null;

  return (
    <div className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p className="label-sm" style={{ marginBottom: 2 }}>
            {revealed ? 'Winning question' : 'Vote for best question'}
          </p>
          <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--acid)', letterSpacing: '-0.02em' }}>
            for {hotSeatPlayerName}
          </p>
        </div>
        {revealed
          ? <span style={{ fontSize: 28 }}>🔥</span>
          : <div className={`timer ${timeLeft <= 5 ? 'urgent' : ''}`}>{timeLeft}</div>
        }
      </div>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {questions.map(q => {
          const isMyVote = votedId === q.id || gameState?.questionVotes?.[myWallet] === q.id;
          const isWinner = revealed && q.id === winner?.id;

          return (
            <button
              key={q.id}
              onClick={() => vote(q.id)}
              disabled={alreadyVoted && !revealed}
              style={{
                textAlign: 'left',
                padding: '14px 16px',
                borderRadius: '16px',
                border: `1.5px solid ${isWinner ? 'rgba(196,255,60,0.28)' : isMyVote ? 'var(--glass-stroke-hi)' : 'var(--glass-stroke)'}`,
                background: isWinner ? 'rgba(196,255,60,0.10)' : isMyVote ? 'var(--glass-bg-hi)' : 'var(--glass-bg)',
                cursor: alreadyVoted && !revealed ? 'default' : 'pointer',
                transition: 'border-color 0.1s, background 0.1s',
                width: '100%',
              }}
            >
              <p style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
                "{q.text}"
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Anonymous</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: isWinner ? 'var(--acid)' : 'var(--ink-faint)' }}>
                  {q.votes} vote{q.votes !== 1 ? 's' : ''}
                </span>
              </div>
            </button>
          );
        })}

        {questions.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--ink-faint)', fontSize: 14, padding: '16px 0' }}>
            No questions submitted…
          </p>
        )}
      </div>

      {alreadyVoted && !revealed && (
        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink-faint)' }}>
          ✓ Vote cast — waiting for timer
        </p>
      )}
    </div>
  );
};
