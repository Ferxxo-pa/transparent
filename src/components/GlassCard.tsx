import React, { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, className = '' }) => {
  return (
    <div
      className={`relative backdrop-blur-md bg-white/5 rounded-[77.92px] p-8 shadow-[inset_10px_10px_2px_-11px_rgba(255,255,255,0.5),inset_6px_6px_3px_-6px_#B3B3B3,inset_-6px_-6px_3px_-6px_#B3B3B3,inset_0_0_0_3px_#999999,inset_0_0_71px_rgba(242,242,242,0.5)] ${className}`}
    >
      {children}
    </div>
  );
};
