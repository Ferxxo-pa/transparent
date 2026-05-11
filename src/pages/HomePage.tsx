import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Blobs, SolMark, WalletChip } from '../components';

/* ── Game modes ──────────────────────────────────────────── */

interface GameMode {
  key: string;
  emoji: string;
  tag: string;
  tagAlt: string;
  accent: string;
  glowVar: string;
  palette: string;
  title: string;
  hook: string;
  sub: string;
}

const MODES: GameMode[] = [
  {
    key: 'classic',
    emoji: '🤥',
    tag: 'classic',
    tagAlt: 'OG mode',
    accent: 'var(--acid)',
    glowVar: 'var(--acid-glow)',
    palette: 'home',
    title: 'hot seat.',
    hook: 'no cap.',
    sub: 'get hit with a wild question. lie your way out or keep it real. the table decides.',
  },
  {
    key: 'hottake',
    emoji: '🌶️',
    tag: 'hot take',
    tagAlt: 'crowd-sourced',
    accent: 'var(--pink)',
    glowVar: 'var(--pink-glow)',
    palette: 'story',
    title: 'they choose.',
    hook: 'you suffer.',
    sub: 'your group writes the questions. drop money on one to make sure they have to answer it.',
  },
  {
    key: 'story',
    emoji: '🎭',
    tag: 'storyteller',
    tagAlt: 'cap detector',
    accent: 'var(--tangerine)',
    glowVar: 'var(--tangerine-glow)',
    palette: 'create',
    title: 'sell the story.',
    hook: 'facts or cap?',
    sub: 'drop a wild story. real or totally fake — sell it good enough and nobody will know.',
  },
  {
    key: 'custom',
    emoji: '🛠️',
    tag: 'custom',
    tagAlt: 'DIY',
    accent: 'var(--azure)',
    glowVar: 'var(--azure-glow)',
    palette: 'join',
    title: 'your game.',
    hook: 'your rules.',
    sub: 'everyone throws in questions before it starts. whatever your group wants to play.',
  },
];

/* ── Fake live players ───────────────────────────────────── */

const FAKE_PLAYERS = [
  { emoji: '🐸', name: 'capdetector', amt: '+1.42', positive: true },
  { emoji: '🎩', name: 'soljester', amt: '+0.84', positive: true },
  { emoji: '🦊', name: 'rugged.sol', amt: '-0.62', positive: false },
  { emoji: '🐧', name: 'pengu_lord', amt: '+0.18', positive: true },
  { emoji: '🐶', name: 'wifhat', amt: '-0.40', positive: false },
];

/* ── HomePage ────────────────────────────────────────────── */

