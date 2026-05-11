import React from 'react';

interface TransparentLogoProps {
  className?: string;
  size?: number;
}

/**
 * 4-point concave-pinch sparkle mark.
 * Uses --acid (#C4FF3C) fill on --ink (#0D0D0D) backgrounds.
 */
export const TransparentLogo: React.FC<TransparentLogoProps> = ({
  className = '',
  size = 48,
}) => (
  <div
    className={className}
    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
  >
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      {/* 4-point concave-pinch sparkle */}
      <path
        d="M50 0 C52 38, 62 48, 100 50 C62 52, 52 62, 50 100 C48 62, 38 52, 0 50 C38 48, 48 38, 50 0Z"
        fill="var(--lime, #C4FF3C)"
      />
    </svg>
  </div>
);
