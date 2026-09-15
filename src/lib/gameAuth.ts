/**
 * Game Auth — wallet-signed session tokens for Supabase Edge Functions
 *
 * There is no Supabase Auth in this app (identity = Privy Solana wallets), so
 * RLS alone cannot know who a caller is. Instead, privileged game mutations
 * (phase advance, settlement) go through Edge Functions that verify an ed25519
 * signature from the caller's wallet, then act with the service role.
 *
 * The token is a signed message. Two formats:
 *   v1 (game-scoped):   transparent-auth:v1:<gameId>:<wallet>:<issuedAt>:<expiresAt>
 *   v2 (action-scoped): transparent-auth:v2:<gameId>:<action>:<wallet>:<issuedAt>:<expiresAt>
 * Game-scoped tokens are cached per game (advance-phase / settle-game). Action
 * tokens bind to a specific endpoint. Destructive actions (leave) mint a fresh,
 * single-use token every call so the server's replay guard can reject reuse.
 */

import { PublicKey } from '@solana/web3.js';
import { SUPABASE_FUNCTIONS_URL, SUPABASE_ANON_KEY } from './config';

const TOKEN_TTL_MS = 4 * 60 * 60 * 1000; // 4h — longer than any party game
const TOKEN_REFRESH_MARGIN_MS = 10 * 60 * 1000;

export interface GameAuthToken {
  message: string;
  signature: string; // base58
  publicKey: string; // base58
}

interface Signer {
  publicKey: PublicKey;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
}

let signer: Signer | null = null;
const tokenCache = new Map<string, { token: GameAuthToken; expiresAt: number }>();

/** Wire the active wallet in (GameContext calls this alongside setWalletAdapter). */
export function setGameAuthSigner(s: Signer | null) {
  if (!s || !signer || !signer.publicKey.equals(s.publicKey)) {
    tokenCache.clear();
  }
  signer = s;
}

async function encodeBase58(bytes: Uint8Array): Promise<string> {
  const bs58 = (await import('bs58')).default;
  return bs58.encode(bytes);
}

/** Get (or mint) a signed session token proving wallet identity for a game. */
export async function getGameAuthToken(gameId: string): Promise<GameAuthToken> {
  if (!signer) throw new Error('No wallet connected — cannot authorize game action');
  if (!signer.signMessage) throw new Error('Connected wallet cannot sign messages');

  const cached = tokenCache.get(gameId);
  if (cached && cached.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) {
    return cached.token;
  }

  return mintToken(gameId);
}

/** Low-level: sign a v1 (game-scoped) token and cache it. */
async function mintToken(gameId: string): Promise<GameAuthToken> {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + TOKEN_TTL_MS;
  const wallet = signer!.publicKey.toBase58();
  const message = `transparent-auth:v1:${gameId}:${wallet}:${issuedAt}:${expiresAt}`;
  const sigBytes = await signer!.signMessage!(new TextEncoder().encode(message));

  const token: GameAuthToken = {
    message,
    signature: await encodeBase58(sigBytes),
    publicKey: wallet,
  };
  tokenCache.set(gameId, { token, expiresAt });
  return token;
}

/**
 * Get (or mint) a v2 action-scoped token bound to a specific endpoint.
 * Pass fresh=true for destructive/single-use actions (leave, pay) so a new
 * signature is produced every call and the server's replay guard works.
 */
export async function getActionToken(
  gameId: string,
  action: string,
  fresh = false,
): Promise<GameAuthToken> {
  if (!signer) throw new Error('No wallet connected — cannot authorize game action');
  if (!signer.signMessage) throw new Error('Connected wallet cannot sign messages');

  const cacheKey = `${gameId}:${action}`;
  if (!fresh) {
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) {
      return cached.token;
    }
  }

  const issuedAt = Date.now();
  const expiresAt = issuedAt + TOKEN_TTL_MS;
  const wallet = signer.publicKey.toBase58();
  const message = `transparent-auth:v2:${gameId}:${action}:${wallet}:${issuedAt}:${expiresAt}`;
  const sigBytes = await signer.signMessage(new TextEncoder().encode(message));

  const token: GameAuthToken = {
    message,
    signature: await encodeBase58(sigBytes),
    publicKey: wallet,
  };
  if (!fresh) tokenCache.set(cacheKey, { token, expiresAt });
  return token;
}

async function callEdgeFunction<T>(name: string, body: unknown): Promise<T> {
  if (!SUPABASE_FUNCTIONS_URL) throw new Error('Supabase Functions URL not configured');
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as { error?: string }).error || `${name} failed (${res.status})`);
  }
  return json as T;
}

/** Apply a protected game update (phase/status/round) via the advance-phase function. */
export async function advancePhaseViaEdge(
  gameId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const auth = await getGameAuthToken(gameId);
  await callEdgeFunction('advance-phase', { gameId, updates, auth });
}

export interface SettleRequest {
  gameId: string;
  action: 'distribute' | 'settle_predictions';
  /** lamports per recipient wallet — required for action=distribute */
  payouts?: Record<string, number>;
}

export interface SettleResponse {
  ok: boolean;
  signatures?: string[];
  error?: string;
}

/** Ask the settle-game function to validate + trigger on-chain distribution. */
export async function settleGameViaEdge(req: SettleRequest): Promise<SettleResponse> {
  const auth = await getGameAuthToken(req.gameId);
  return callEdgeFunction<SettleResponse>('settle-game', { ...req, auth });
}

export interface JoinGameResponse {
  ok: boolean;
  player?: { id: string; game_id: string; wallet_address: string; display_name: string; has_paid: boolean; is_ready: boolean };
  error?: string;
}

export async function joinGameViaEdge(gameId: string, displayName?: string): Promise<JoinGameResponse> {
  const auth = await getActionToken(gameId, 'join');
  return callEdgeFunction<JoinGameResponse>('join-game', { gameId, displayName, auth });
}

export async function readyUpViaEdge(gameId: string): Promise<{ ok: boolean; already?: boolean; error?: string }> {
  const auth = await getActionToken(gameId, 'ready');
  return callEdgeFunction('ready-up-player', { gameId, auth });
}

export async function leaveGameViaEdge(gameId: string, targetWallet?: string): Promise<{ ok: boolean; hostLeft?: boolean; error?: string }> {
  // Destructive + single-use: always mint a fresh 'leave' token.
  const auth = await getActionToken(gameId, 'leave', true);
  return callEdgeFunction('leave-game', { gameId, auth, ...(targetWallet ? { targetWallet } : {}) });
}

export interface VerifyPaymentResponse {
  ok: boolean;
  player?: { id: string; game_id: string; wallet_address: string; has_paid: boolean; is_ready: boolean };
  free?: boolean;
  error?: string;
}

/**
 * Confirm an on-chain buy-in payment. The server independently verifies the
 * transaction moved buy_in_lamports into the escrow before flipping has_paid.
 * txSignature is optional for free games.
 */
export async function verifyPaymentViaEdge(
  gameId: string,
  txSignature?: string,
): Promise<VerifyPaymentResponse> {
  const auth = await getActionToken(gameId, 'pay', true);
  return callEdgeFunction<VerifyPaymentResponse>('verify-payment', { gameId, auth, txSignature });
}
