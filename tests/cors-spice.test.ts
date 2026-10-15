import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { QUESTIONS } from '../src/types/game.ts';
import { isMildQuestion, questionIndices } from '../src/lib/spice.ts';
import { corsHeadersFor, resolveAllowOrigin } from '../supabase/functions/_shared/cors.ts';

test('CORS reflects the allowlist and never a wildcard', () => {
  assert.equal(resolveAllowOrigin('https://evil.example', undefined), null);
  assert.equal(
    resolveAllowOrigin('https://transparent-five.vercel.app', undefined),
    'https://transparent-five.vercel.app',
  );
  assert.equal(resolveAllowOrigin('https://evil.example', '*'), null);
  assert.equal(resolveAllowOrigin('https://preview.example', 'https://preview.example, *'), 'https://preview.example');
  const headers = corsHeadersFor('https://evil.example', 'https://transparent-five.vercel.app');
  assert.equal(headers['Access-Control-Allow-Origin'], undefined);
  assert.equal(JSON.stringify(headers).includes('*'), false);
});

test('default question pool is mild and keeps sexual prompts out', () => {
  const mild = questionIndices('mild').map((index) => QUESTIONS[index]!);
  const spicy = questionIndices('spicy');
  assert.ok(mild.length >= 20);
  assert.ok(spicy.length > mild.length);
  for (const question of mild) assert.equal(isMildQuestion(question), true);
  assert.equal(mild.some((question) => /sex|hook up|hooked up/i.test(question)), false);
});

test('card migration is append-only, locked down, and not a mint', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261015_cards_and_credits.sql', import.meta.url), 'utf8');
  assert.match(sql, /credits_ledger is append-only/);
  assert.match(sql, /revoke all on table public.cards from public, anon, authenticated/);
  assert.match(sql, /revoke all on table public.credits_ledger from public, anon, authenticated/);
  assert.doesNotMatch(sql, /spl_token|mint_authority|create table public\.transfers/i);
  assert.match(sql, /reason = 'card_claim'/);
});
