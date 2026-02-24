import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { AnimatedBackground } from '../components/AnimatedBackground';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { connected, login, displayName, logout } = usePrivyWallet();

  return (
    <div className="page fade-in" style={{ position: 'relative' }}>
      <AnimatedBackground />
      {/* Nav */}
      <nav className="navbar" style={{ position: 'relative', zIndex: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          transparent
        </span>
        {connected && (
          <button className="btn-ghost" onClick={logout} style={{
            display: 'flex', alignItems: 'center', height: 36, padding: '0 14px',
            background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-pill)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'Space Grotesk'
          }}>
            {displayName}
          </button>
        )}
      </nav>

      {/* Hero */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 32, paddingTop: 16, paddingBottom: 48, width: '100%', position: 'relative', zIndex: 1 }}>
        <div>
          <div className="display">The crypto<br />party game.</div>
          <p style={{ color: 'var(--muted)', fontSize: 15, marginTop: 12, lineHeight: 1.6, fontWeight: 400 }}>
            Stake SOL. Answer honestly. Winner takes the pot.
          </p>
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!connected ? (
            <>
              <button className="btn btn-primary" onClick={login}>
                Connect Wallet to Play
              </button>
              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                Phantom, Solflare, or any Solana wallet
              </p>
            </>
          ) : (
            <>
              <button className="btn btn-primary" onClick={() => navigate('/create')}>
                Create Game
              </button>
              <button className="btn btn-secondary" onClick={() => navigate('/join')}>
                Join Game
              </button>
            </>
          )}
        </div>

        {/* How it works */}
        <div style={{ marginTop: 8 }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 0' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--lavender)', letterSpacing: '0.05em', width: 20, flexShrink: 0, fontVariantNumeric: 'tabular-nums', opacity: 0.7 }}>{num}</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</span>
                    <span style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 8 }}>{sub}</span>
                  </div>
                </div>
                {i < arr.length - 1 && <hr className="divider-pixel" />}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <p style={{ fontSize: 11, color: 'var(--faint)', paddingBottom: 8 }}>
        Solana Devnet · v1.0
      </p>
    </div>
  );
};
