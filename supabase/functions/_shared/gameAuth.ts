// Shared wallet-signature verification for game Edge Functions.
//
// The client proves wallet identity with an ed25519-signed session token:
//   transparent-auth:v1:<gameId>:<walletBase58>:<issuedAtMs>:<expiresAtMs>
// (see src/lib/gameAuth.ts). No Supabase Auth exists in this app — Privy
// Solana wallets ARE the identity — so this is the trust root.

import nacl from 'npm:tweetnacl@1.0.3';
import bs58 from 'npm:bs58@5.0.0';
import { corsHeadersFor } from './cors.ts';

export interface GameAuthToken {
  message: string;
  signature: string; // base58
  publicKey: string; // base58
}

export interface VerifiedCaller {
  wallet: string;
}

const MESSAGE_PREFIX = 'transparent-auth:v1:';

export function verifyGameAuth(auth: GameAuthToken, expectedGameId: string): VerifiedCaller {
  if (!auth?.message || !auth?.signature || !auth?.publicKey) {
    throw new Error('missing auth token');
  }
  if (!auth.message.startsWith(MESSAGE_PREFIX)) {
    throw new Error('malformed auth message');
  }

  const parts = auth.message.slice(MESSAGE_PREFIX.length).split(':');
  if (parts.length !== 4) throw new Error('malformed auth message');
  const [gameId, wallet, issuedAtStr, expiresAtStr] = parts;

  if (gameId !== expectedGameId) throw new Error('auth token is for a different game');
  if (wallet !== auth.publicKey) throw new Error('auth token wallet mismatch');

  const issuedAt = Number(issuedAtStr);
  const expiresAt = Number(expiresAtStr);
  const now = Date.now();
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
    throw new Error('malformed auth timestamps');
  }
  // Small clock-skew allowance on issuedAt.
  if (issuedAt > now + 5 * 60 * 1000) throw new Error('auth token issued in the future');
  if (expiresAt < now) throw new Error('auth token expired');

  const ok = nacl.sign.detached.verify(
    new TextEncoder().encode(auth.message),
    bs58.decode(auth.signature),
    bs58.decode(auth.publicKey),
  );
  if (!ok) throw new Error('invalid signature');

  return { wallet };
}

/** Browser CORS for this request. Reflects ALLOWED_ORIGINS and never '*'. */
export function corsHeadersForRequest(req: Request): Record<string, string> {
  return corsHeadersFor(req.headers.get('origin'), Deno.env.get('ALLOWED_ORIGINS'));
}

export function jsonResponse(
  body: unknown,
  status = 200,
  cors: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
