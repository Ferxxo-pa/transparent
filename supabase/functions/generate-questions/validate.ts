// Pure validation for generate-questions. No Deno imports.

export const VALID_VIBES = [
  'college', 'coworkers', 'couples', 'new_friends', 'family', 'chaos',
] as const;
export type Vibe = (typeof VALID_VIBES)[number];

export const VALID_SPICE_LEVELS = [0.5, 0.75, 1.0] as const;
export type SpiceLevel = (typeof VALID_SPICE_LEVELS)[number];

export const CONTEXT_MAX_LEN = 500;
export const RATE_LIMIT_PER_MINUTE = 5;
export const DEFAULT_SPICE: SpiceLevel = 0.5;

const CONTROL_CHARS_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const INJECTION_RE = /ignore\s+previous\s+instructions|system\s*:|```|<\|/gi;

export function validateVibe(vibe: unknown): Vibe {
  if (typeof vibe !== 'string' || !VALID_VIBES.includes(vibe as Vibe)) {
    throw Object.assign(new Error('invalid vibe'), { status: 400 });
  }
  return vibe as Vibe;
}

export function validateSpiceLevel(level: unknown): SpiceLevel {
  const numeric = typeof level === 'string' ? Number(level) : level;
  if (typeof numeric !== 'number' || !VALID_SPICE_LEVELS.includes(numeric as SpiceLevel)) {
    throw Object.assign(new Error('invalid spiceLevel'), { status: 400 });
  }
  return numeric as SpiceLevel;
}

/** Omitted spice stays mild. Hotter spice requires an explicit 18+ confirmation. */
export function resolveSpice(level: unknown, ageConfirmed: unknown): SpiceLevel {
  if (level === undefined || level === null || level === '') return DEFAULT_SPICE;
  const spice = validateSpiceLevel(level);
  if (spice > DEFAULT_SPICE && ageConfirmed !== true) {
    throw Object.assign(new Error('spicy questions require an 18+ confirmation'), { status: 403 });
  }
  return spice;
}

export function validateContextLength(context: unknown): void {
  if (typeof context === 'string' && context.length > CONTEXT_MAX_LEN) {
    throw Object.assign(
      new Error(`context too long (max ${CONTEXT_MAX_LEN} chars)`),
      { status: 400 },
    );
  }
}

export function sanitizeContext(context: string): string {
  return context.replace(CONTROL_CHARS_RE, '').replace(INJECTION_RE, '[…]');
}
