import React, { ReactNode } from 'react';

interface GlowButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'green' | 'purple' | 'black' | 'neon' | 'degen' | 'ghost';
  className?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
}

export const GlowButton: React.FC<GlowButtonProps> = ({
  children,
  onClick,
  variant = 'green',
  className = '',
  type = 'button',
  disabled = false,
}) => {
  const baseStyles = `relative backdrop-blur-md rounded-[78px] px-12 py-4 font-bold text-lg transition-all duration-300 hover:scale-105 cursor-pointer shadow-[inset_10px_10px_2px_-11px_rgba(255,255,255,0.5),inset_6px_6px_3px_-6px_#B3B3B3,inset_-6px_-6px_3px_-6px_#B3B3B3,inset_0_0_0_3px_#999999,inset_0_0_71px_rgba(242,242,242,0.5)]`;

  const variantStyles = {
    green: 'bg-[#BFFB4F]/40 text-[#9383D4] hover:bg-[#BFFB4F]/50 hover:shadow-[0_0_30px_#BFFB4F,0_0_60px_#BFFB4F,inset_10px_10px_2px_-11px_rgba(255,255,255,0.5),inset_6px_6px_3px_-6px_#B3B3B3,inset_-6px_-6px_3px_-6px_#B3B3B3,inset_0_0_0_3px_#999999,inset_0_0_71px_rgba(242,242,242,0.5)]',
    purple: 'bg-[#664FFB]/40 text-[#BFFB4F] hover:bg-[#664FFB]/50 hover:shadow-[0_0_30px_#664FFB,0_0_60px_#664FFB,inset_10px_10px_2px_-11px_rgba(255,255,255,0.5),inset_6px_6px_3px_-6px_#B3B3B3,inset_-6px_-6px_3px_-6px_#B3B3B3,inset_0_0_0_3px_#999999,inset_0_0_71px_rgba(242,242,242,0.5)]',
    black: 'bg-black/80 text-white hover:bg-black/90 hover:shadow-[0_0_30px_rgba(255,255,255,0.5),0_0_60px_rgba(255,255,255,0.3)]',
    neon: 'bg-[#664FFB]/40 text-[#BFFB4F] shadow-[0_0_20px_#BFFB4F,0_0_40px_#BFFB4F,0_0_60px_#BFFB4F,inset_10px_10px_2px_-11px_rgba(255,255,255,0.5),inset_6px_6px_3px_-6px_#B3B3B3,inset_-6px_-6px_3px_-6px_#B3B3B3,inset_0_0_0_3px_#999999,inset_0_0_71px_rgba(242,242,242,0.5)] hover:bg-[#664FFB]/50 hover:shadow-[0_0_30px_#BFFB4F,0_0_50px_#BFFB4F,0_0_80px_#BFFB4F,0_0_100px_#BFFB4F,inset_10px_10px_2px_-11px_rgba(255,255,255,0.5),inset_6px_6px_3px_-6px_#B3B3B3,inset_-6px_-6px_3px_-6px_#B3B3B3,inset_0_0_0_3px_#999999,inset_0_0_71px_rgba(242,242,242,0.5)]',
    degen: 'bg-[#C4FF3C] text-[#0D0D0D] hover:opacity-90 shadow-[0_0_18px_rgba(196,255,60,0.22),0_0_48px_rgba(196,255,60,0.07)] hover:shadow-[0_0_28px_rgba(196,255,60,0.32),0_0_64px_rgba(196,255,60,0.12)]',
    ghost: 'bg-white/4 backdrop-blur-md text-[#F4F4F2] border border-white/8 hover:border-white/14 hover:bg-white/7',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
    >
      {children}
    </button>
  );
};
