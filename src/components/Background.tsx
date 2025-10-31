import React from 'react';
import backgroundSvg from '../assets/background.svg';

export const Background: React.FC = () => {
  return (
    <div className="fixed inset-0 -z-10 bg-[#322F2F] overflow-hidden">
      <img
        src={backgroundSvg}
        alt="Background"
        className="w-full h-full object-cover"
      />
    </div>
  );
};
