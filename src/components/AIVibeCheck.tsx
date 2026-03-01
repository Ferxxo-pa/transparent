import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/config';

interface Props {
  groupSize: number;
  onQuestionsGenerated: (questions: string[]) => void;
  onSkip: () => void;
}

const VIBES = [
  { label: 'College friends', emoji: '🎓', value: 'college friends who know everything about each other' },
  { label: 'Coworkers', emoji: '💼', value: 'coworkers letting loose after work' },
  { label: 'Couples night', emoji: '💕', value: 'couples who want chaos' },
  { label: 'New friends', emoji: '🤝', value: 'people who just met and want to go deep fast' },
  { label: 'Family', emoji: '👨‍👩‍👧‍👦', value: 'family members who can handle the truth' },
  { label: 'Chaos mode', emoji: '🔥', value: 'degens who have zero boundaries' },
];

const SPICE_LEVELS = [
  { label: 'Mild', emoji: '🌶️', value: 'mild — embarrassing but nothing too wild' },
  { label: 'Spicy', emoji: '🌶️🌶️', value: 'spicy — uncomfortable truths, relationship drama, secrets' },
  { label: 'No limits', emoji: '🌶️🌶️🌶️', value: 'absolutely no limits — the most unhinged questions possible' },
];

export const AIVibeCheck: React.FC<Props> = ({ groupSize, onQuestionsGenerated, onSkip }) => {
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
  const [selectedSpice, setSelectedSpice] = useState<string | null>(null);
  const [customContext, setCustomContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!selectedVibe || !selectedSpice) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          groupSize,
          vibe: selectedVibe,
          spiceLevel: selectedSpice,
          context: customContext.trim() || undefined,
          count: 25,
        }),
      });

      const data = await res.json();

      if (data.questions && data.questions.length > 0) {
        onQuestionsGenerated(data.questions);
      } else {
        setError('AI couldn\'t generate questions. Using default bank instead.');
        setTimeout(onSkip, 2000);
      }
    } catch (err) {
      setError('Connection failed. Using default questions.');
      setTimeout(onSkip, 2000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '24px 20px' }}>
      <div style={{ textAlign: 'center' }}>
        <span style={{ fontSize: 28, display: 'block', marginBottom: 8 }}>🤖</span>
        <p style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em' }}>AI Question Generator</p>
        <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
          Tell us the vibe. We'll generate questions that hit different.
        </p>
      </div>

      {/* Vibe selection */}
      <div>
        <p className="label-sm" style={{ marginBottom: 8 }}>What's the group dynamic?</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {VIBES.map(v => (
            <button
              key={v.value}
              onClick={() => setSelectedVibe(v.value)}
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--r-sm)',
                border: `1.5px solid ${selectedVibe === v.value ? 'var(--lime-border)' : 'var(--border)'}`,
                background: selectedVibe === v.value ? 'var(--lime-bg)' : 'var(--glass)',
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
                color: selectedVibe === v.value ? 'var(--lime)' : 'var(--text)',
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
              key={s.value}
              onClick={() => setSelectedSpice(s.value)}
              style={{
                flex: 1,
                padding: '10px 8px',
                borderRadius: 'var(--r-sm)',
                border: `1.5px solid ${selectedSpice === s.value ? 'var(--lime-border)' : 'var(--border)'}`,
                background: selectedSpice === s.value ? 'var(--lime-bg)' : 'var(--glass)',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 14, display: 'block', marginBottom: 2 }}>{s.emoji}</span>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: selectedSpice === s.value ? 'var(--lime)' : 'var(--text)',
              }}>{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Optional context */}
      <div>
        <p className="label-sm" style={{ marginBottom: 6 }}>Anything else? <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></p>
        <input
          type="text"
          value={customContext}
          onChange={e => setCustomContext(e.target.value)}
          placeholder='e.g. "We all went to Texas Tech, nothing is off limits"'
          maxLength={200}
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--border)',
            background: 'var(--glass)',
            color: 'var(--text)',
            fontSize: 13,
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
      </div>

      {error && (
        <p style={{ fontSize: 12, color: '#ff5252', textAlign: 'center' }}>{error}</p>
      )}

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
          disabled={!selectedVibe || !selectedSpice || loading}
          whileTap={{ scale: 0.96 }}
          className="btn btn-primary"
          style={{
            flex: 2,
            height: 44,
            fontSize: 13,
            opacity: (!selectedVibe || !selectedSpice || loading) ? 0.5 : 1,
          }}
        >
          {loading ? '✨ Generating...' : '✨ Generate Questions'}
        </motion.button>
      </div>
    </div>
  );
};
