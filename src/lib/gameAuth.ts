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

/**
 * Thrown when an edge function responds with a non-2xx status. Unlike a plain
 * Error, this carries the parsed response body — callers that need to
 * reconcile settlement state (e.g. after a 500 mid-payout) must inspect
 * `body.signatures` / `body.remaining` rather than treating the failure as
 * "nothing happened".
 */
export class EdgeFunctionError extends Error {
  status: number;
  body: any;
  constructor(message: string, status: number, body: any) {
    super(message);
    this.name = 'EdgeFunctionError';
    this.status = status;
    this.body = body;
  }
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
    throw new EdgeFunctionError(
      (json as { error?: string }).error || `${name} failed (${res.status})`,
      res.status,
      json,
    );
  }
  return json as T;
}

/** Sig record shape written by settle-game / retry-settlement. */
export interface SigRecord {
  sig: string;
  status: 'submitted' | 'confirmed' | 'failed' | 'unknown';
}

/**
 * Normalize inbound paid_tx_signatures data into typed records. DB rows may
 * still hold the legacy bare-string format (`{wallet: "sig"}`); those are
 * conservatively mapped to status 'unknown' since we can't tell if they
 * landed on-chain without a lookup. Client code must call this on any
 * signature map (from a DB read or an edge response) before comparing
 * against or merging into it — writing an un-normalized map back can
 * silently drop or misclassify records.
 */
export function normalizeSigRecords(raw: unknown): Record<string, SigRecord> {
  const out: Record<string, SigRecord> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [wallet, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof val === 'string') {
      out[wallet] = { sig: val, status: 'unknown' };
    } else if (val && typeof val === 'object' && 'sig' in (val as any)) {
      out[wallet] = val as SigRecord;
    }
  }
  return out;
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
  /**
   * True only when every payout in the request is confirmed on-chain.
   * `ok: true` alone does NOT mean settled — a 200 response can still carry
   * `settled: false` with a `remaining` map when some recipients are still
   * owed. Callers must branch on `settled`, not on the call not throwing.
   */
  settled?: boolean;
  signatures?: Record<string, SigRecord>;
  remaining?: Record<string, number>;
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

export interface RetrySettlementResponse {
  ok: boolean;
  settled: boolean;
  signatures: Record<string, SigRecord>;
  remaining?: Record<string, number>;
  error?: string;
}

export async function retrySettlementViaEdge(gameId: string): Promise<RetrySettlementResponse> {
  const auth = await getActionToken(gameId, 'settle', true);
  return callEdgeFunction<RetrySettlementResponse>('retry-settlement', { gameId, auth });
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

export async function submitQuestionViaEdge(
  gameId: string,
  round: number,
  questionText: string,
): Promise<{ question: { id: string; game_id: string; round: number; submitter_wallet: string; question_text: string; votes: number; created_at: string } }> {
  const auth = await getGameAuthToken(gameId);
  return callEdgeFunction('submit-question', { gameId, round, questionText, auth });
}
