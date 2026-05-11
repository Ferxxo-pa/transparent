import React from 'react';

const TONES: Record<string, string> = {
  ink: '#F4F4F2',
  acid: '#C4FF3C',
  pink: '#FF3B8B',
  azure: '#4DA8FF',
  tangerine: '#FF8A2A',
  dark: '#0D0D0D',
};

interface SolMarkProps {
  size?: number;
  tone?: 'ink' | 'acid' | 'pink' | 'azure' | 'tangerine' | 'dark';
}

export const SolMark: React.FC<SolMarkProps> = ({ size = 20, tone = 'ink' }) => {
  const fill = TONES[tone] ?? TONES.ink;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 397.7 311.7"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    >
      {/* Top parallelogram */}
      <path
        d="M64.6 3.8C65.9 1.4 68.4 0 71.1 0h317.4c4.5 0 7.2 5 4.7 8.8L355.8 54c-1.3 2-3.5 3.2-5.9 3.2H31.2c-4.8 0-7.3-5.7-4.1-9.1L64.6 3.8z"
        fill={fill}
      />
      {/* Middle parallelogram */}
      <path
        d="M64.6 124.4c1.3-2.4 3.8-3.8 6.5-3.8h317.4c4.5 0 7.2 5 4.7 8.8l-37.4 45.2c-1.3 2-3.5 3.2-5.9 3.2H31.2c-4.8 0-7.3-5.7-4.1-9.1l37.5-44.3z"
        fill={fill}
      />
      {/* Bottom parallelogram */}
      <path
        d="M333.1 307.9c-1.3 2.4-3.8 3.8-6.5 3.8H9.2c-4.5 0-7.2-5-4.7-8.8l37.4-45.2c1.3-2 3.5-3.2 5.9-3.2h318.7c4.8 0 7.3 5.7 4.1 9.1l-37.5 44.3z"
        fill={fill}
      />
    </svg>
  );
};
