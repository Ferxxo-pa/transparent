import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { AnimatedBackground } from '../components/AnimatedBackground';

const stagger = {
  animate: { transition: { staggerChildren: 0.08 } }
};

const pop = {
  initial: { opacity: 0, y: 24, scale: 0.93 },
  animate: { opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring', stiffness: 400, damping: 28 } },
};

const btnTap  = { scale: 0.95 };

export const HomePage: React.FC = () => {
  const navigate  = useNavigate();
  const { connected, login, displayName, logout } = usePrivyWallet();

  return (
    <div className="page" style={{ position: 'relative' }}>
      <AnimatedBackground />

      {/* Minimal top bar — only shows when connected */}
      {connected && (
        <div style={{
          width: '100%', display: 'flex', justifyContent: 'flex-end',
          padding: '16px 0 0', position: 'relative', zIndex: 2,
        }}>
          <motion.button
            className="btn-ghost"
            onClick={logout}
            whileTap={btnTap}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{
              display: 'flex', alignItems: 'center', height: 34, padding: '0 14px',
              background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-pill)', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'Space Grotesk',
            }}
          >
            {displayName}
          </motion.button>
        </div>
      )}

      {/* Hero */}
      <motion.div
        variants={stagger}
        initial="initial"
        animate="animate"
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
          gap: 32, paddingTop: connected ? 12 : 40, paddingBottom: 48,
          width: '100%', position: 'relative', zIndex: 1,
        }}
      >
        {/* Title */}
        <motion.div variants={pop}>
          <motion.div
            className="display"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.15 }}
          >
            The party game<br />with real stakes.
          </motion.div>
          <motion.p
            style={{ color: 'var(--muted)', fontSize: 15, marginTop: 12, lineHeight: 1.6, fontWeight: 400 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
          >
            Everyone puts in cash. Answer honestly. Most transparent player takes the pot.
          </motion.p>
        </motion.div>

        {/* CTAs */}
        <motion.div
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26, delay: 0.3 }}
        >
          {!connected ? (
            <>
              <motion.button
                className="btn btn-primary"
                onClick={login}
                whileTap={btnTap}
                whileHover={{ scale: 1.03, boxShadow: '0 0 40px rgba(196,255,60,0.45)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                Play Now
              </motion.button>
              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                Free to set up · Takes 30 seconds
              </p>
            </>
          ) : (
            <>
              <motion.button
                className="btn btn-primary"
                onClick={() => navigate('/create')}
                whileTap={btnTap}
                whileHover={{ scale: 1.03, boxShadow: '0 0 40px rgba(196,255,60,0.45)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                Host a Game
              </motion.button>
              <motion.button
                className="btn btn-secondary"
                onClick={() => navigate('/join')}
                whileTap={btnTap}
                whileHover={{ scale: 1.02 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                Join a Game
              </motion.button>
            </>
          )}
        </motion.div>

        {/* How it works */}
        <motion.div
          style={{ marginTop: 8 }}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 28, delay: 0.45 }}
        >
          <div className="section-header" style={{ marginBottom: 14 }}>
            <p className="label-cipher">How it works</p>
          </div>
          <div className="card-pixel corner-accent" style={{ padding: '4px 16px' }}>
            {[
              ['01', 'Host creates a room',    'Set the entry fee'],
              ['02', 'Everyone buys in',       'Cash goes into the pot'],
              ['03', 'Hot seat answers',        'One player faces the questions'],
              ['04', 'Group votes',             'Honest or lying?'],
              ['05', 'Most honest player wins', 'Pot paid out instantly'],
            ].map(([num, title, sub], i, arr) => (
              <React.Fragment key={num}>
                <motion.div
                  style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 0' }}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.06, type: 'spring', stiffness: 300, damping: 28 }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--lavender)', letterSpacing: '0.05em', width: 20, flexShrink: 0, fontVariantNumeric: 'tabular-nums', opacity: 0.7 }}>{num}</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</span>
                    <span style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 8 }}>{sub}</span>
                  </div>
                </motion.div>
                {i < arr.length - 1 && <hr className="divider-pixel" />}
              </React.Fragment>
            ))}
          </div>
        </motion.div>

        {/* NFC Card Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 28, delay: 0.6 }}
        >
          <div className="section-header" style={{ marginBottom: 14 }}>
            <p className="label-cipher">The physical game</p>
          </div>
          <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
              Buy the Transparent card deck and get two NFC chips included.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, background: 'var(--glass)',
                  border: '1px solid var(--lime-border)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 18, flexShrink: 0,
                }}>📲</div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Tap to play</p>
                  <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                    One NFC chip launches the game instantly — no typing, no searching. Just tap and you're in.
                  </p>
                </div>
              </div>
              <hr className="divider-pixel" />
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, background: 'var(--glass)',
                  border: '1px solid var(--lavender-border)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 18, flexShrink: 0,
                }}>🎁</div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Starter funds included</p>
                  <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                    Second chip gives you a free airdrop to get started — no setup required for your first game.
                  </p>
                </div>
              </div>
            </div>
            <motion.button
              className="btn btn-secondary"
              style={{ marginTop: 4, fontSize: 13, height: 44 }}
              whileTap={btnTap}
              whileHover={{ scale: 1.02 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              onClick={() => {}}
            >
              Get the physical game →
            </motion.button>
          </div>
        </motion.div>
      </motion.div>

      <motion.p
        style={{ fontSize: 11, color: 'var(--faint)', paddingBottom: 8, position: 'relative', zIndex: 1 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
      >
        Powered by Solana · v1.0
      </motion.p>
    </div>
  );
};
