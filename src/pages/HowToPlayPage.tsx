import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Blobs, BackButton } from '../components';

/* ── Mode rules ─────────────────────────────────────────── */

interface ModeInfo {
  id: string;
  emoji: string;
  label: string;
  accent: string;
  steps: string[];
}

const MODES: ModeInfo[] = [
  {
    id: 'classic',
    emoji: '🤥',
    label: 'classic',
    accent: 'var(--acid)',
    steps: [
      'one player sits in the hot seat each round.',
      'the host picks a question from the vault.',
      'the hot seat player answers out loud — truth or lie.',
      'everyone else votes: truth or bluff.',
      'if you fool the table, you win the round.',
    ],
  },
  {
    id: 'hot-take',
    emoji: '🌶️',
    label: 'hot take',
    accent: 'var(--pink)',
    steps: [
      'one player sits in the hot seat.',
      'everyone else writes a spicy question for them.',
      'the table votes on the best question.',
      'the hot seat player answers the winning question.',
      'the table votes: truth or bluff.',
    ],
  },
  {
    id: 'storyteller',
    emoji: '🎭',
    label: 'storyteller',
    accent: 'var(--tangerine)',
    steps: [
      'the storyteller gets a prompt.',
      'they choose: tell a true story or make one up.',
      'they tell the story out loud — sell it hard.',
      'the table votes: real story or cap.',
      'if you fool them, you win the round.',
    ],
  },
  {
    id: 'custom',
    emoji: '🛠️',
    label: 'custom',
    accent: 'var(--azure)',
    steps: [
      'the host writes all questions before the game starts.',
      'full creative control — your rules, your prompts.',
      'gameplay follows the classic flow after that.',
      'great for themed nights or inside jokes.',
    ],
  },
];

/* ── FAQ ────────────────────────────────────────────────── */

const FAQ = [
  {
    q: 'how does the money work?',
    a: 'the host sets a buy-in when creating the game. everyone pays in when they ready up. at the end, the pot is split by honesty score — the most transparent player wins the most.',
  },
  {
    q: 'what tokens can i use?',
    a: 'sol, bonk, wif, popcat, and pengu. the host picks the token and buy-in amount. you can also play for free with no buy-in.',
  },
  {
    q: 'how do predictions work?',
    a: 'before the game starts, you can bet on who you think will win. if you predict correctly, you split the prediction pot with other correct bettors.',
  },
  {
    q: 'can i leave mid-game?',
    a: 'if you haven\'t paid in yet, you can leave freely. if you\'ve paid in, you need to request a leave and the host has to approve the refund.',
  },
  {
    q: 'how many players do i need?',
    a: 'you can start with any number of players, but the game is best with 3–8 people. more players = more chaos.',
  },
];

/* ── Component ──────────────────────────────────────────── */

export const HowToPlayPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeMode, setActiveMode] = useState('classic');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const mode = MODES.find(m => m.id === activeMode) ?? MODES[0];

  return (
    <div style={{ width: '100%', minHeight: '100dvh', position: 'relative' }}>
      <Blobs palette="home" />

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
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <BackButton onClick={() => navigate('/')} />
          <span className="chip">rules</span>
        </div>

        {/* title */}
        <div>
          <span className="display" style={{ fontSize: 36, lineHeight: 1.05, color: 'var(--ink)' }}>
            how to{' '}
          </span>
          <span className="italic-serif" style={{ fontSize: 36, color: 'var(--acid)' }}>
            play.
          </span>
        </div>

        {/* quick overview */}
        <div
          className="glass glass-strong"
          style={{ padding: '22px 20px', borderRadius: 24 }}
        >
          <p className="mono" style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>
            the basics
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { num: '01', text: 'create or join a game with a 6-digit code.' },
              { num: '02', text: 'everyone buys in with sol (or plays free).' },
              { num: '03', text: 'take turns in the hot seat — answer questions.' },
              { num: '04', text: 'the table votes: are you telling the truth or bluffing?' },
              { num: '05', text: 'most transparent player takes the biggest share of the pot.' },
            ].map(step => (
              <div key={step.num} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: 'var(--acid)', flexShrink: 0, width: 20 }}>
                  {step.num}
                </span>
                <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                  {step.text}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* game modes */}
        <div>
          <p className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>
            game modes
          </p>

          {/* mode tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto' }} className="scroll-no-bar">
            {MODES.map(m => {
              const isActive = activeMode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setActiveMode(m.id)}
                  className="glass-flat"
                  style={{
                    padding: '8px 14px',
                    borderRadius: 100,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flexShrink: 0,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: isActive ? m.accent : 'var(--ink-faint)',
                    border: isActive ? `1px solid ${m.accent}` : '1px solid var(--glass-stroke)',
                    background: isActive ? `color-mix(in srgb, ${m.accent} 8%, transparent)` : 'var(--glass-bg)',
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: 16 }}>{m.emoji}</span>
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* mode detail card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={mode.id}
              className="glass"
              style={{ padding: '18px 18px', borderRadius: 20 }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 28 }}>{mode.emoji}</span>
                <span className="display" style={{ fontSize: 18, color: mode.accent }}>{mode.label}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {mode.steps.map((step, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 6,
                      background: `color-mix(in srgb, ${mode.accent} 12%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${mode.accent} 25%, transparent)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <span className="mono" style={{ fontSize: 9, fontWeight: 800, color: mode.accent }}>
                        {i + 1}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                      {step}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* FAQ */}
        <div>
          <p className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>
            faq
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {FAQ.map((item, i) => {
              const isOpen = openFaq === i;
              return (
                <button
                  key={i}
                  className="glass-flat"
                  onClick={() => setOpenFaq(isOpen ? null : i)}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 16,
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: isOpen ? 10 : 0,
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{item.q}</span>
                    <span className="mono" style={{
                      fontSize: 14, color: 'var(--ink-faint)', flexShrink: 0, marginLeft: 12,
                      transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                    }}>
                      +
                    </span>
                  </div>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        style={{ fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.55, overflow: 'hidden' }}
                      >
                        {item.a}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </button>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <div style={{ marginTop: 'auto', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
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
