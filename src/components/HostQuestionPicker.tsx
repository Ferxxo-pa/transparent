import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';

interface Props {
  questions: string[];
  usedIndices: number[];
  hotSeatPlayerName: string;
  onPick: (question: string, index: number) => void;
}

export const HostQuestionPicker: React.FC<Props> = ({ questions, usedIndices, hotSeatPlayerName, onPick }) => {
  const [search, setSearch] = useState('');
  const [customQ, setCustomQ] = useState('');

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return questions
      .map((q, i) => ({ q, i, used: usedIndices.includes(i) }))
      .filter(({ q, used }) => !used && (!term || q.toLowerCase().includes(term)));
  }, [questions, usedIndices, search]);

  const handleCustom = () => {
    if (!customQ.trim()) return;
    onPick(customQ.trim(), -1);
  };

  return (
    <div className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div>
        <p className="label-sm" style={{ marginBottom: 2 }}>Pick a question for</p>
        <p style={{ fontWeight: 700, fontSize: 18, color: 'var(--lime)', letterSpacing: '-0.02em' }}>
          {hotSeatPlayerName}
        </p>
      </div>

      {/* Custom question input */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="input"
          value={customQ}
          onChange={e => setCustomQ(e.target.value)}
          placeholder="Or write your own question..."
          maxLength={200}
          style={{ flex: 1 }}
          onKeyDown={e => { if (e.key === 'Enter') handleCustom(); }}
        />
        <button
          className="btn btn-primary"
          onClick={handleCustom}
          disabled={!customQ.trim()}
          style={{ width: 'auto', height: 46, padding: '0 16px', fontSize: 13, flexShrink: 0 }}
        >
          Ask
        </button>
      </div>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>or pick from the list</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 'var(--r-sm)', background: 'var(--glass)', border: '1px solid var(--border)' }}>
        <Search size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search questions..."
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit' }}
        />
        <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>{filtered.length} left</span>
      </div>

      {/* Question list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
        {filtered.slice(0, 30).map(({ q, i }) => (
          <motion.button
            key={i}
            onClick={() => onPick(q, i)}
            whileTap={{ scale: 0.97 }}
            style={{
              textAlign: 'left',
              padding: '12px 14px',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border)',
              background: 'var(--glass)',
              cursor: 'pointer',
              transition: 'all 0.15s',
              width: '100%',
            }}
          >
            <p style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500, lineHeight: 1.4 }}>
              "{q}"
            </p>
          </motion.button>
        ))}
        {filtered.length > 30 && (
          <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', padding: 8 }}>
            {filtered.length - 30} more — use search to find specific questions
          </p>
        )}
        {filtered.length === 0 && (
          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)', padding: 20 }}>
            {search ? 'No matching questions' : 'All questions have been used!'}
          </p>
        )}
      </div>
    </div>
  );
};
