// ============================================================
// Environment Configuration
// Keys loaded from .env file (never commit .env to git)
// ============================================================

/** Solana network — 'devnet' for testing, 'mainnet-beta' for production */
export const SOLANA_NETWORK = 'devnet' as const;

/** RPC endpoint for Solana */
export const SOLANA_RPC = import.meta.env.VITE_SOLANA_RPC || 'https://api.devnet.solana.com';

/** Anchor program ID (deployed on devnet) */
export const PROGRAM_ID = '656vXmoQ3oYXdghy1PoVQ2NSzduwWW5XVfjJMqQ1fF44';

/** Supabase project URL */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';

/** Supabase anon (public) key */
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

/** Privy app ID */
export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || '';
