// NFC card tokens and the off-chain credits grant.
// Tokens are HMAC-signed URLs. Credits are a ledger balance, not a mint.

export const CARD_TOKEN_VERSION = 'v1';
/** Starter grant for a player card. Draft tokenomics numbers are not used. */
export const STARTER_CREDITS = 100;

export type CardRole = 'host' | 'player';

export interface CardIdentity {
  id: string;
  serial: string;
  role: CardRole;
}

export interface ClaimRow {
  claimed_by: string | null;
  claimed_at: string | null;
  role: CardRole;
}

export type ClaimDecision =
  | { action: 'grant'; credits: number }
  | { action: 'replay' }
  | { action: 'conflict' };

export function cardSigningPayload(card: CardIdentity): string {
  return `${CARD_TOKEN_VERSION}|${card.id}|${card.role}|${card.serial}`;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function randomCardId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

export async function signCard(card: CardIdentity, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(cardSigningPayload(card)),
  );
  return bytesToBase64Url(new Uint8Array(sig));
}

export function formatCardToken(id: string, signature: string): string {
  return `${id}.${signature}`;
}

export function parseCardToken(token: string): { id: string; signature: string } | null {
  if (!token || token.length > 300) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return null;
  const id = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(id)) return null;
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(signature)) return null;
  return { id, signature };
}

function timingSafeEqual(a: string, b: string): boolean {
  const ae = new TextEncoder().encode(a);
  const be = new TextEncoder().encode(b);
  if (ae.length !== be.length) return false;
  let diff = 0;
  for (let i = 0; i < ae.length; i++) diff |= ae[i]! ^ be[i]!;
  return diff === 0;
}

export async function verifyCardSignature(
  card: CardIdentity,
  signature: string,
  secret: string,
): Promise<boolean> {
  const expected = await signCard(card, secret);
  return timingSafeEqual(expected, signature);
}

/**
 * One claim per card. A retry by the same Privy user is a replay (no second grant).
 * A different user is a conflict. Host cards claim with a zero credit grant.
 */
export function decideClaim(row: ClaimRow, userId: string): ClaimDecision {
  if (row.claimed_at) {
    return row.claimed_by === userId ? { action: 'replay' } : { action: 'conflict' };
  }
  return {
    action: 'grant',
    credits: row.role === 'player' ? STARTER_CREDITS : 0,
  };
}
