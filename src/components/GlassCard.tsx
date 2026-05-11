import React, { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'strong' | 'flat';
}

const VARIANT_STYLES: Record<string, React.CSSProperties> = {
  default: {
    background: 'var(--glass)',
    backdropFilter: 'var(--blur)',
    WebkitBackdropFilter: 'var(--blur)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r)',
  },
  strong: {
    background: 'var(--glass-heavy)',
    backdropFilter: 'var(--blur)',
    WebkitBackdropFilter: 'var(--blur)',
    border: '1px solid var(--border-2)',
    borderRadius: 'var(--r)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
  },
  flat: {
    background: 'var(--glass)',
    backdropFilter: 'var(--blur-sm)',
    WebkitBackdropFilter: 'var(--blur-sm)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)',
  },
};

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  variant = 'default',
}) => {
  return (
    <div
      className={className}
      style={{
        padding: 20,
        width: '100%',
        position: 'relative',
        ...VARIANT_STYLES[variant],
      }}
    >
      {children}
    </div>
  );
};
