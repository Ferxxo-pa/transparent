import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../contexts/GameContext';
import { useSolPrice } from '../hooks/useSolPrice';
import { QuestionMode, PayoutMode } from '../types/game';
import { Blobs, BackButton, TokenMark, UsdTag, TOKENS, TOKEN_LIST, parseAmt, usdEstimate } from '../components';

/* ── Mode definitions ────────────────────────────────────── */

const MODES: { id: QuestionMode; label: string; sub: string; emoji: string }[] = [
  { id: 'classic',     label: 'classic',     sub: 'curated questions from the vault',          emoji: '🤥' },
  { id: 'hot-take',    label: 'hot take',    sub: "y'all write the questions. nobody is safe.", emoji: '🌶️' },
  { id: 'storyteller', label: 'storyteller', sub: 'tell a story — truth or fake? group votes.', emoji: '🎭' },
  { id: 'custom',      label: 'custom',      sub: 'you write every question before it starts.', emoji: '🛠️' },
];

/* ── How-it-works blurbs per mode ────────────────────────── */

const HOW_IT_WORKS: Record<string, string> = {
  classic:     'one player sits in the hot seat. they answer a prompt. the rest of the table votes: cap or no cap.',
  'hot-take':  'everyone submits a spicy question. the best one gets picked. the target answers. table votes.',
  storyteller: 'the storyteller tells a tale. is it real or made up? sell it hard. table calls it.',
  custom:      'the host writes all prompts before the game starts. full control, your rules.',
};

/* ── Token chips (icon-only) ─────────────────────────────── */

const TOKEN_CHIPS = ['sol', 'bonk', 'wif', 'popcat', 'pengu'];

/* ── Presets for SOL (default) ───────────────────────────── */

const SOL_PRESETS = ['0', '0.05', '0.1', '0.25', '0.5'];
const ROUND_PRESETS = [3, 5, 7, 10];

/* ── CreateGamePage ──────────────────────────────────────── */

