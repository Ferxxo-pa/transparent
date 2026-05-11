import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { Blobs, TokenMark } from '../components';
import { useWalletBalance } from '../hooks/useWalletBalance';
import { useSolPrice, solToUsd } from '../hooks/useSolPrice';

/* ── Game modes ──────────────────────────────────────────── */

interface GameMode {
  key: string;
  emoji: string;
  tag: string;
  tagAlt: string;
  accent: string;
  glowVar: string;
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
    title: 'sit in the hot seat.',
    hook: 'lie or die.',
    sub: 'classic. answer the prompt. table calls cap or no cap.',
  },
  {
    key: 'hottake',
    emoji: '🌶️',
    tag: 'hot take',
    tagAlt: 'crowd-sourced',
    accent: 'var(--pink)',
    glowVar: 'var(--pink-glow)',
    title: 'roast each other.',
    hook: 'no mercy.',
    sub: "hot take. y'all write the questions. nobody is safe.",
  },
  {
    key: 'story',
    emoji: '🎭',
    tag: 'storyteller',
    tagAlt: 'cap detector',
    accent: 'var(--tangerine)',
    glowVar: 'var(--tangerine-glow)',
    title: 'spin a wild story.',
    hook: 'cap or no cap?',
    sub: 'storyteller. true or made up — sell it. table calls it.',
  },
  {
    key: 'custom',
    emoji: '🛠️',
    tag: 'custom',
    tagAlt: "host's rules",
    accent: 'var(--azure)',
    glowVar: 'var(--azure-glow)',
    title: 'host writes the prompts.',
    hook: 'play your way.',
    sub: 'custom. you set the questions before the game starts.',
  },
];

/* ── Fake live players ───────────────────────────────────── */

const FAKE_PLAYERS = [
  { emoji: '😈', name: 'degen_kyle', sol: '+0.42', positive: true },
  { emoji: '🦊', name: 'foxwifhat', sol: '-0.15', positive: false },
  { emoji: '🐸', name: 'pepemaxxi', sol: '+1.20', positive: true },
  { emoji: '💀', name: 'skullcap99', sol: '-0.08', positive: false },
  { emoji: '🔥', name: 'burnttoast', sol: '+0.33', positive: true },
];

/* ── HomePage ────────────────────────────────────────────── */

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { connected, login, publicKey } = usePrivyWallet();
  const balance = useWalletBalance(publicKey);
  const solPrice = useSolPrice();

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

  const mode = MODES[modeIdx];

  /* Balance display */
  const balStr = balance !== null ? balance.toFixed(3) : '—';
  const usdStr = balance !== null && solPrice ? solToUsd(balance, solPrice) : '';

  return (
    <div style={{ width: '100%', minHeight: '100dvh', position: 'relative' }}>

      {/* ── Blob background ─────────────────────────────────── */}
      <Blobs palette="home" />

      {/* ── Scrollable content ──────────────────────────────── */}
      <div
        className="page page--home scroll-no-bar"
        style={{
          position: 'relative',
          zIndex: 1,
          overflowY: 'auto',
          gap: 16,
        }}
      >

        {/* ── Top bar ─────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
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
          {connected && balance !== null ? (
            <div className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <TokenMark token="sol" size={14} />
              <span>{balStr}</span>
              {usdStr && (
                <span style={{ color: 'var(--ink-faint)', fontSize: 10, fontWeight: 500 }}>
                  {usdStr}
                </span>
              )}
            </div>
          ) : (
            <button
              onClick={login}
              className="chip"
              style={{ cursor: 'pointer', border: '1px solid var(--glass-stroke-hi)' }}
            >
              connect
            </button>
          )}
        </div>

        {/* ── Two-column grid on desktop ──────────────────────── */}
        <div className="page-grid--home">

          {/* ── Left column: Hero card ─────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              className="glass glass-strong"
              style={{
                borderRadius: 32,
                padding: '28px 26px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              {/* Crossfade wrapper */}
              <div style={{
                transition: 'opacity 380ms ease, transform 380ms ease',
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(6px)',
              }}>
                {/* Sticker row + emoji */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  {/* Tags */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <span
                      className="sticker sticker-acid"
                      style={{ transform: 'rotate(-3deg)' }}
                    >
                      {mode.tag}
                    </span>
                    <span
                      className="sticker sticker-pink"
                      style={{ transform: 'rotate(2deg)' }}
                    >
                      {mode.tagAlt}
                    </span>
                  </div>

                  {/* Emoji with glow */}
                  <span style={{
                    fontSize: 48,
                    filter: `drop-shadow(0 0 18px ${mode.glowVar})`,
                    animation: 'glow 3s ease-in-out infinite',
                    lineHeight: 1,
                  }}>
                    {mode.emoji}
                  </span>
                </div>

                {/* Title */}
                <div
                  className="display"
                  style={{
                    fontSize: 44,
                    lineHeight: 0.95,
                    color: 'var(--ink)',
                    marginBottom: 6,
                  }}
                >
                  {mode.title}
                </div>

                {/* Hook line */}
                <div
                  className="italic-serif"
                  style={{
                    fontSize: 52,
                    color: mode.accent,
                    lineHeight: 1.1,
                    marginBottom: 10,
                  }}
                >
                  {mode.hook}
                </div>

                {/* Sub-description */}
                <p style={{
                  fontSize: 13,
                  color: 'var(--ink-soft)',
                  lineHeight: 1.5,
                }}>
                  {mode.sub}
                </p>
              </div>

              {/* Mode dots */}
              <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', justifyContent: 'center' }}>
                {MODES.map((m, i) => {
                  const isActive = i === modeIdx;
                  return (
                    <div
                      key={m.key}
                      style={{
                        width: isActive ? 24 : 8,
                        height: 8,
                        borderRadius: 4,
                        background: isActive ? mode.accent : 'var(--ink-dim)',
                        boxShadow: isActive ? `0 0 12px ${mode.glowVar}` : 'none',
                        transition: 'all 380ms ease',
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Right column: Live players + CTAs ────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>

            {/* ── Live players rail ────────────────────────────────── */}
            <div
              className="glass-flat"
              style={{
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {/* Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <div style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: 'var(--mint)',
                  animation: 'pulseDot 2s ease infinite',
                  flexShrink: 0,
                }} />
                <span
                  className="mono"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--ink-faint)',
                  }}
                >
                  live · players online
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--mint)',
                    marginLeft: 'auto',
                  }}
                >
                  {Math.floor(Math.random() * 40 + 80)}
                </span>
              </div>

              {/* Player rows */}
              {FAKE_PLAYERS.map((p) => (
                <div
                  key={p.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '6px 0',
                    borderTop: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <span style={{ fontSize: 18, width: 28, textAlign: 'center', flexShrink: 0 }}>
                    {p.emoji}
                  </span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: 'var(--ink-soft)',
                      flex: 1,
                    }}
                  >
                    {p.name}
                  </span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: p.positive ? 'var(--mint)' : '#FF5C5C',
                    }}
                  >
                    {p.sol} SOL
                  </span>
                </div>
              ))}
            </div>

            {/* ── CTA stack ────────────────────────────────────────── */}
            <div style={{
              marginTop: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              paddingTop: 8,
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
              <button
                onClick={() => navigate('/how-to-play')}
                className="mono"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '10px 0',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase' as const,
                  color: 'var(--ink-faint)',
                  textAlign: 'center' as const,
                }}
              >
                how to play · rules
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
