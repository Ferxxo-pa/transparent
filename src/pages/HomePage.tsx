import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivyWallet } from '../contexts/PrivyContext';
import transparentLogo from '../assets/trans 3.svg';

const STEPS = [
  { n: 1, icon: '🪑', label: 'Hot Seat' },
  { n: 2, icon: '💰', label: 'Buy In' },
  { n: 3, icon: '🔥', label: 'Answer' },
  { n: 4, icon: '🗳️', label: 'Vote' },
  { n: 5, icon: '🏆', label: 'Win SOL' },
];

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { connected, login, logout, displayName } = usePrivyWallet();

  return (
    <div className="page">
      {/* Navbar */}
      <nav className="navbar">
        <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 600 }}>
          Solana Devnet
        </span>
        <button
          onClick={connected ? logout : login}
          className="btn btn-ghost"
          style={{ width: 'auto' }}
        >
          {connected ? displayName : 'Connect'}
        </button>
      </nav>

      <div className="page-content animate-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center' }}>
          <img src={transparentLogo} alt="Transparent" style={{ height: 72, width: 'auto' }} />
          <p style={{ color: 'var(--text-2)', fontSize: 14, marginTop: 8 }}>
            The crypto party game where honesty pays
          </p>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
          <button className="btn btn-primary" style={{ fontSize: 16, padding: '18px 24px' }} onClick={() => navigate('/create')}>
            🎮 Create Game
          </button>
          <button className="btn btn-secondary" style={{ fontSize: 16, padding: '18px 24px' }} onClick={() => navigate('/join')}>
            🚪 Join Game
          </button>
        </div>

        {/* How it works */}
        <div style={{ width: '100%' }}>
          <p className="label" style={{ textAlign: 'center', marginBottom: 16 }}>How it works</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            {STEPS.map((step, i) => (
              <React.Fragment key={step.n}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20
                  }}>
                    {step.icon}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textAlign: 'center' }}>
                    {step.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 20 }}>
                    <span style={{ color: 'var(--border-2)', fontSize: 12 }}>→</span>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.6 }}>
          Real SOL. Real stakes. Real honesty.<br />
          Winner takes the pot.
        </p>
      </div>
    </div>
  );
};
