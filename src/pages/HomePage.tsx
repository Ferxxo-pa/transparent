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
    <div className="page page-full" style={{ paddingTop: 0 }}>
      {/* Navbar — full width on desktop */}
      <nav className="navbar" style={{ paddingTop: 24 }}>
        <img src={transparentLogo} alt="Transparent" style={{ height: 26, width: 'auto', opacity: 0.9 }} />
        <button onClick={connected ? logout : login} className="btn btn-ghost" style={{ fontSize: 13 }}>
          {connected ? displayName : 'Connect Wallet'}
        </button>
      </nav>

      {/* Responsive grid */}
      <div className="page-content">
        <div className="home-grid animate-in">

          {/* Hero */}
          <div className="home-hero">
            <h1 style={{
              fontFamily: 'Space Grotesk', fontSize: 'clamp(32px, 6vw, 52px)',
              fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.08, color: 'var(--text)'
            }}>
              The crypto<br />party game.
            </h1>
            <p style={{ color: 'var(--text-2)', fontSize: 'clamp(14px, 2vw, 17px)', marginTop: 12, lineHeight: 1.6, maxWidth: 400 }}>
              Real SOL. Real stakes. Answer honestly — or get caught trying.
            </p>

            {/* Desktop-only tag row */}
            <div className="home-tags" style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
              {['Solana Devnet', 'Winner Takes All', '2–8 Players', 'Real Stakes'].map(tag => (
                <span key={tag} className="badge badge-neutral" style={{ fontSize: 11 }}>{tag}</span>
              ))}
            </div>
          </div>

          {/* Glass action cards */}
          <div className="home-actions">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <button
                onClick={() => navigate('/join')}
                style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, transition: 'transform 0.2s', width: '100%' }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.02)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <div style={{
                  backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 28, padding: 'clamp(24px, 4vw, 32px)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
                  boxShadow: `inset 8px 8px 2px -10px rgba(255,255,255,0.45),
                    inset 5px 5px 3px -5px #B3B3B3, inset -5px -5px 3px -5px #B3B3B3,
                    inset 0 0 0 1.5px rgba(180,180,180,0.25), inset 0 0 50px rgba(255,255,255,0.02)`
                }}>
                  <img src={addIcon} alt="Join" style={{ width: 52, height: 52, filter: 'brightness(0) invert(1) opacity(0.85)' }} />
                  <span style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>
                    Join Game
                  </span>
                </div>
              </button>

              <button
                onClick={() => navigate('/create')}
                style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, transition: 'transform 0.2s', width: '100%' }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.02)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <div style={{
                  backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
                  background: 'rgba(191,251,79,0.05)',
                  borderRadius: 28, padding: 'clamp(24px, 4vw, 32px)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
                  boxShadow: `inset 8px 8px 2px -10px rgba(255,255,255,0.45),
                    inset 5px 5px 3px -5px #B3B3B3, inset -5px -5px 3px -5px #B3B3B3,
                    inset 0 0 0 1.5px rgba(191,251,79,0.2), 0 0 30px rgba(191,251,79,0.05)`
                }}>
                  <img src={starIcon} alt="Create" style={{ width: 52, height: 52, filter: 'brightness(0) saturate(100%) invert(94%) sepia(48%) saturate(700%) hue-rotate(40deg) brightness(105%)' }} />
                  <span style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 18, color: 'var(--lime)' }}>
                    Create Game
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* How it works */}
          <div className="home-how">
            <p className="label" style={{ marginBottom: 14 }}>How it works</p>
            <div className="card" style={{ padding: '4px 20px' }}>
              {HOW_TO_PLAY.map((step, i, arr) => (
                <React.Fragment key={step.n}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0' }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                      background: 'var(--glass-2)', border: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <img src={step.icon} alt={step.label} style={{ width: 18, height: 18, objectFit: 'contain', opacity: 0.7, filter: 'brightness(0) invert(1)' }} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', flex: 1 }}>{step.label}</span>
                    <span style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 11, color: 'var(--text-3)' }}>0{step.n}</span>
                  </div>
                  {i < arr.length - 1 && <hr className="divider" />}
                </React.Fragment>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
