import React from 'react';

// Warm dark background — matches new design system
export const Background: React.FC = () => {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -10,
        background: '#131110',
        backgroundImage: `
          radial-gradient(ellipse at 15% 40%, rgba(90, 65, 30, 0.22) 0%, transparent 55%),
          radial-gradient(ellipse at 85% 70%, rgba(50, 35, 15, 0.18) 0%, transparent 55%)
        `,
      }}
    />
  );
};
