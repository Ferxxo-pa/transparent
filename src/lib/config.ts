// ============================================================
// Environment Configuration
// Keys loaded from .env file (never commit .env to git)
// ============================================================

/** Solana network — 'devnet' for testing, 'mainnet-beta' for production */
export const SOLANA_NETWORK = 'devnet' as const;

/** RPC endpoint for Solana */
export const SOLANA_RPC = import.meta.env.VITE_SOLANA_RPC || 'https://api.devnet.solana.com';

/** MagicBlock Ephemeral Rollups — Magic Router endpoint (devnet)
 *  Routes game transactions through Ephemeral Rollups for faster confirmations.
 *  Falls back to standard Solana RPC if unavailable. */
export const MAGICBLOCK_ROUTER = import.meta.env.VITE_MAGICBLOCK_ROUTER || 'https://devnet-router.magicblock.app';
export const MAGICBLOCK_WS = import.meta.env.VITE_MAGICBLOCK_WS || 'wss://devnet-router.magicblock.app';

/** Anchor escrow program ID (deployed on devnet) */
export const PROGRAM_ID = '2zPLNqsyqXNxaMkzWUMh1ZcbJBR3Jr2bTky1FFaZVuF9';

/** Supabase project URL */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';

/** Supabase anon (public) key */
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

/** Privy app ID */
export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || '';
