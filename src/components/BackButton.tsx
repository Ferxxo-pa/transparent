import React from 'react';

interface BackButtonProps {
  onClick: () => void;
}

export const BackButton: React.FC<BackButtonProps> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="glass-flat"
    aria-label="Go back"
    style={{
      width: 40,
      height: 40,
      borderRadius: 20,
      cursor: 'pointer',
      display: 'grid',
      placeItems: 'center',
      color: 'var(--ink)',
      fontSize: 18,
      fontFamily: 'inherit',
      fontWeight: 700,
      padding: 0,
      flexShrink: 0,
    }}
  >
    ←
  </button>
);
