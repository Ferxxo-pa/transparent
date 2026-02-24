import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivyWallet } from '../contexts/PrivyContext';
import transparentLogo from '../assets/trans 3.svg';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { connected, login, logout, displayName } = usePrivyWallet();

  return (
    <div className="page">
      {/* Navbar */}
      <nav className="navbar">
        <img src={transparentLogo} alt="Transparent" style={{ height: 28, width: 'auto', opacity: 0.9 }} />
        <button onClick={connected ? logout : login} className="btn btn-ghost" style={{ fontSize: 13 }}>
          {connected ? displayName : 'Connect Wallet'}
        </button>
      </nav>

      <div className="page-content animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 20 }}>

        {/* Hero */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{
            fontFamily: 'Space Grotesk', fontSize: 42, fontWeight: 700,
            letterSpacing: '-0.03em', lineHeight: 1.1, color: 'var(--text)'
          }}>
            The crypto<br />party game.
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: 15, marginTop: 10, lineHeight: 1.5 }}>
            Real SOL. Real stakes. Honesty pays.
          </p>
        </div>

        {/* Main action cards */}
        <button
          onClick={() => navigate('/create')}
          className="card"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', border: '1px solid var(--border)',
            transition: 'border-color 0.15s, background 0.15s', textAlign: 'left',
            width: '100%', padding: '22px 24px'
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-2)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <div>
            <div style={{ fontFamily: 'Space Grotesk', fontSize: 22, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.02em' }}>
              Create Game
            </div>
            <div style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
              Set the rules, invite your crew
            </div>
          </div>
          <span style={{ color: 'var(--text-3)', fontSize: 22, lineHeight: 1 }}>→</span>
        </button>

        <button
          onClick={() => navigate('/join')}
          className="card"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', border: '1px solid var(--border)',
            transition: 'border-color 0.15s', textAlign: 'left',
            width: '100%', padding: '22px 24px'
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-2)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <div>
            <div style={{ fontFamily: 'Space Grotesk', fontSize: 22, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.02em' }}>
              Join Game
            </div>
            <div style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
              Enter a room code to play
            </div>
          </div>
          <span style={{ color: 'var(--text-3)', fontSize: 22, lineHeight: 1 }}>→</span>
        </button>

        {/* How it works */}
        <div style={{ marginTop: 12 }}>
          <p className="label">How it works</p>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              ['🪑', 'Hot Seat', 'One player faces the questions'],
              ['💰', 'Buy In',   'Everyone stakes SOL to play'],
              ['🔥', 'Answer',   'Hot seat answers honestly'],
              ['🗳️', 'Vote',    'Players vote on truthfulness'],
              ['🏆', 'Win SOL', 'Most votes takes the pot'],
            ].map(([icon, title, desc], i, arr) => (
              <React.Fragment key={title}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0' }}>
                  <span style={{ fontSize: 18, width: 28, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{title}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-3)', marginLeft: 8 }}>{desc}</span>
                  </div>
                  <span style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 12, color: 'var(--text-3)' }}>
                    0{i + 1}
                  </span>
                </div>
                {i < arr.length - 1 && <hr className="divider" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', marginTop: 8 }}>
          Solana Devnet · Winner takes all
        </p>
      </div>
    </div>
  );
};
