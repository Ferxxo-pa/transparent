import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { useSolPrice } from '../hooks/useSolPrice';
import { QuestionMode, PayoutMode } from '../types/game';
import { Blobs, BackButton, SolMark, WalletChip, parseAmt, usdEstimate } from '../components';

/* ── Mode definitions ────────────────────────────────────── */

const MODES: { id: QuestionMode; label: string; sub: string; emoji: string }[] = [
  { id: 'classic',     label: 'classic',     sub: 'crazy questions. lie or truth. get caught, lose it all.',     emoji: '🤥' },
  { id: 'hot-take',    label: 'hot take',    sub: 'they write it. they pay to force it. you can\'t say no.',  emoji: '🌶️' },
  { id: 'storyteller', label: 'storyteller', sub: 'tell a story so wild nobody knows if it\'s real.',         emoji: '🎭' },
  { id: 'custom',      label: 'custom',      sub: 'inside jokes, wild takes, anything goes.',                 emoji: '🛠️' },
];

/* ── Presets ─────────────────────────────────────────────── */

const BUY_IN_PRESETS = ['0', '0.05', '0.1', '0.25', '0.5'];
const ROUND_PRESETS = [3, 5, 7, 10];

/* ── CreateGamePage ──────────────────────────────────────── */

export const CreateGamePage: React.FC = () => {
  const navigate = useNavigate();
  const { createGame, loading, error } = useGame();
  const { connected, login } = usePrivyWallet();
  const solPrice = useSolPrice();

  const [mode, setMode]               = useState<QuestionMode>('classic');
  const [buyInRaw, setBuyInRaw]        = useState('0.1');
  const [activePreset, setActivePreset] = useState('0.1');
  const [rounds, setRounds]            = useState(5);
  const [customRounds, setCustomRounds] = useState('');

  const buyInNum = parseAmt(buyInRaw);
  const usdEst = usdEstimate(buyInNum, 'sol', solPrice);
  const customValue = activePreset !== buyInRaw ? buyInRaw : '';

  const handleCreate = async () => {
    // If not connected, trigger wallet connection first
    if (!connected) {
      login();
      return;
    }

    const ok = await createGame(
      buyInNum,
      'Game Room',
      mode,
      undefined,
      undefined,
      'split-pot' as PayoutMode,
      rounds,
    );
    if (ok) navigate('/waiting');
  };

  return (
    <div style={{ width: '100%', minHeight: '100dvh', position: 'relative' }}>

      {/* Background */}
      <Blobs palette="create" />

      {/* Content */}
      <div
        className="page page--form scroll-no-bar"
        style={{
          position: 'relative',
          zIndex: 1,
          overflowY: 'auto',
        }}
      >

        {/* ── Header: back LEFT, wallet RIGHT ─────────────────── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          flexShrink: 0,
        }}>
          <BackButton onClick={() => navigate('/')} />
          <WalletChip />
        </div>

        {/* ── Title ───────────────────────────────────────────── */}
        <h2 className="display" style={{ fontSize: 36, marginTop: 20, marginBottom: 14, lineHeight: 1, width: '100%' }}>
          set the <span className="italic-serif" style={{ fontWeight: 400, color: 'var(--pink)' }}>vibe.</span>
        </h2>

        {/* ── Mode grid (2x2) ─────────────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          width: '100%',
        }}>
          {MODES.map(m => {
            const isActive = mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className="glass"
                style={{
                  padding: '16px 14px',
                  borderRadius: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  cursor: 'pointer',
                  textAlign: 'left',
                  border: isActive ? '1px solid rgba(196,255,60,0.5)' : '1px solid var(--glass-stroke)',
                  background: isActive ? 'rgba(196,255,60,0.12)' : 'var(--glass-bg)',
                  color: 'var(--ink)',
                  fontFamily: 'inherit',
                  transition: 'all 0.25s',
                }}
              >
                <span style={{ fontSize: 26, lineHeight: 1, marginBottom: 6 }}>{m.emoji}</span>
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    textTransform: 'uppercase',
                    color: isActive ? 'var(--acid)' : 'var(--ink)',
                    transition: 'color 0.15s',
                  }}
                >
                  {m.label}
                </span>
                <span style={{
                  fontSize: 10,
                  color: 'var(--ink-faint)',
                  marginTop: 2,
                  fontWeight: 500,
                }}>
                  {m.sub}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Buy-in card ─────────────────────────────────────── */}
        <div
          className="glass"
          style={{ padding: 14, borderRadius: 20, marginTop: 14, width: '100%' }}
        >
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span
              className="mono"
              style={{
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--ink-faint)',
              }}
            >
              buy-in
            </span>
            <span className="money" style={{ fontSize: 22, color: 'var(--acid)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <SolMark size={16} tone="ink" />
              {' '}{buyInNum > 0 ? buyInRaw : '0'}
              {usdEst && (
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)', fontWeight: 600 }}>{usdEst}</span>
              )}
            </span>
          </div>

          {/* Preset row */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {BUY_IN_PRESETS.map(p => {
              const isActive = activePreset === p && buyInRaw === p;
              return (
                <button
                  key={p}
                  onClick={() => { setBuyInRaw(p); setActivePreset(p); }}
                  className="mono"
                  style={{
                    flex: 1,
                    padding: '6px 0',
                    borderRadius: 100,
                    border: `1px solid ${isActive ? 'var(--acid)' : 'rgba(255,255,255,0.10)'}`,
                    background: isActive ? 'var(--acid)' : 'rgba(255,255,255,0.04)',
                    color: isActive ? '#0A0810' : 'var(--ink-soft)',
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {p === '0' ? 'FREE' : p}
                </button>
              );
            })}
            {/* Custom input */}
            <input
              type="text"
              inputMode="decimal"
              value={activePreset === buyInRaw ? '' : buyInRaw}
              onChange={e => {
                setBuyInRaw(e.target.value);
                setActivePreset('');
              }}
              placeholder="custom"
              style={{
                flex: 0.8,
                padding: '6px 4px',
                borderRadius: 100,
                border: `1px solid ${customValue ? 'rgba(196,255,60,0.5)' : 'rgba(255,255,255,0.10)'}`,
                background: 'rgba(255,255,255,0.04)',
                color: customValue ? 'var(--acid)' : 'var(--ink-soft)',
                fontSize: 10,
                fontWeight: 700,
                textAlign: 'center',
                outline: 'none',
                fontFamily: "'JetBrains Mono', monospace",
                transition: 'all 0.2s',
              }}
            />
          </div>
        </div>

        {/* ── Rounds card ─────────────────────────────────────── */}
        <div
          className="glass"
          style={{ padding: 12, borderRadius: 18, marginTop: 10, width: '100%' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span
              className="mono"
              style={{
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--ink-faint)',
              }}
            >
              rounds
            </span>
            <span className="money" style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
              {rounds}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {ROUND_PRESETS.map(n => {
              const isActive = rounds === n && !customRounds;
              return (
                <button
                  key={n}
                  onClick={() => { setRounds(n); setCustomRounds(''); }}
                  style={{
                    flex: 1,
                    padding: '6px 0',
                    borderRadius: 100,
                    border: `1px solid ${isActive ? 'var(--ink)' : 'rgba(255,255,255,0.10)'}`,
                    background: isActive ? 'var(--ink)' : 'rgba(255,255,255,0.04)',
                    color: isActive ? '#0A0810' : 'var(--ink-soft)',
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {n}
                </button>
              );
            })}
            <input
              type="text"
              inputMode="numeric"
              value={customRounds}
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 2);
                setCustomRounds(val);
                const v = parseInt(val);
                if (v > 0) setRounds(v);
              }}
              placeholder="custom"
              style={{
                flex: 0.8,
                padding: '6px 4px',
                borderRadius: 100,
                border: `1px solid ${customRounds ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.10)'}`,
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--ink)',
                fontSize: 10,
                fontWeight: 700,
                textAlign: 'center',
                outline: 'none',
                fontFamily: "'JetBrains Mono', monospace",
                transition: 'all 0.2s',
              }}
            />
          </div>
        </div>

        {/* ── Error ───────────────────────────────────────────── */}
        {error && (
          <div
            style={{
              background: 'rgba(255,92,92,0.10)',
              border: '1px solid rgba(255,92,92,0.28)',
              borderRadius: 16,
              padding: '12px 14px',
              color: '#FF5C5C',
              fontSize: 13,
              marginTop: 10,
              width: '100%',
            }}
          >
            {error}
          </div>
        )}

        {/* ── CTA ─────────────────────────────────────────────── */}
        <div style={{ marginTop: 'auto', paddingTop: 16, paddingBottom: 24, width: '100%' }}>
          <button
            className="btn btn-degen"
            onClick={handleCreate}
            disabled={loading}
            style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            {loading ? 'creating...' : !connected ? (
              'connect wallet to create'
            ) : (
              <>
                spin it up · <SolMark size={14} tone="dark" />
                {' '}{buyInNum > 0 ? buyInRaw : 'FREE'}
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
