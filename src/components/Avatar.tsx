import React from 'react';

interface AvatarProps {
  emoji: string;
  color: string;
  size?: number;
  dim?: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({
  emoji,
  color,
  size = 40,
  dim = false,
}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: color,
      border: `2px solid ${color}`,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.5,
      lineHeight: 1,
      flexShrink: 0,
      opacity: dim ? 0.4 : 1,
      transition: 'opacity 0.2s ease',
      userSelect: 'none',
    }}
    role="img"
    aria-label={`Player avatar ${emoji}`}
  >
    {emoji}
  </div>
);
