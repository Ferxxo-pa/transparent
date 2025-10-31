import React from 'react';
import transparentLogo from '../assets/trans 3.png';

export const TransparentLogo: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`relative -mb-[150px] z-10 ${className}`}>
      <img
        src={transparentLogo}
        alt="Transparent"
        className="w-full h-auto pointer-events-none select-none"
        style={{
          maxWidth: '1440px',
          margin: '0 auto',
          display: 'block',
        }}
      />
    </div>
  );
};
