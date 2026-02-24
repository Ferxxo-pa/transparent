import React, { useState, useEffect, useCallback } from 'react';
import { useGame } from '../contexts/GameContext';

interface Props {
  hotSeatPlayerName: string;
  onTimerEnd: () => void;
}

export const QuestionSubmitPhase: React.FC<Props> = ({ hotSeatPlayerName, onTimerEnd }) => {
  const { gameState, submitQuestion } = useGame();
  const [question,  setQuestion]  = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft,  setTimeLeft]  = useState(30);

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
  const total = Math.max((gameState?.players.length ?? 1) - 1, 1);

  if (submitted) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '32px 20px' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
        <p style={{ fontWeight: 700, fontSize: 18, color: 'var(--lime)' }}>Submitted!</p>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6 }}>Waiting for others…</p>
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
            <span style={{ color: 'var(--muted)' }}>Submitted</span>
            <span style={{ color: 'var(--muted)' }}>{submittedCount}/{total}</span>
          </div>
          <div className="progress">
            <div className="progress-bar" style={{ width: `${(submittedCount / total) * 100}%` }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Timer + context */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p className="label-sm" style={{ marginBottom: 2 }}>Write a question for</p>
          <p style={{ fontWeight: 700, fontSize: 18, color: 'var(--lime)', letterSpacing: '-0.02em' }}>
            {hotSeatPlayerName}
          </p>
        </div>
        <div className={`timer ${timeLeft <= 10 ? 'urgent' : ''}`}>{timeLeft}</div>
      </div>

      <textarea
        className="textarea"
        value={question}
        onChange={e => setQuestion(e.target.value)}
        placeholder={`Ask ${hotSeatPlayerName} something they won't want to answer…`}
        maxLength={200}
        rows={3}
        autoFocus
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{question.length}/200</span>
        <button
          className="btn btn-primary"
          style={{ width: 'auto', height: 42, padding: '0 20px', fontSize: 14 }}
          onClick={handleSubmit}
          disabled={!question.trim()}
        >
          Submit
        </button>
      </div>
    </div>
  );
};
