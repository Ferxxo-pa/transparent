/**
 * Game Auth — wallet-signed session tokens for Supabase Edge Functions
 *
 * There is no Supabase Auth in this app (identity = Privy Solana wallets), so
 * RLS alone cannot know who a caller is. Instead, privileged game mutations
 * (phase advance, settlement) go through Edge Functions that verify an ed25519
 * signature from the caller's wallet, then act with the service role.
 *
 * The token is a signed message:
 *   transparent-auth:v1:<gameId>:<walletBase58>:<issuedAtMs>:<expiresAtMs>
 * It is created once per game per session and cached — no per-action signing.
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

  const issuedAt = Date.now();
  const expiresAt = issuedAt + TOKEN_TTL_MS;
  const wallet = signer.publicKey.toBase58();
  const message = `transparent-auth:v1:${gameId}:${wallet}:${issuedAt}:${expiresAt}`;
  const sigBytes = await signer.signMessage(new TextEncoder().encode(message));

  const token: GameAuthToken = {
    message,
    signature: await encodeBase58(sigBytes),
    publicKey: wallet,
  };
  tokenCache.set(gameId, { token, expiresAt });
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
