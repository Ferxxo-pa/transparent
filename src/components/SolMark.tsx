import React from 'react';

interface SolMarkProps {
  size?: number;
  tone?: 'ink' | 'dark';
}

export const SolMark: React.FC<SolMarkProps> = ({ size = 20, tone = 'ink' }) => {
  const fill = tone === 'dark' ? '#0D0D0D' : '#F4F4F2';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 397.7 311.7"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    >
      <path
        d="M64.6 3.17C67.1 1.17 70.2 0 73.5 0h315c5.7 0 8.6 6.9 4.6 10.9l-56.4 56.8c-2.5 2.5-5.9 3.9-9.5 3.9H12.1c-5.7 0-8.6-6.9-4.6-10.9L64.6 3.17z"
        fill={fill}
      />
      <path
        d="M64.6 245.1c2.5-2.5 5.9-3.9 9.5-3.9h315c5.7 0 8.6 6.9 4.6 10.9l-56.4 56.8c-2.5 2.5-5.9 3.9-9.5 3.9H12.1c-5.7 0-8.6-6.9-4.6-10.9l57.1-56.8z"
        fill={fill}
      />
      <path
        d="M333.1 124.1c-2.5-2.5-5.9-3.9-9.5-3.9H8.6c-5.7 0-8.6 6.9-4.6 10.9l56.4 56.8c2.5 2.5 5.9 3.9 9.5 3.9h315c5.7 0 8.6-6.9 4.6-10.9l-56.4-56.8z"
        fill={fill}
      />
    </svg>
  );
};