export const CreateGamePage: React.FC = () => {
  const navigate = useNavigate();
  const { createGame, loading, error } = useGame();
  const solPrice = useSolPrice();

  const [mode, setMode]               = useState<QuestionMode>('classic');
  const [selectedToken, setToken]      = useState('sol');
  const [buyInRaw, setBuyInRaw]        = useState('0.1');
  const [activePreset, setActivePreset] = useState('0.1');
  const [rounds, setRounds]            = useState(5);
  const [customRounds, setCustomRounds] = useState('');
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  const buyInNum = parseAmt(buyInRaw);
  const token = TOKENS[selectedToken] || TOKENS.sol;
  const presets = selectedToken === 'sol' ? SOL_PRESETS : token.presets.map(String);
  const usdEst = usdEstimate(buyInNum, selectedToken, solPrice);
  const customValue = activePreset !== buyInRaw ? buyInRaw : '';

  const handleCreate = async () => {
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
          gap: 18,
        }}
      >

        {/* ── Header ──────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <BackButton onClick={() => navigate('/')} />
          <div className="chip">new room</div>
        </div>

        {/* ── Title ───────────────────────────────────────────── */}
        <div style={{ marginBottom: 4 }}>
          <span className="display" style={{ fontSize: 36, lineHeight: 1.05, color: 'var(--ink)' }}>
            set the{' '}
          </span>
          <span className="italic-serif" style={{ fontSize: 36, color: 'var(--pink)' }}>
            vibe.
          </span>
        </div>

        {/* ── Mode grid (2x2) ─────────────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          marginBottom: 8,
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
                  transition: 'all 0.15s',
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

        {/* ── How it works toggle ─────────────────────────────── */}
        <button
          onClick={() => setShowHowItWorks(!showHowItWorks)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px 4px 10px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--ink-soft)',
            }}
          >
            {showHowItWorks ? '− hide' : '+ how it works'}
            <span style={{ color: 'var(--acid)' }}>· {MODES.find(m => m.id === mode)?.label}</span>
          </span>
        </button>

        {showHowItWorks && (
          <div
            className="glass-flat"
            style={{
              padding: '14px 16px',
              fontSize: 12,
              color: 'var(--ink-soft)',
              lineHeight: 1.5,
              borderRadius: 14,
              marginBottom: 12,
              fontWeight: 500,
            }}
          >
            {HOW_IT_WORKS[mode]}
          </div>
        )}

        {/* ── Buy-in card ─────────────────────────────────────── */}
        <div
          className="glass"
          style={{ padding: 14, borderRadius: 20 }}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="money" style={{ fontSize: 22, color: 'var(--acid)' }}>
                <TokenMark token={selectedToken} size={16} />
                {' '}{buyInNum > 0 ? buyInRaw : 'free'}
              </span>
              {buyInNum > 0 && usdEst && (
                <UsdTag amount={buyInNum} token={selectedToken} />
              )}
            </div>
          </div>

          {/* Token row */}
          <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
            {TOKEN_CHIPS.map(tid => {
              const isActive = selectedToken === tid;
              return (
                <button
                  key={tid}
                  onClick={() => {
                    setToken(tid);
                    // Reset to first preset of new token
                    const newPresets = tid === 'sol' ? SOL_PRESETS : (TOKENS[tid]?.presets.map(String) || ['0']);
                    setBuyInRaw(newPresets[1] || newPresets[0]);
                    setActivePreset(newPresets[1] || newPresets[0]);
                  }}
                  style={{
                    flex: 1,
                    height: 30,
                    borderRadius: 10,
                    border: isActive ? '1px solid rgba(196,255,60,0.5)' : '1px solid rgba(255,255,255,0.08)',
                    background: isActive ? 'rgba(196,255,60,0.14)' : 'rgba(255,255,255,0.03)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    flexShrink: 0,
                  }}
                >
                  <TokenMark token={tid} size={20} />
                </button>
              );
            })}
          </div>

          {/* Preset row */}
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            {presets.map(p => {
              const isActive = activePreset === p && buyInRaw === p;
              return (
                <button
                  key={p}
                  onClick={() => { setBuyInRaw(p); setActivePreset(p); }}
                  style={{
                    flex: 1,
                    padding: '9px 0',
                    borderRadius: 100,
                    border: isActive ? 'none' : '1px solid rgba(255,255,255,0.10)',
                    background: isActive ? 'var(--acid)' : 'rgba(255,255,255,0.04)',
                    color: isActive ? '#0A0810' : 'var(--ink-soft)',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {p === '0' ? 'free' : p}
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
                flex: 1.3,
                padding: '9px 8px',
                borderRadius: 100,
                border: `1px solid ${customValue ? 'rgba(196,255,60,0.5)' : 'rgba(255,255,255,0.10)'}`,
                background: 'rgba(255,255,255,0.04)',
                color: customValue ? 'var(--acid)' : 'var(--ink-soft)',
                fontSize: 12,
                fontWeight: 600,
                textAlign: 'center',
                outline: 'none',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            />
          </div>
        </div>

        {/* ── Rounds card ─────────────────────────────────────── */}
        <div
          className="glass"
          style={{ padding: 12, borderRadius: 18, marginBottom: 14 }}
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
                flex: 1.2,
                padding: '6px 8px',
                borderRadius: 100,
                border: `1px solid ${customRounds ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.10)'}`,
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--ink)',
                fontSize: 10,
                fontWeight: 600,
                textAlign: 'center',
                outline: 'none',
                fontFamily: "'JetBrains Mono', monospace",
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
              color: 'var(--coral)',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* ── CTA ─────────────────────────────────────────────── */}
        <div style={{ marginTop: 'auto', paddingTop: 8 }}>
          <button
            className="btn btn-degen"
            onClick={handleCreate}
            disabled={loading}
            style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            {loading ? 'creating...' : (
              <>
                spin it up · <TokenMark token={selectedToken} size={14} />
                {' '}{buyInNum > 0 ? buyInRaw : 'free'}
                {usdEst ? ` (${usdEst})` : ''}
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
