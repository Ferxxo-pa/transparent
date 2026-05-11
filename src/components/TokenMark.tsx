import React from 'react';
import { SolMark } from './SolMark';
import { useSolPrice, solToUsd } from '../hooks/useSolPrice';

/* ─── Token Registry ───────────────────────────────────── */

export interface TokenDef {
  id: string;
  name: string;
  symbol: string;
  emoji?: string;
  /** USD rate for non-SOL tokens (rough estimate, updated manually) */
  rate?: number;
  /** Common buy-in presets for this token */
  presets: number[];
}

export const TOKENS: Record<string, TokenDef> = {
  sol: {
    id: 'sol',
    name: 'Solana',
    symbol: 'SOL',
    presets: [0.01, 0.05, 0.1, 0.25, 0.5, 1],
  },
  bonk: {
    id: 'bonk',
    name: 'Bonk',
    symbol: 'BONK',
    emoji: '\uD83D\uDC36',
    rate: 0.000015,
    presets: [50000, 100000, 500000, 1000000],
  },
  wif: {
    id: 'wif',
    name: 'dogwifhat',
    symbol: 'WIF',
    emoji: '\uD83D\uDC15',
    rate: 0.62,
    presets: [1, 5, 10, 25, 50],
  },
  popcat: {
    id: 'popcat',
    name: 'Popcat',
    symbol: 'POPCAT',
    emoji: '\uD83D\uDC31',
    rate: 0.35,
    presets: [5, 10, 25, 50, 100],
  },
  pengu: {
    id: 'pengu',
    name: 'Pudgy Penguins',
    symbol: 'PENGU',
    emoji: '\uD83D\uDC27',
    rate: 0.012,
    presets: [100, 500, 1000, 5000],
  },
};

export const TOKEN_LIST: TokenDef[] = Object.values(TOKENS);

/* ─── Utility Functions ────────────────────────────────── */

/** Parse amount strings like "100k", "5M", "0.05", "Free" into numbers */
export function parseAmt(raw: string): number {
  if (!raw) return 0;
  const s = raw.trim().toLowerCase();
  if (s === 'free' || s === '0') return 0;

  const multipliers: Record<string, number> = { k: 1_000, m: 1_000_000, b: 1_000_000_000 };
  const match = s.match(/^([0-9]*\.?[0-9]+)\s*([kmb])?$/);
  if (!match) return parseFloat(s) || 0;

  const num = parseFloat(match[1]);
  const mult = match[2] ? multipliers[match[2]] : 1;
  return num * mult;
}

/** Estimate USD value for any supported token amount */
export function usdEstimate(
  amount: number,
  tokenId: string,
  solPrice: number | null,
): string {
  if (amount <= 0) return '';
  const token = TOKENS[tokenId];
  if (!token) return '';

  if (tokenId === 'sol') {
    return solToUsd(amount, solPrice);
  }

  if (token.rate) {
    const usd = amount * token.rate;
    if (usd < 0.01) return '';
    if (usd < 1) return `~$${usd.toFixed(2)}`;
    return `~$${usd.toFixed(2)}`;
  }

  return '';
}

/* ─── TokenMark Component ──────────────────────────────── */

interface TokenMarkProps {
  token: string;
  size?: number;
}

export const TokenMark: React.FC<TokenMarkProps> = ({ token, size = 20 }) => {
  const t = TOKENS[token.toLowerCase()];
  if (!t) return null;

  if (token.toLowerCase() === 'sol') {
    return <SolMark size={size} tone="acid" />;
  }

  return (
    <span
      style={{
        fontSize: size * 0.9,
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
      }}
      role="img"
      aria-label={t.name}
    >
      {t.emoji}
    </span>
  );
};

/* ─── UsdTag Component ─────────────────────────────────── */

interface UsdTagProps {
  amount: number;
  token: string;
  className?: string;
}

export const UsdTag: React.FC<UsdTagProps> = ({ amount, token, className = '' }) => {
  const solPrice = useSolPrice();
  const est = usdEstimate(amount, token, solPrice);

  if (!est) return null;

  return (
    <span
      className={className}
      style={{
        fontSize: 12,
        fontWeight: 500,
        color: 'var(--muted)',
        letterSpacing: '-0.01em',
      }}
    >
      {est}
    </span>
  );
};
