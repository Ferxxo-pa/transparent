import React from 'react';

export const AnimatedBackground: React.FC = () => (
  <div aria-hidden="true" style={{
    position: 'fixed', inset: 0, overflow: 'hidden',
    zIndex: 0, pointerEvents: 'none',
  }}>
    {/* Purple blob — top left */}
    <div className="ab-blob ab-purple" />
    {/* Lime blob — bottom right */}
    <div className="ab-blob ab-lime" />
    {/* Forest green blob — mid */}
    <div className="ab-blob ab-green" />
    {/* Grain overlay */}
    <div className="ab-grain" />
  </div>
);
