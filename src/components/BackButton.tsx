import React from 'react';

interface BackButtonProps {
  onClick: () => void;
}

export const BackButton: React.FC<BackButtonProps> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="Go back"
    style={{
      width: 40,
      height: 40,
      borderRadius: '50%',
      background: 'var(--glass)',
      backdropFilter: 'var(--blur-sm)',
      WebkitBackdropFilter: 'var(--blur-sm)',
      border: '1px solid var(--border)',
      color: 'var(--muted)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      transition: 'color 0.15s, border-color 0.15s',
      padding: 0,
      flexShrink: 0,
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.color = 'var(--text)';
      e.currentTarget.style.borderColor = 'var(--border-2)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.color = 'var(--muted)';
      e.currentTarget.style.borderColor = 'var(--border)';
    }}
  >
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M11 4L6 9L11 14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </button>
);
