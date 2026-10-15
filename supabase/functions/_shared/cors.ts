// Pure CORS allowlist. Never emits '*'.
// ALLOWED_ORIGINS is a comma-separated list of exact origins (scheme + host + port).

const DEFAULT_ORIGINS = [
  'https://transparent-five.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

export function parseAllowlist(allowlistCsv: string | undefined | null): Set<string> {
  const fromEnv = (allowlistCsv ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '*');
  return new Set(fromEnv.length > 0 ? fromEnv : DEFAULT_ORIGINS);
}

/** Returns the origin to reflect, or null when the request origin is not allowed. */
export function resolveAllowOrigin(
  origin: string | null | undefined,
  allowlistCsv: string | undefined | null,
): string | null {
  if (!origin) return null;
  const allowed = parseAllowlist(allowlistCsv);
  return allowed.has(origin) ? origin : null;
}

export function corsHeadersFor(
  origin: string | null | undefined,
  allowlistCsv: string | undefined | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-privy-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  const allowed = resolveAllowOrigin(origin, allowlistCsv);
  if (allowed) headers['Access-Control-Allow-Origin'] = allowed;
  return headers;
}
