import React, { useState } from 'react';
import { motion } from 'framer-motion';
import aiQuestionBank from '../data/ai-questions.json';

interface Props {
  groupSize: number;
  onQuestionsGenerated: (questions: string[]) => void;
  onSkip: () => void;
}

const VIBES = [
  { label: 'College friends', emoji: '🎓', key: 'college' },
  { label: 'Coworkers', emoji: '💼', key: 'coworkers' },
  { label: 'Couples night', emoji: '💕', key: 'couples' },
  { label: 'New friends', emoji: '🤝', key: 'new_friends' },
  { label: 'Family', emoji: '👨‍👩‍👧‍👦', key: 'family' },
  { label: 'Chaos mode', emoji: '🔥', key: 'chaos' },
];

const SPICE_LEVELS = [
  { label: 'Mild', emoji: '🌶️', filter: 0.5 },
  { label: 'Spicy', emoji: '🌶️🌶️', filter: 0.75 },
  { label: 'No limits', emoji: '🌶️🌶️🌶️', filter: 1.0 },
];

// Shuffle array (Fisher-Yates)
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const AIVibeCheck: React.FC<Props> = ({ groupSize, onQuestionsGenerated, onSkip }) => {
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
  const [selectedSpice, setSelectedSpice] = useState<number | null>(null);

  const generate = () => {
    if (!selectedVibe || selectedSpice === null) return;

    const bank = (aiQuestionBank as Record<string, string[]>)[selectedVibe] || [];
    // Take a portion based on spice level and shuffle
    const count = Math.ceil(bank.length * selectedSpice);
    const questions = shuffle(bank).slice(0, Math.max(count, 15));

    if (questions.length > 0) {
      onQuestionsGenerated(questions);
    } else {
      onSkip();
    }
  };

  return (
    <div className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '24px 20px' }}>
      <div style={{ textAlign: 'center' }}>
        <span style={{ fontSize: 28, display: 'block', marginBottom: 8 }}>🤖</span>
        <p style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em' }}>AI Question Bank</p>
        <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
          Pick your group vibe. We'll pull questions that hit different.
        </p>
      </div>

      {/* Vibe selection */}
      <div>
        <p className="label-sm" style={{ marginBottom: 8 }}>What's the group dynamic?</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {VIBES.map(v => (
            <button
              key={v.key}
              onClick={() => setSelectedVibe(v.key)}
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--r-sm)',
                border: `1.5px solid ${selectedVibe === v.key ? 'var(--lime-border)' : 'var(--border)'}`,
                background: selectedVibe === v.key ? 'var(--lime-bg)' : 'var(--glass)',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 16 }}>{v.emoji}</span>
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                color: selectedVibe === v.key ? 'var(--lime)' : 'var(--text)',
              }}>{v.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Spice level */}
      <div>
        <p className="label-sm" style={{ marginBottom: 8 }}>Spice level?</p>
        <div style={{ display: 'flex', gap: 6 }}>
          {SPICE_LEVELS.map(s => (
            <button
              key={s.label}
              onClick={() => setSelectedSpice(s.filter)}
              style={{
                flex: 1,
                padding: '10px 8px',
                borderRadius: 'var(--r-sm)',
                border: `1.5px solid ${selectedSpice === s.filter ? 'var(--lime-border)' : 'var(--border)'}`,
                background: selectedSpice === s.filter ? 'var(--lime-bg)' : 'var(--glass)',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 14, display: 'block', marginBottom: 2 }}>{s.emoji}</span>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: selectedSpice === s.filter ? 'var(--lime)' : 'var(--text)',
              }}>{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onSkip}
          style={{
            flex: 1,
            height: 44,
            borderRadius: 'var(--r-pill)',
            background: 'var(--glass)',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Skip
        </button>
        <motion.button
          onClick={generate}
          disabled={!selectedVibe || selectedSpice === null}
          whileTap={{ scale: 0.96 }}
          className="btn btn-primary"
          style={{
            flex: 2,
            height: 44,
            fontSize: 13,
            opacity: (!selectedVibe || selectedSpice === null) ? 0.5 : 1,
          }}
        >
          🎲 Generate Questions
        </motion.button>
      </div>
    </div>
  );
};
