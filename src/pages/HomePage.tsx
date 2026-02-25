import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { AnimatedBackground } from '../components/AnimatedBackground';

const pop = {
  initial: { opacity: 0, y: 24, scale: 0.93 },
  animate: { opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring', stiffness: 400, damping: 28 } },
};

const btnTap = { scale: 0.95 };

// ── Desktop layout (≥1024px) ─────────────────────────────────
function DesktopHome({ connected, login, logout, displayName, navigate }: any) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      padding: '0 60px 48px', maxWidth: 1300, margin: '0 auto', width: '100%',
      position: 'relative', zIndex: 1,
    }}>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '28px 0 0' }}>
        <img src="/logo-glass.svg" alt="Transparent" style={{ height: 72, objectFit: 'contain' }} />
      </div>

      {/* Main grid */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center', paddingTop: 40 }}>

        {/* Left: hero + how it works */}
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.1 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 40 }}
        >
          <div>
            <img src="/logo-glass.svg" alt="Transparent" style={{ height: 'clamp(60px, 8vw, 90px)', objectFit: 'contain', alignSelf: 'flex-start' }} />
            <p style={{ color: 'var(--muted)', fontSize: 17, marginTop: 16, lineHeight: 1.6, fontWeight: 400, maxWidth: 460 }}>
              The party game with real stakes.
            </p>
          </div>

          {/* How it works */}
          <div>
            <p className="label-cipher" style={{ marginBottom: 14 }}>How it works</p>
            <div className="card-pixel corner-accent" style={{ padding: '4px 20px' }}>
              {[
                ['01', 'Host creates a room',    'Set the entry fee'],
                ['02', 'Everyone buys in',       'Cash goes into the pot'],
                ['03', 'Hot seat answers',        'One player faces the questions'],
                ['04', 'Group votes',             'Honest or lying?'],
                ['05', 'Most honest player wins', 'Pot paid out instantly'],
              ].map(([num, title, sub], i, arr) => (
                <React.Fragment key={num}>
                  <motion.div
                    style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0' }}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.06, type: 'spring', stiffness: 300, damping: 28 }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--lavender)', width: 22, flexShrink: 0, opacity: 0.7 }}>{num}</span>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{title}</span>
                      <span style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 10 }}>{sub}</span>
                    </div>
                  </motion.div>
                  {i < arr.length - 1 && <hr className="divider-pixel" />}
                </React.Fragment>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Right: actions + NFC card */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.2 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
        >
          {!connected ? (
            <div className="card" style={{ padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 42, marginBottom: 8 }}>🎯</div>
                <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>Ready to play?</p>
                <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 6 }}>Free to set up · Takes 30 seconds</p>
              </div>
              <motion.button
                className="btn btn-primary"
                onClick={login}
                whileTap={btnTap}
                whileHover={{ scale: 1.03, boxShadow: '0 0 48px rgba(196,255,60,0.5)' }}
                style={{ width: '100%', height: 56, fontSize: 17 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                Play Now
              </motion.button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <motion.button
                className="card"
                onClick={() => navigate('/create')}
                whileTap={btnTap}
                whileHover={{ scale: 1.02, borderColor: 'var(--lime-border)' }}
                style={{
                  padding: '28px 32px', cursor: 'pointer', background: 'var(--glass)',
                  border: '1px solid var(--border)', borderRadius: 'var(--r)',
                  display: 'flex', alignItems: 'center', gap: 20, textAlign: 'left',
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                <div style={{ fontSize: 40 }}>🎮</div>
                <div>
                  <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Host a Game</p>
                  <p style={{ fontSize: 13, color: 'var(--muted)' }}>Create a room · Set the entry fee · Invite friends</p>
                </div>
              </motion.button>
              <motion.button
                className="card"
                onClick={() => navigate('/join')}
                whileTap={btnTap}
                whileHover={{ scale: 1.02, borderColor: 'var(--lavender-border)' }}
                style={{
                  padding: '28px 32px', cursor: 'pointer', background: 'var(--glass)',
                  border: '1px solid var(--border)', borderRadius: 'var(--r)',
                  display: 'flex', alignItems: 'center', gap: 20, textAlign: 'left',
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                <div style={{ fontSize: 40 }}>🚀</div>
                <div>
                  <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Join a Game</p>
                  <p style={{ fontSize: 13, color: 'var(--muted)' }}>Enter a room code from the host</p>
                </div>
              </motion.button>
            </div>
          )}

          {/* NFC card */}
          <div className="card" style={{ padding: 24 }}>
            <p className="label-cipher" style={{ marginBottom: 14 }}>The physical game</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--glass)', border: '1px solid var(--lime-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>📲</div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Tap to play</p>
                  <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>NFC chip launches the game instantly. Tap and you're in.</p>
                </div>
              </div>
              <hr className="divider-pixel" />
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--glass)', border: '1px solid var(--lavender-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🎁</div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Starter funds included</p>
                  <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>Second chip drops funds so your first game is on us.</p>
                </div>
              </div>
            </div>
            <motion.button
              className="btn btn-secondary"
              style={{ marginTop: 16, width: '100%', height: 44, fontSize: 13 }}
              whileTap={btnTap}
              whileHover={{ scale: 1.02 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              onClick={() => navigate('/waitlist')}
            >
              Get the physical game →
            </motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ── Mobile layout (<1024px) ──────────────────────────────────
function MobileHome({ connected, login, logout, displayName, navigate }: any) {
  return (
    <div className="page" style={{ position: 'relative' }}>
      {/* Spacer for wallet pill row */}
      <div style={{ width: '100%', minHeight: 38, marginBottom: 28 }} />

      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 32, paddingTop: 0, paddingBottom: 48, width: '100%', position: 'relative', zIndex: 1 }}
      >
        <motion.div variants={pop} initial="initial" animate="animate">
          <img src="/logo-glass.svg" alt="Transparent" style={{ height: 56, objectFit: 'contain', alignSelf: 'flex-start' }} />
          <p style={{ color: 'var(--muted)', fontSize: 15, marginTop: 12, lineHeight: 1.6, fontWeight: 400 }}>
            The party game with real stakes.
          </p>
        </motion.div>

        <motion.div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 26, delay: 0.3 }}>
          {!connected ? (
            <>
              <motion.button className="btn btn-primary" onClick={login} whileTap={btnTap} whileHover={{ scale: 1.03, boxShadow: '0 0 40px rgba(196,255,60,0.45)' }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
                Play Now
              </motion.button>
              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Free to set up · Takes 30 seconds</p>
            </>
          ) : (
            <>
              <motion.button className="btn btn-primary" onClick={() => navigate('/create')} whileTap={btnTap} whileHover={{ scale: 1.03, boxShadow: '0 0 40px rgba(196,255,60,0.45)' }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
                Host a Game
              </motion.button>
              <motion.button className="btn btn-secondary" onClick={() => navigate('/join')} whileTap={btnTap} whileHover={{ scale: 1.02 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
                Join a Game
              </motion.button>
            </>
          )}
        </motion.div>

        <motion.div style={{ marginTop: 8 }} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 240, damping: 28, delay: 0.45 }}>
          <p className="label-cipher" style={{ marginBottom: 14 }}>How it works</p>
          <div className="card-pixel corner-accent" style={{ padding: '4px 16px' }}>
            {[
              ['01', 'Host creates a room',    'Set the entry fee'],
              ['02', 'Everyone buys in',       'Cash goes into the pot'],
              ['03', 'Hot seat answers',        'One player faces the questions'],
              ['04', 'Group votes',             'Honest or lying?'],
              ['05', 'Most honest player wins', 'Pot paid out instantly'],
            ].map(([num, title, sub], i, arr) => (
              <React.Fragment key={num}>
                <motion.div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 0' }} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.06, type: 'spring', stiffness: 300, damping: 28 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--lavender)', letterSpacing: '0.05em', width: 20, flexShrink: 0, opacity: 0.7 }}>{num}</span>
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

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 240, damping: 28, delay: 0.6 }}>
          <p className="label-cipher" style={{ marginBottom: 14 }}>The physical game</p>
          <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>Buy the Transparent card deck and get two NFC chips included.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--glass)', border: '1px solid var(--lime-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>📲</div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Tap to play</p>
                  <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>One NFC chip launches the game instantly — no typing needed.</p>
                </div>
              </div>
              <hr className="divider-pixel" />
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--glass)', border: '1px solid var(--lavender-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🎁</div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Starter funds included</p>
                  <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>Second chip drops funds so your first game is on us.</p>
                </div>
              </div>
            </div>
            <motion.button className="btn btn-secondary" style={{ marginTop: 4, fontSize: 13, height: 44 }} whileTap={btnTap} whileHover={{ scale: 1.02 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }} onClick={() => navigate('/waitlist')}>
              Get the physical game →
            </motion.button>
          </div>
        </motion.div>
      </motion.div>

      <p style={{ fontSize: 11, color: 'var(--faint)', paddingBottom: 8, position: 'relative', zIndex: 1 }}>
        Powered by Solana · v1.0
      </p>
    </div>
  );
}

// ── Root component ───────────────────────────────────────────
export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { connected, login, displayName, logout } = usePrivyWallet();
  const props = { connected, login, logout, displayName, navigate };

  return (
    <div style={{ width: '100%', minHeight: '100vh', position: 'relative' }}>
      <AnimatedBackground />
      {/* Desktop */}
      <div className="desktop-only">
        <DesktopHome {...props} />
      </div>
      {/* Mobile */}
      <div className="mobile-only">
        <MobileHome {...props} />
      </div>
    </div>
  );
};
