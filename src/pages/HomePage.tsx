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
  animate: { opacity: 1, y: 0,  scale: 1,
    transition: { type: 'spring', stiffness: 400, damping: 28 } },
};

const btnTap = { scale: 0.95 };
const btnHover = { scale: 1.02 };

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { connected, login, displayName, logout } = usePrivyWallet();

  return (
    <div className="page" style={{ position: 'relative' }}>
      <AnimatedBackground />

      {/* Nav */}
      <motion.nav
        className="navbar"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24, delay: 0.1 }}
        style={{ position: 'relative', zIndex: 2 }}
      >
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          transparent
        </span>
        {connected && (
          <motion.button
            className="btn-ghost"
            onClick={logout}
            whileTap={btnTap}
            style={{ display: 'flex', alignItems: 'center', height: 36, padding: '0 14px',
              background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-pill)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Space Grotesk' }}
          >
            {displayName}
          </motion.button>
        )}
      </motion.nav>

      {/* Hero */}
      <motion.div
        variants={stagger}
        initial="initial"
        animate="animate"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
          gap: 32, paddingTop: 16, paddingBottom: 48, width: '100%', position: 'relative', zIndex: 1 }}
      >
        {/* Title */}
        <motion.div variants={pop}>
          <motion.div
            className="display"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.15 }}
          >
            The crypto<br />party game.
          </motion.div>
          <motion.p
            style={{ color: 'var(--muted)', fontSize: 15, marginTop: 12, lineHeight: 1.6, fontWeight: 400 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
          >
            Stake SOL. Answer honestly. Winner takes the pot.
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
                Connect Wallet to Play
              </motion.button>
              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                Phantom, Solflare, or any Solana wallet
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
                Create Game
              </motion.button>
              <motion.button
                className="btn btn-secondary"
                onClick={() => navigate('/join')}
                whileTap={btnTap}
                whileHover={btnHover}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                Join Game
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
              ['01', 'Host creates a room', 'Set buy-in amount in SOL'],
              ['02', 'Players join & stake', 'Buy-in goes to host wallet'],
              ['03', 'Hot seat answers', 'One player faces the questions'],
              ['04', 'Everyone votes', 'Honest or fake?'],
              ['05', 'Most honest wins', 'Host sends pot to winner'],
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
      </motion.div>

      <motion.p
        style={{ fontSize: 11, color: 'var(--faint)', paddingBottom: 8, position: 'relative', zIndex: 1 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
      >
        Solana Devnet · v1.0
      </motion.p>
    </div>
  );
};
