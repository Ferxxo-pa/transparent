// Pure validation helpers for generate-questions.
// No Deno-specific imports — safe to import from Node.js test runners.

export const VALID_VIBES = [
  'college', 'coworkers', 'couples', 'new_friends', 'family', 'chaos',
] as const;
export type Vibe = (typeof VALID_VIBES)[number];

export const VALID_SPICE_LEVELS = [0.5, 0.75, 1.0] as const;
export type SpiceLevel = (typeof VALID_SPICE_LEVELS)[number];

export const CONTEXT_MAX_LEN = 500;
export const RATE_LIMIT_PER_MINUTE = 5;

export const ALLOWED_ORIGINS = new Set([
  'https://transparent-five.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]);

// Strip ASCII control chars except \t (0x09) and \n (0x0a)
const CONTROL_CHARS_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
// Common prompt-injection markers
const INJECTION_RE = /ignore\s+previous\s+instructions|system\s*:|```|<\|/gi;

export function validateVibe(vibe: unknown): Vibe {
  if (!VALID_VIBES.includes(vibe as Vibe)) {
    throw Object.assign(new Error('invalid vibe'), { status: 400 });
  }
  return vibe as Vibe;
}

export function validateSpiceLevel(level: unknown): SpiceLevel {
  if (!VALID_SPICE_LEVELS.includes(level as SpiceLevel)) {
    throw Object.assign(new Error('invalid spiceLevel'), { status: 400 });
  }
  return level as SpiceLevel;
}

export function validateContextLength(context: unknown): void {
  if (typeof context === 'string' && context.length > CONTEXT_MAX_LEN) {
    throw Object.assign(
      new Error(`context too long (max ${CONTEXT_MAX_LEN} chars)`),
      { status: 400 },
    );
  }
}

// Strip control chars and obvious injection markers; returns sanitized string.
export function sanitizeContext(context: string): string {
  return context
    .replace(CONTROL_CHARS_RE, '')
    .replace(INJECTION_RE, '[…]');
}

// Returns CORS headers that only reflect allowed origins.
// Never emits the wildcard '*'.
export function corsHeadersForOrigin(origin: string | null): Record<string, string> {
  const allowed =
    origin && ALLOWED_ORIGINS.has(origin)
      ? origin
      : 'https://transparent-five.vercel.app';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}
