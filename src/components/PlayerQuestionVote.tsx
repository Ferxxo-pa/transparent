import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';

interface Props {
  questions: string[];
  questionIndices: number[];
  hotSeatPlayerName: string;
  isHotSeatPlayer: boolean;
  onTimerEnd: () => void;
}

/**
 * Players vote on which question the hot seat player has to answer.
 * Hot seat player sees a waiting screen.
 * After 15s, winning question is revealed and game proceeds.
 */
export const PlayerQuestionVote: React.FC<Props> = ({
  questions,
  questionIndices,
  hotSeatPlayerName,
  isHotSeatPlayer,
  onTimerEnd,
}) => {
  const { gameState, voteForQuestionOption } = useGame();
  const { publicKey } = usePrivyWallet();
  const [timeLeft, setTimeLeft] = useState(15);
  const [voted, setVoted] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  const myWallet = publicKey?.toBase58() ?? '';
  const picks = gameState?.questionPickVotes ?? {};
  const alreadyVoted = voted !== null || picks[myWallet] !== undefined;

  // Count votes per option
  const voteCounts = questions.map((_, idx) =>
    Object.values(picks).filter(v => v === idx).length
  );
  const winnerIdx = voteCounts.indexOf(Math.max(...voteCounts));

  useEffect(() => {
    if (timeLeft <= 0) {
      if (!revealed) {
        setRevealed(true);
        setTimeout(onTimerEnd, 2500);
      }
      return;
    }
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, revealed, onTimerEnd]);

  const handleVote = useCallback(async (idx: number) => {
    if (alreadyVoted || isHotSeatPlayer) return;
    setVoted(idx);
    await voteForQuestionOption(idx);
  }, [alreadyVoted, isHotSeatPlayer, voteForQuestionOption]);

  // Hot seat player waiting screen
  if (isHotSeatPlayer) {
    return (
      <div className="card fade-in" style={{ textAlign: 'center', padding: '32px 18px' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>😈</div>
        <p style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>
          They're picking your question...
        </p>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          The group is voting on what to ask you
        </p>
        <div className={`timer ${timeLeft <= 5 ? 'urgent' : ''}`} style={{ margin: '16px auto 0', width: 48, height: 48, fontSize: 20 }}>
          {timeLeft}
        </div>
      </div>
    );
  }

  return (
    <div className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p className="label-sm" style={{ marginBottom: 2 }}>
            {revealed ? '🔥 Winning question' : 'Pick a question to ask'}
          </p>
          <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--lime)', letterSpacing: '-0.02em' }}>
            {hotSeatPlayerName}
          </p>
        </div>
        {!revealed && (
          <div className={`timer ${timeLeft <= 5 ? 'urgent' : ''}`}>{timeLeft}</div>
        )}
      </div>

      {/* Question options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {questions.map((q, idx) => {
          const isMyVote = voted === idx;
          const isWinner = revealed && idx === winnerIdx;

          return (
            <motion.button
              key={idx}
              onClick={() => handleVote(idx)}
              whileTap={!alreadyVoted ? { scale: 0.97 } : {}}
              style={{
                textAlign: 'left',
                padding: '14px 16px',
                borderRadius: 'var(--r-sm)',
                border: `1.5px solid ${isWinner ? 'var(--lime-border)' : isMyVote ? 'var(--border-2)' : 'var(--border)'}`,
                background: isWinner ? 'var(--lime-bg)' : isMyVote ? 'var(--card-2)' : 'var(--card)',
                cursor: alreadyVoted ? 'default' : 'pointer',
                transition: 'all 0.15s',
                width: '100%',
                opacity: revealed && !isWinner ? 0.4 : 1,
              }}
            >
              <p style={{ color: 'var(--text)', fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}>
                "{q}"
              </p>
              {(alreadyVoted || revealed) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {isMyVote ? '✓ Your pick' : ''}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: isWinner ? 'var(--lime)' : 'var(--muted)' }}>
                    {voteCounts[idx]} vote{voteCounts[idx] !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </motion.button>
          );
        })}
      </div>

      {alreadyVoted && !revealed && (
        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
          ✓ Vote cast — waiting for others
        </p>
      )}
    </div>
  );
};
