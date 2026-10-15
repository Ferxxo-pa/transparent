import { QUESTIONS } from '../types/game.ts';

export type SpiceSetting = 'mild' | 'spicy';

/**
 * Fail closed: sexual, partner-cheating, graphic, or illegal prompts stay out of
 * the default mild pool. An 18+ gate is still required before a room opts into spicy.
 */
const SPICY_PATTERN =
  /sex|hook(?:ed)? up|hookup|sext|\bin bed\b|faked it|body count|freakiest|freaky|porn|orgasm|teacher or boss|illegal|\bjail\b|shit yourself|peed yourself|blacked out|search history|fantasy|attractiveness|friend's ex|friend's partner|during sex|nude|naked|rate everyone|rank everyone/i;

export function isMildQuestion(question: string): boolean {
  return !SPICY_PATTERN.test(question);
}

export function questionIndices(spice: SpiceSetting | undefined): number[] {
  if (spice === 'spicy') return QUESTIONS.map((_, index) => index);
  return QUESTIONS.map((question, index) => (isMildQuestion(question) ? index : -1)).filter((index) => index >= 0);
}

export function questionText(index: number | null | undefined): string {
  if (typeof index === 'number' && QUESTIONS[index]) return QUESTIONS[index];
  const mild = questionIndices('mild');
  return QUESTIONS[mild[0] ?? 0] ?? '';
}

export function pickQuestionIndex(spice: SpiceSetting | undefined, used: number[]): number {
  const pool = questionIndices(spice);
  const available = pool.filter((index) => !used.includes(index));
  const source = available.length > 0 ? available : pool;
  return source[Math.floor(Math.random() * source.length)] ?? 0;
}
