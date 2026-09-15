// Shared wallet-signature verification for game Edge Functions.
//
// The client proves wallet identity with an ed25519-signed session token.
// Two message formats are accepted (see src/lib/gameAuth.ts):
//   v1 (game-scoped):   transparent-auth:v1:<gameId>:<wallet>:<issuedAt>:<expiresAt>
//   v2 (action-scoped): transparent-auth:v2:<gameId>:<action>:<wallet>:<issuedAt>:<expiresAt>
// No Supabase Auth exists in this app — Privy Solana wallets ARE the identity —
// so this is the trust root.
//
// Hardening (2026-09-15):
//   - Max token lifetime enforced: a token can never authorize an action more
//     than TOKEN_MAX_LIFETIME_MS after it was issued, regardless of a forged
//     far-future `expiresAt`.
//   - Action binding: destructive endpoints pass expectedAction and require a
//     v2 token whose action claim matches the endpoint.
//   - Replay protection: consumeAuthToken() records a token's signature hash so
//     a replayed destructive token (leave / kick) is rejected on reuse.

import nacl from 'npm:tweetnacl@1.0.3';
import bs58 from 'npm:bs58@5.0.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export interface GameAuthToken {
  message: string;
  signature: string; // base58
  publicKey: string; // base58
}

export interface VerifiedCaller {
  wallet: string;
  action: string | null; // null for legacy v1 (game-scoped) tokens
  issuedAt: number;
  expiresAt: number;
  signature: string; // base58 — used for replay tracking
}

export interface VerifyOptions {
  // When set, requires a v2 action-scoped token whose action claim matches.
  expectedAction?: string;
}

const PREFIX_V1 = 'transparent-auth:v1:';
const PREFIX_V2 = 'transparent-auth:v2:';

// A token must never authorize an action more than this long after it was
// issued. Mirrors the client TOKEN_TTL_MS (4h) plus a small clock-skew margin.
const TOKEN_MAX_LIFETIME_MS = 4 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export function verifyGameAuth(
  auth: GameAuthToken,
  expectedGameId: string,
  opts: VerifyOptions = {},
): VerifiedCaller {
  if (!auth?.message || !auth?.signature || !auth?.publicKey) {
    throw new Error('missing auth token');
  }

  let gameId: string;
  let action: string | null;
  let wallet: string;
  let issuedAtStr: string;
  let expiresAtStr: string;

  if (auth.message.startsWith(PREFIX_V2)) {
    const parts = auth.message.slice(PREFIX_V2.length).split(':');
    if (parts.length !== 5) throw new Error('malformed auth message');
    [gameId, action, wallet, issuedAtStr, expiresAtStr] = parts;
  } else if (auth.message.startsWith(PREFIX_V1)) {
    const parts = auth.message.slice(PREFIX_V1.length).split(':');
    if (parts.length !== 4) throw new Error('malformed auth message');
    [gameId, wallet, issuedAtStr, expiresAtStr] = parts;
    action = null;
  } else {
    throw new Error('malformed auth message');
  }

  if (gameId !== expectedGameId) throw new Error('auth token is for a different game');
  if (wallet !== auth.publicKey) throw new Error('auth token wallet mismatch');

  // Action binding — destructive endpoints require an exact match.
  if (opts.expectedAction !== undefined) {
    if (action === null) {
      throw new Error('auth token is not action-scoped (v2 token required)');
    }
    if (action !== opts.expectedAction) {
      throw new Error('auth token action mismatch');
    }
  }

  const issuedAt = Number(issuedAtStr);
  const expiresAt = Number(expiresAtStr);
  const now = Date.now();
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
    throw new Error('malformed auth timestamps');
  }
  // Small clock-skew allowance on issuedAt.
  if (issuedAt > now + CLOCK_SKEW_MS) throw new Error('auth token issued in the future');
  if (expiresAt < now) throw new Error('auth token expired');
  // Enforce the claimed max lifetime independent of the expiresAt field:
  // even a token carrying a forged far-future expiry dies 4h after issuance,
  // and a token cannot claim a lifetime longer than the allowed maximum.
  if (now - issuedAt > TOKEN_MAX_LIFETIME_MS) {
    throw new Error('auth token exceeded max lifetime');
  }
  if (expiresAt - issuedAt > TOKEN_MAX_LIFETIME_MS + CLOCK_SKEW_MS) {
    throw new Error('auth token lifetime too long');
  }

  const ok = nacl.sign.detached.verify(
    new TextEncoder().encode(auth.message),
    bs58.decode(auth.signature),
    bs58.decode(auth.publicKey),
  );
  if (!ok) throw new Error('invalid signature');

  return { wallet, action, issuedAt, expiresAt, signature: auth.signature };
}

/**
 * Replay guard for destructive actions. Records a hash of the token signature
 * (scoped to game + action) in used_game_tokens. Throws 'auth token already
 * used (replay)' if the same signature is presented again for the same action.
 * Requires the used_game_tokens table from the player RLS lockdown migration.
 */
export async function consumeAuthToken(
  supabase: SupabaseClient,
  caller: VerifiedCaller,
  gameId: string,
  action: string,
): Promise<void> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${gameId}:${action}:${caller.signature}`),
  );
  const tokenHash = bs58.encode(new Uint8Array(digest));

  const { error } = await supabase
    .from('used_game_tokens')
    .insert({ token_hash: tokenHash, game_id: gameId, action, wallet: caller.wallet });

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new Error('auth token already used (replay)');
    }
    throw new Error(error.message);
  }
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
