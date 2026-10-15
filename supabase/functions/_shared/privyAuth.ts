// Verify a Privy access token (ES256) with the app's JWKS.
// The Supabase gateway still sees the anon key. The Privy token arrives in
// x-privy-token so it is not confused with the Supabase JWT.

interface Jwk {
  kty: string;
  crv?: string;
  x?: string;
  y?: string;
  kid?: string;
  alg?: string;
  use?: string;
}

interface Jwks {
  keys: Jwk[];
}

const jwksCache = new Map<string, { keys: Jwks; fetchedAt: number }>();
const JWKS_TTL_MS = 10 * 60 * 1000;

function b64urlToBytes(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToJson(input: string): Record<string, unknown> {
  const text = new TextDecoder().decode(b64urlToBytes(input));
  return JSON.parse(text) as Record<string, unknown>;
}

async function fetchJwks(appId: string): Promise<Jwks> {
  const cached = jwksCache.get(appId);
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;
  const res = await fetch(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`);
  if (!res.ok) throw new Error('privy jwks unavailable');
  const keys = (await res.json()) as Jwks;
  if (!keys?.keys?.length) throw new Error('privy jwks empty');
  jwksCache.set(appId, { keys, fetchedAt: Date.now() });
  return keys;
}

export async function verifyPrivyAccessToken(
  token: string,
  appId: string,
): Promise<{ userId: string }> {
  if (!appId) throw new Error('PRIVY_APP_ID is not configured');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed privy token');
  const [h, p, s] = parts as [string, string, string];
  const header = b64urlToJson(h);
  const payload = b64urlToJson(p);
  if (header.alg !== 'ES256') throw new Error('unexpected privy token alg');

  const iss = payload.iss;
  const allowedIss = new Set(['privy.io', 'https://privy.io', 'https://auth.privy.io']);
  if (typeof iss !== 'string' || !allowedIss.has(iss)) throw new Error('unexpected privy issuer');
  if (payload.aud !== appId) throw new Error('privy token audience mismatch');

  const exp = payload.exp;
  if (typeof exp !== 'number' || exp * 1000 < Date.now() - 30_000) throw new Error('privy token expired');
  const sub = payload.sub;
  if (typeof sub !== 'string' || !sub.startsWith('did:privy:')) throw new Error('unexpected privy subject');

  const jwks = await fetchJwks(appId);
  const jwk = jwks.keys.find((key) => !header.kid || key.kid === header.kid) ?? jwks.keys[0];
  if (!jwk) throw new Error('privy signing key not found');

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    b64urlToBytes(s),
    new TextEncoder().encode(`${h}.${p}`),
  );
  if (!ok) throw new Error('invalid privy signature');
  return { userId: sub };
}
