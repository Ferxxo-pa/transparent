import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TransparentLogo } from '../components/TransparentLogo';
import { GlassCard } from '../components/GlassCard';
import { usePrivyWallet } from '../contexts/PrivyContext';
import addIcon from '../assets/Add.svg';
import starIcon from '../assets/Star.svg';
import groupIcon from '../assets/Group.svg';
import moneyIcon from '../assets/money-payments-accounting-bill-money-2--Streamline-Pixel.svg';
import handIcon from '../assets/Group copy.svg';
import fireIcon from '../assets/social-rewards-trends-hot-flame--Streamline-Pixel.svg';
import messageIcon from '../assets/email-mail-chat--Streamline-Pixel.svg';
import moneyBagIcon from '../assets/business-products-bag-money--Streamline-Pixel.svg';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { connected, login, logout, displayName } = usePrivyWallet();

  const howToPlaySteps = [
    { number: 1, iconSrc: groupIcon, title: 'Host or Join' },
    { number: 2, iconSrc: moneyIcon, title: 'Buy-In' },
    { number: 3, iconSrc: fireIcon, title: 'Hot Seat' },
    { number: 4, iconSrc: messageIcon, title: 'Vote' },
    { number: 5, iconSrc: handIcon, title: 'Hold or Fold' },
    { number: 6, iconSrc: moneyBagIcon, title: 'Winner Takes All' },
  ];

  const handleLoginClick = () => {
    if (connected) {
      logout();
    } else {
      login();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 py-6">
      {/* Login pill */}
      <button
        onClick={handleLoginClick}
        className="absolute top-10 right-10 backdrop-blur-md bg-black/80 text-white px-6 py-2 rounded-full hover:bg-black/90 transition-all font-['Plus_Jakarta_Sans'] z-20"
      >
        {connected ? displayName : 'Login'}
      </button>

      {/* Frame wrapper pinned to Figma width + TOP PADDING to clear Login */}
      <div className="w-full max-w-2xl mx-auto pt-[80px]">
        <TransparentLogo className="mb-6" />

        <div className="w-full relative z-10">
          {/* Gap between buttons from your design; adjust if needed */}
          <div className="flex gap-8 justify-center flex-wrap">
            <button
              onClick={() => navigate('/join')}
              className="hover:scale-105 transition-all duration-300 w-full max-w-[280px]"
            >
              <GlassCard className="h-full">
                <div className="w-full flex flex-col items-center justify-center gap-4 py-8 px-6">
                  <img src={addIcon} alt="Add" className="w-16 h-16" />
                  <h2 className="text-white text-2xl font-bold">Join Game</h2>
                </div>
              </GlassCard>
            </button>

            <button
              onClick={() => navigate('/create')}
              className="hover:scale-105 transition-all duration-300 w-full max-w-[280px]"
            >
              <GlassCard className="h-full">
                <div className="w-full flex flex-col items-center justify-center gap-4 py-8 px-6">
                  <img src={starIcon} alt="Star" className="w-16 h-16" />
                  <h2 className="text-white text-2xl font-bold">Create Game</h2>
                </div>
              </GlassCard>
            </button>
          </div>
        </div>

        {/* 69px from buttons to HOW TO PLAY */}
        <div className="w-full mt-10 max-w-2xl mx-auto">
          <h2
            className="text-white/50 text-sm font-bold text-center mb-6 uppercase tracking-widest"
          >
            How to Play
          </h2>

          <div className="grid grid-cols-6 gap-4">
            {howToPlaySteps.map((step) => (
              <div key={step.number} className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 flex items-center justify-center relative">
                  <img
                    src={step.iconSrc}
                    alt={step.title}
                    className="w-full h-full object-contain opacity-80"
                  />
                </div>
                <p
                  className="text-white/60 text-center text-xs"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  {step.number}. {step.title}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
