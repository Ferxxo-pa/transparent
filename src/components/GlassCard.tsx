import React, { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'strong' | 'flat';
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  variant = 'default',
}) => {
  const variantClass =
    variant === 'strong' ? 'glass glass-strong' :
    variant === 'flat' ? 'glass-flat' :
    'glass';

  return (
    <div
      className={`${variantClass} ${className}`}
      style={{
        padding: 20,
        width: '100%',
        position: 'relative',
      }}
    >
      {children}
    </div>
  );
};
