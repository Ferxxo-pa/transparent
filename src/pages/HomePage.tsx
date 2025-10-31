import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TransparentLogo } from '../components/TransparentLogo';
import { GlassCard } from '../components/GlassCard';
import addIcon from '../assets/Add.svg';
import starIcon from '../assets/Star.png';
import groupIcon from '../assets/Group icon.png';
import moneyIcon from '../assets/money icon.png';
import handIcon from '../assets/hand icon.png';
import fireIcon from '../assets/fire icon.png';
import messageIcon from '../assets/message icon.png';
import moneyBagIcon from '../assets/money bag icon.png';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();

  const howToPlaySteps = [
    { number: 1, iconSrc: groupIcon, title: 'Host or Join' },
    { number: 2, iconSrc: moneyIcon, title: 'Buy-In' },
    { number: 3, iconSrc: fireIcon, title: 'Hot Seat' },
    { number: 4, iconSrc: messageIcon, title: 'Vote' },
    { number: 5, iconSrc: handIcon, title: 'Hold or Fold' },
    { number: 6, iconSrc: moneyBagIcon, title: 'Winner Takes All' },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 py-6">
      {/* Login pill */}
      <button
        onClick={() => navigate('/login')}
        className="absolute top-10 right-10 backdrop-blur-md bg-black/80 text-white px-6 py-2 rounded-full hover:bg-black/90 transition-all font-['Plus_Jakarta_Sans'] z-20"
      >
        Login
      </button>

      {/* Frame wrapper pinned to Figma width + TOP PADDING to clear Login */}
      <div className="w-full max-w-[1440px] mx-auto pt-[80px]">
        {/* Cropped logo; exact 69px visual gap below it */}
        <TransparentLogo className="mb-[69px]" />

        <div className="w-full relative z-10">
          {/* Gap between buttons from your design; adjust if needed */}
          <div className="flex gap-[80px] justify-center">
            <button
              onClick={() => navigate('/join')}
              className="hover:scale-105 transition-all duration-300"
              style={{ width: '580px', height: '204px' }}
            >
              <GlassCard className="h-full">
                <div className="w-full h-full flex flex-col items-center justify-center gap-6">
                  <img src={addIcon} alt="Add" className="w-28 h-28" />
                  <h2 className="text-white text-4xl font-bold">Join Game</h2>
                </div>
              </GlassCard>
            </button>

            <button
              onClick={() => navigate('/create')}
              className="hover:scale-105 transition-all duration-300"
              style={{ width: '580px', height: '204px' }}
            >
              <GlassCard className="h-full">
                <div className="w-full h-full flex flex-col items-center justify-center gap-6">
                  <img src={starIcon} alt="Star" className="w-28 h-28" />
                  <h2 className="text-white text-4xl font-bold">Create Game</h2>
                </div>
              </GlassCard>
            </button>
          </div>
        </div>

        {/* 69px from buttons to HOW TO PLAY */}
        <div className="w-full mt-[69px] max-w-[1200px] mx-auto">
          <h2
            className="text-white/70 text-4xl font-bold text-center mb-8"
            style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
          >
            HOW TO PLAY
          </h2>

          <div className="grid grid-cols-6 gap-8">
            {howToPlaySteps.map((step) => (
              <div key={step.number} className="flex flex-col items-center gap-3">
                <div className="w-20 h-20 flex items-center justify-center relative">
                  <div
                    className="absolute top-0 -left-6 text-white text-lg font-bold"
                    style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                  >
                    {step.number}.
                  </div>
                  <img
                    src={step.iconSrc}
                    alt={step.title}
                    className="w-full h-full object-contain"
                  />
                </div>
                <p
                  className="text-white text-center font-bold text-sm"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  {step.title}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
