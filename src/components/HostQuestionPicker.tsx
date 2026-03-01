import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';

interface Props {
  questions: string[];
  usedIndices: number[];
  hotSeatPlayerName: string;
  onPick: (question: string, index: number) => void;
  onSendToVote: (questions: string[], indices: number[]) => void;
}

export const HostQuestionPicker: React.FC<Props> = ({ questions, usedIndices, hotSeatPlayerName, onPick, onSendToVote }) => {
  const [search, setSearch] = useState('');
  const [customQ, setCustomQ] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [mode, setMode] = useState<'pick' | 'vote'>('pick'); // pick = host decides, vote = players vote

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

  const toggleSelect = (idx: number) => {
    if (selected.includes(idx)) {
      setSelected(selected.filter(i => i !== idx));
    } else if (selected.length < 3) {
      setSelected([...selected, idx]);
    }
  };

  const handleSendToVote = () => {
    if (selected.length < 2) return;
    const qs = selected.map(i => questions[i]);
    onSendToVote(qs, selected);
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

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 6, background: 'var(--card-2)', padding: 4, borderRadius: 'var(--r-sm)' }}>
        <button
          onClick={() => { setMode('pick'); setSelected([]); }}
          style={{
            flex: 1, padding: '8px 0', borderRadius: 'var(--r-sm)', border: 'none',
            background: mode === 'pick' ? 'var(--lime)' : 'transparent',
            color: mode === 'pick' ? '#000' : 'var(--muted)',
            fontWeight: 600, fontSize: 12, cursor: 'pointer',
          }}
        >
          I'll Pick
        </button>
        <button
          onClick={() => { setMode('vote'); setSelected([]); }}
          style={{
            flex: 1, padding: '8px 0', borderRadius: 'var(--r-sm)', border: 'none',
            background: mode === 'vote' ? 'var(--lime)' : 'transparent',
            color: mode === 'vote' ? '#000' : 'var(--muted)',
            fontWeight: 600, fontSize: 12, cursor: 'pointer',
          }}
        >
          Let Players Vote
        </button>
      </div>

      {mode === 'vote' && selected.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
          Selected {selected.length}/3 — {selected.length < 2 ? 'pick at least 2' : 'ready to send!'}
        </div>
      )}

      {/* Custom question input (pick mode only) */}
      {mode === 'pick' && (
        <>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>or pick from the list</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
        </>
      )}

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
        {filtered.slice(0, 30).map(({ q, i }) => {
          const isSelected = selected.includes(i);
          return (
            <motion.button
              key={i}
              onClick={() => mode === 'pick' ? onPick(q, i) : toggleSelect(i)}
              whileTap={{ scale: 0.97 }}
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 'var(--r-sm)',
                border: `1.5px solid ${isSelected ? 'var(--lime-border)' : 'var(--border)'}`,
                background: isSelected ? 'var(--lime-bg)' : 'var(--glass)',
                cursor: 'pointer',
                transition: 'all 0.15s',
                width: '100%',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                {mode === 'vote' && (
                  <span style={{ 
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                    border: `2px solid ${isSelected ? 'var(--lime)' : 'var(--border-2)'}`,
                    background: isSelected ? 'var(--lime)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, color: '#000', fontWeight: 700,
                  }}>
                    {isSelected ? '✓' : ''}
                  </span>
                )}
                <p style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500, lineHeight: 1.4 }}>
                  "{q}"
                </p>
              </div>
            </motion.button>
          );
        })}
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

      {/* Send to vote button */}
      {mode === 'vote' && selected.length >= 2 && (
        <button
          className="btn btn-primary"
          onClick={handleSendToVote}
          style={{ width: '100%' }}
        >
          🗳️ Send {selected.length} Questions to Player Vote
        </button>
      )}
    </div>
  );
};