export const HomePage: React.FC = () => {
  const navigate = useNavigate();

  /* Mode cycling */
  const [modeIdx, setModeIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setModeIdx(prev => (prev + 1) % MODES.length);
        setVisible(true);
      }, 380);
    }, 3500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const jumpTo = (i: number) => {
    if (i === modeIdx) return;
    setVisible(false);
    setTimeout(() => { setModeIdx(i); setVisible(true); }, 380);
  };

  const mode = MODES[modeIdx];

  const fadeStyle = {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(6px)',
    transition: 'opacity 380ms cubic-bezier(0.4, 0, 0.2, 1), transform 380ms cubic-bezier(0.4, 0, 0.2, 1)',
    willChange: 'opacity, transform' as const,
  };

  return (
    <div style={{ width: '100%', minHeight: '100dvh', position: 'relative' }}>

      {/* ── Blob background ─────────────────────────────────── */}
      <Blobs palette={mode.palette as any} />

      {/* ── Scrollable content ──────────────────────────────── */}
      <div
        className="page page--home scroll-no-bar"
        style={{
          position: 'relative',
          zIndex: 1,
          overflowY: 'auto',
        }}
      >

        {/* ── Top bar: logo LEFT, wallet RIGHT ────────────────── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          flexShrink: 0,
        }}>
          {/* Wordmark */}
          <span style={{
            fontWeight: 800,
            letterSpacing: '-0.02em',
            fontSize: 17,
            color: 'var(--ink)',
          }}>
            transparent
          </span>

          {/* Wallet chip */}
          <WalletChip />
        </div>

        {/* ── Hero card ──────────────────────────────────────── */}
        <div
          className="glass glass-strong"
          style={{
            borderRadius: 32,
            padding: '28px 26px',
            overflow: 'hidden',
            position: 'relative',
            marginTop: 24,
            width: '100%',
          }}
        >
          {/* Sticker row + emoji */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, minHeight: 36 }}>
            <div style={fadeStyle}>
              <div style={{ display: 'flex', gap: 6 }}>
                <span className="sticker sticker-acid">{mode.tag}</span>
                <span className="sticker sticker-pink" style={{ transform: 'rotate(2deg)' }}>{mode.tagAlt}</span>
              </div>
            </div>
            <div style={{ ...fadeStyle, fontSize: 36, lineHeight: 1, animation: visible ? 'glow 2.5s ease-in-out infinite' : 'none' }}>
              {mode.emoji}
            </div>
          </div>

          {/* Title + Hook */}
          <h1
            className="display"
            style={{
              fontSize: 44,
              lineHeight: 0.95,
              margin: 0,
              minHeight: 84,
              ...fadeStyle,
            }}
          >
            {mode.title}<br />
            <span
              className="italic-serif"
              style={{
                fontSize: 52,
                color: mode.accent,
                fontWeight: 400,
                transition: 'color 380ms ease',
              }}
            >
              {mode.hook}
            </span>
          </h1>

          {/* Sub-description */}
          <p style={{
            fontSize: 13,
            color: 'var(--ink-soft)',
            lineHeight: 1.4,
            margin: '18px 0 0',
            fontWeight: 500,
            minHeight: 18,
            ...fadeStyle,
          }}>
            {mode.sub}
          </p>

          {/* Mode dots — flat bars, clickable */}
          <div style={{ display: 'flex', gap: 6, marginTop: 18 }}>
            {MODES.map((m, i) => (
              <button
                key={m.key}
                onClick={() => jumpTo(i)}
                aria-label={m.key}
                style={{
                  flex: 1,
                  height: 3,
                  padding: 0,
                  background: i === modeIdx ? mode.accent : 'rgba(255,255,255,0.12)',
                  border: 'none',
                  borderRadius: 100,
                  cursor: 'pointer',
                  boxShadow: i === modeIdx ? `0 0 12px ${mode.accent}` : 'none',
                  transition: 'background 380ms ease, box-shadow 380ms ease',
                }}
              />
            ))}
          </div>
        </div>

        {/* ── Live players rail ──────────────────────────────── */}
        <div
          className="glass-flat"
          style={{
            padding: '14px 16px',
            borderRadius: 18,
            marginTop: 16,
            width: '100%',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--acid)',
                boxShadow: '0 0 8px var(--acid)',
                animation: 'pulseDot 1.4s ease-in-out infinite',
                flexShrink: 0,
                display: 'inline-block',
              }} />
              <span
                className="mono"
                style={{
                  fontSize: 9,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--ink)',
                }}
              >
                live · players online
              </span>
            </div>
            <span
              className="mono"
              style={{
                fontSize: 9,
                color: 'var(--ink-soft)',
                letterSpacing: '0.08em',
              }}
            >
              1,284
            </span>
          </div>

          {/* Player rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {FAKE_PLAYERS.map((p) => (
              <div
                key={p.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 12,
                  flexShrink: 0,
                }}>
                  {p.emoji}
                </div>
                <span
                  style={{
                    flex: 1,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {p.name}
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: p.positive ? '#5BE584' : '#FF5C5C',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <SolMark size={9} tone="ink" /> {p.amt}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── CTAs ───────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          marginTop: 'auto',
          paddingTop: 16,
          paddingBottom: 24,
          width: '100%',
        }}>
          <button
            className="btn btn-degen"
            onClick={() => navigate('/join')}
          >
            join a game →
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => navigate('/create')}
          >
            create a game
          </button>
        </div>

      </div>
    </div>
  );
};
