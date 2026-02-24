import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { GlassCard } from '../components/GlassCard';
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
    <div className="min-h-screen flex flex-col items-center px-6 py-6 relative">
      {/* Navbar */}
      <div className="w-full max-w-2xl flex items-center justify-between mb-8">
        <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 600 }}>Solana Devnet</span>
        <button
          onClick={connected ? logout : login}
          className="backdrop-blur-md bg-black/80 text-white px-5 py-2 rounded-full text-sm font-bold hover:bg-black/90 transition-all border border-white/10"
        >
          {connected ? displayName : 'Connect Wallet'}
        </button>
      </div>

      <div className="w-full max-w-2xl mx-auto flex flex-col items-center gap-10 animate-in">

        {/* Logo */}
        <div className="text-center">
          <img src={transparentLogo} alt="Transparent" style={{ height: 80, width: 'auto' }} />
          <p className="text-sm mt-2" style={{ color: 'var(--text-2)' }}>
            The crypto party game where honesty pays
          </p>
        </div>

        {/* Action buttons — glass cards */}
        <div className="flex gap-6 justify-center flex-wrap w-full">
          <button
            onClick={() => navigate('/join')}
            className="hover:scale-105 transition-all duration-300 w-full max-w-[260px]"
          >
            <GlassCard>
              <div className="flex flex-col items-center justify-center gap-4 py-8 px-6">
                <img src={addIcon} alt="Join" className="w-16 h-16" />
                <span className="text-white text-xl font-bold">Join Game</span>
              </div>
            </GlassCard>
          </button>

          <button
            onClick={() => navigate('/create')}
            className="hover:scale-105 transition-all duration-300 w-full max-w-[260px]"
          >
            <GlassCard>
              <div className="flex flex-col items-center justify-center gap-4 py-8 px-6">
                <img src={starIcon} alt="Create" className="w-16 h-16" />
                <span className="text-white text-xl font-bold">Create Game</span>
              </div>
            </GlassCard>
          </button>
        </div>

        {/* How to play */}
        <div className="w-full">
          <p className="text-center text-xs font-bold uppercase tracking-widest mb-6" style={{ color: 'var(--text-3)' }}>
            How to Play
          </p>
          <div className="grid grid-cols-6 gap-3">
            {HOW_TO_PLAY.map(step => (
              <div key={step.n} className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 flex items-center justify-center">
                  <img src={step.icon} alt={step.label} className="w-full h-full object-contain opacity-80" />
                </div>
                <p className="text-center" style={{ fontSize: 10, color: 'var(--text-3)' }}>
                  {step.n}. {step.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.6 }}>
          Real SOL. Real stakes. Real honesty.<br />Winner takes the pot.
        </p>
      </div>
    </div>
  );
};
