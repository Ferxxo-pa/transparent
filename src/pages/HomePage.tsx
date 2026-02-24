import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivyWallet } from '../contexts/PrivyContext';
import transparentLogo from '../assets/trans 3.svg';
import addIcon from '../assets/Add.svg';
import starIcon from '../assets/Star.svg';
import groupIcon from '../assets/Group.svg';
import moneyIcon from '../assets/money-payments-accounting-bill-money-2--Streamline-Pixel.svg';
import fireIcon from '../assets/social-rewards-trends-hot-flame--Streamline-Pixel.svg';
import messageIcon from '../assets/email-mail-chat--Streamline-Pixel.svg';
import moneyBagIcon from '../assets/business-products-bag-money--Streamline-Pixel.svg';
import handIcon from '../assets/Group copy.svg';

const HOW_TO_PLAY = [
  { n: 1, icon: groupIcon,    label: 'Host or Join' },
  { n: 2, icon: moneyIcon,    label: 'Buy-In' },
  { n: 3, icon: fireIcon,     label: 'Hot Seat' },
  { n: 4, icon: messageIcon,  label: 'Vote' },
  { n: 5, icon: handIcon,     label: 'Hold or Fold' },
  { n: 6, icon: moneyBagIcon, label: 'Winner Takes All' },
];

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { connected, login, logout, displayName } = usePrivyWallet();

  return (
    <div className="page" style={{ paddingTop: 0 }}>
      {/* Navbar */}
      <nav className="navbar">
        <img src={transparentLogo} alt="Transparent" style={{ height: 26, width: 'auto', opacity: 0.9 }} />
        <button onClick={connected ? logout : login} className="btn btn-ghost" style={{ fontSize: 13 }}>
          {connected ? displayName : 'Connect Wallet'}
        </button>
      </nav>

      <div className="page-content animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 28, paddingTop: 8 }}>

        {/* Hero text */}
        <div>
          <h1 style={{
            fontFamily: 'Space Grotesk', fontSize: 40, fontWeight: 700,
            letterSpacing: '-0.03em', lineHeight: 1.1, color: 'var(--text)'
          }}>
            The crypto<br />party game.
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: 15, marginTop: 10, lineHeight: 1.5 }}>
            Real SOL. Real stakes. Honesty pays.
          </p>
        </div>

        {/* Glass action cards — old-style GlassCard with pixel icons */}
        <div style={{ display: 'flex', gap: 16 }}>
          <button
            onClick={() => navigate('/join')}
            style={{ flex: 1, cursor: 'pointer', background: 'none', border: 'none', padding: 0, transition: 'transform 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <div style={{
              position: 'relative',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 32,
              padding: '32px 20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
              boxShadow: `
                inset 8px 8px 2px -10px rgba(255,255,255,0.45),
                inset 5px 5px 3px -5px #B3B3B3,
                inset -5px -5px 3px -5px #B3B3B3,
                inset 0 0 0 1.5px rgba(180,180,180,0.3),
                inset 0 0 50px rgba(255,255,255,0.03)
              `
            }}>
              <img src={addIcon} alt="Join" style={{ width: 56, height: 56, filter: 'brightness(0) invert(1) opacity(0.85)' }} />
              <span style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 18, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                Join Game
              </span>
            </div>
          </button>

          <button
            onClick={() => navigate('/create')}
            style={{ flex: 1, cursor: 'pointer', background: 'none', border: 'none', padding: 0, transition: 'transform 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <div style={{
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              background: 'rgba(191,251,79,0.05)',
              borderRadius: 32,
              padding: '32px 20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
              boxShadow: `
                inset 8px 8px 2px -10px rgba(255,255,255,0.45),
                inset 5px 5px 3px -5px #B3B3B3,
                inset -5px -5px 3px -5px #B3B3B3,
                inset 0 0 0 1.5px rgba(191,251,79,0.2),
                inset 0 0 50px rgba(191,251,79,0.03),
                0 0 30px rgba(191,251,79,0.06)
              `
            }}>
              <img src={starIcon} alt="Create" style={{ width: 56, height: 56, filter: 'brightness(0) saturate(100%) invert(94%) sepia(48%) saturate(700%) hue-rotate(40deg) brightness(105%)' }} />
              <span style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 18, color: 'var(--lime)', letterSpacing: '-0.01em' }}>
                Create Game
              </span>
            </div>
          </button>
        </div>

        {/* How it works — pixel icons from old design */}
        <div>
          <p className="label" style={{ marginBottom: 14 }}>How it works</p>
          <div className="card" style={{ padding: '4px 20px' }}>
            {HOW_TO_PLAY.map((step, i, arr) => (
              <React.Fragment key={step.n}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: 'var(--glass-2)',
                    border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <img src={step.icon} alt={step.label} style={{ width: 20, height: 20, objectFit: 'contain', opacity: 0.75, filter: 'brightness(0) invert(1)' }} />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', flex: 1 }}>
                    {step.label}
                  </span>
                  <span style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 12, color: 'var(--text-3)' }}>
                    0{step.n}
                  </span>
                </div>
                {i < arr.length - 1 && <hr className="divider" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', paddingBottom: 8 }}>
          Solana Devnet · Winner takes all
        </p>
      </div>
    </div>
  );
};
