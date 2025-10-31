import React from 'react';
import transparentLogo from '../assets/transparent logo copy copy.png';

export const TransparentLogo: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`leading-none ${className}`}>
      <img
        src={transparentLogo}
        alt="Transparent"
        className="block w-full h-auto select-none pointer-events-none align-bottom"
      />
    </div>
  );
};
