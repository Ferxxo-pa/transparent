import React from 'react';
import logoSvg from '../assets/logo.svg';

export const TransparentLogo: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`relative z-10 flex justify-center ${className}`}>
      <img
        src={logoSvg}
        alt="Transparent"
        className="h-24 w-auto pointer-events-none select-none"
      />
    </div>
  );
};
