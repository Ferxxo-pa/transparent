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
        className="scroll-no-bar"
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 480,
          margin: '0 auto',
          minHeight: '100dvh',
          padding: '20px 20px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          overflowY: 'auto',
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
          gap: 10,
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
                  border: isActive ? '1px solid var(--acid)' : '1px solid var(--glass-stroke)',
                  background: isActive ? 'rgba(196,255,60,0.06)' : 'var(--glass-bg)',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 28, lineHeight: 1 }}>{m.emoji}</span>
                <span
                  className="mono"
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: isActive ? 'var(--acid)' : 'var(--ink-soft)',
                    transition: 'color 0.15s',
                  }}
                >
                  {m.label}
                </span>
                <span style={{
                  fontSize: 11,
                  color: 'var(--ink-faint)',
                  lineHeight: 1.35,
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
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--ink-soft)',
            }}
          >
            + how it works
          </span>
        </button>

        {showHowItWorks && (
          <div
            className="glass-flat"
            style={{
              padding: '14px 16px',
              fontSize: 13,
              color: 'var(--ink-soft)',
              lineHeight: 1.55,
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span
              className="mono"
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink-faint)',
              }}
            >
              buy-in
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="money" style={{ fontSize: 18, color: 'var(--acid)' }}>
                <TokenMark token={selectedToken} size={16} />
                {' '}{buyInNum > 0 ? buyInRaw : 'free'}
              </span>
              {buyInNum > 0 && usdEst && (
                <UsdTag amount={buyInNum} token={selectedToken} />
              )}
            </div>
          </div>

          {/* Token row */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
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
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    border: isActive ? '1px solid var(--acid)' : '1px solid var(--glass-stroke)',
                    background: isActive ? 'rgba(196,255,60,0.08)' : 'var(--glass-bg)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s',
                    flexShrink: 0,
                  }}
                >
                  <TokenMark token={tid} size={20} />
                </button>
              );
            })}
          </div>

          {/* Preset row */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {presets.map(p => {
              const isActive = activePreset === p && buyInRaw === p;
              return (
                <button
                  key={p}
                  onClick={() => { setBuyInRaw(p); setActivePreset(p); }}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: 100,
                    border: 'none',
                    background: isActive ? 'var(--acid)' : 'var(--glass-bg)',
                    color: isActive ? '#0A0810' : 'var(--ink-soft)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
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
                width: 64,
                padding: '8px 8px',
                borderRadius: 100,
                border: '1px solid var(--glass-stroke)',
                background: 'var(--glass-bg)',
                color: 'var(--ink)',
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
          style={{ padding: '12px 14px', borderRadius: 20 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span
              className="mono"
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink-faint)',
              }}
            >
              rounds
            </span>
            <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
              {rounds}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {ROUND_PRESETS.map(n => {
              const isActive = rounds === n && !customRounds;
              return (
                <button
                  key={n}
                  onClick={() => { setRounds(n); setCustomRounds(''); }}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: 100,
                    border: 'none',
                    background: isActive ? 'var(--acid)' : 'var(--glass-bg)',
                    color: isActive ? '#0A0810' : 'var(--ink-soft)',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {n}
                </button>
              );
            })}
            <input
              type="number"
              min="1"
              max="30"
              value={customRounds}
              onChange={e => {
                setCustomRounds(e.target.value);
                const v = parseInt(e.target.value);
                if (v > 0) setRounds(v);
              }}
              placeholder="custom"
              style={{
                width: 64,
                padding: '8px 8px',
                borderRadius: 100,
                border: '1px solid var(--glass-stroke)',
                background: 'var(--glass-bg)',
                color: 'var(--ink)',
                fontSize: 12,
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
            style={{ width: '100%' }}
          >
            {loading ? 'creating...' : (
              <>
                spin it up · <TokenMark token={selectedToken} size={16} />
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
