import React, { useState, useEffect, useCallback } from 'react';
import { useGame } from '../contexts/GameContext';

interface Props {
  hotSeatPlayerName: string;
  onTimerEnd: () => void;
}

export const QuestionSubmitPhase: React.FC<Props> = ({ hotSeatPlayerName, onTimerEnd }) => {
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
      if (!submitted && question.trim()) handleSubmit();
      onTimerEnd();
      return;
    }
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, submitted, question, handleSubmit, onTimerEnd]);

  const submittedCount = gameState?.submittedQuestions?.length ?? 0;
  const totalOther = (gameState?.players.length ?? 1) - 1;

  return (
    <div className="card-lg animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Timer */}
      <div style={{ textAlign: 'center' }}>
        <div className={`timer ${timeLeft <= 10 ? 'urgent' : ''}`}>{timeLeft}s</div>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
          {submittedCount}/{totalOther} submitted
        </p>
      </div>

      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          Write a question for
        </p>
        <p style={{ fontFamily: 'Pixelify Sans', fontSize: 22, fontWeight: 700, color: 'var(--lime)' }}>
          {hotSeatPlayerName}
        </p>
      </div>

      {!submitted ? (
        <>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder={`Ask ${hotSeatPlayerName} something revealing...`}
            maxLength={200}
            rows={3}
            style={{
              width: '100%',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '14px 16px',
              color: 'var(--text)',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontSize: 15,
              resize: 'none',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{question.length}/200</span>
            <button
              className="btn btn-primary"
              style={{ width: 'auto', padding: '10px 20px' }}
              onClick={handleSubmit}
              disabled={!question.trim()}
            >
              Submit
            </button>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{ fontFamily: 'Pixelify Sans', fontSize: 22, fontWeight: 700, color: 'var(--lime)', marginBottom: 4 }}>
            ✓ Submitted!
          </div>
          <p style={{ color: 'var(--text-2)', fontSize: 14 }}>Waiting for others...</p>
        </div>
      )}
    </div>
  );
};
