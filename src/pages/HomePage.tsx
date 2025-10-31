import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TransparentLogo } from '../components/TransparentLogo';
import { GlassCard } from '../components/GlassCard';
import { GlowButton } from '../components/GlowButton';
import addIcon from '../assets/Add.svg';
import starIcon from '../assets/Star.png';
import groupIcon from '../assets/Group icon.png';
import moneyIcon from '../assets/money icon.png';
import handIcon from '../assets/hand icon.png';
import messageIcon from '../assets/message icon.png';
import moneyBagIcon from '../assets/money bag icon.png';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();

  const howToPlaySteps = [
    { number: 1, iconSrc: groupIcon, title: 'Host or Join' },
    { number: 2, iconSrc: moneyIcon, title: 'Buy-In' },
    { number: 3, iconSrc: handIcon, title: 'Hot Seat' },
    { number: 4, iconSrc: messageIcon, title: 'Vote' },
    { number: 5, iconSrc: handIcon, title: 'Hold or Fold' },
    { number: 6, iconSrc: moneyBagIcon, title: 'Winner Takes All' },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 py-6">
      {/* Login Button */}
      <button
        onClick={() => navigate('/login')}
        className="absolute top-10 right-10 backdrop-blur-md bg-black/80 text-white px-6 py-2 rounded-full hover:bg-black/90 transition-all font-['Plus_Jakarta_Sans']"
      >
        Login
      </button>

      {/* LOGO — bounding box fix */}
      <div className="relative flex flex-col items-center w-full">
        {/* Removes that hidden empty space below the PNG */}
        <div className="-mb-[113px] leading-none">
          <TransparentLogo className="block" />
        </div>

        {/* Buttons below logo */}
        <div className="w-full max-w-4xl relative z-10">
          <div className="flex gap-8 justify-center">
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
      </div>

      {/* HOW TO PLAY section */}
      <div className="w-full max-w-5xl mt-[69px]">
        <h2
          className="text-white/70 text-3xl text-center mb-6"
          style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
        >
          HOW TO PLAY
        </h2>

        <div className="grid grid-cols-6 gap-6">
          {howToPlaySteps.map((step) => (
            <div key={step.number} className="flex flex-col items-center gap-2">
              <div
                className="text-white text-xs font-bold"
                style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
              >
                {step.number}.
              </div>
              <div className="w-14 h-14 flex items-center justify-center">
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
  );
};
