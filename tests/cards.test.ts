import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decideClaim,
  formatCardToken,
  parseCardToken,
  randomCardId,
  signCard,
  STARTER_CREDITS,
  verifyCardSignature,
} from '../supabase/functions/_shared/cards.ts';

const secret = 'test-card-secret-please';

test('signed card tokens verify and reject tampering', async () => {
  const card = { id: randomCardId(), serial: 'P0001', role: 'player' as const };
  const signature = await signCard(card, secret);
  const token = formatCardToken(card.id, signature);
  const parsed = parseCardToken(token);
  assert.ok(parsed);
  assert.equal(await verifyCardSignature(card, parsed.signature, secret), true);
  assert.equal(await verifyCardSignature({ ...card, role: 'host' }, parsed.signature, secret), false);
  assert.equal(await verifyCardSignature(card, parsed.signature, 'other-secret-value'), false);
});

test('parse rejects extra dots and short ids', () => {
  assert.equal(parseCardToken('abc.sig'), null);
  assert.equal(parseCardToken('id.sig.extra'), null);
  assert.equal(parseCardToken(''), null);
});

test('one claim per card, replay does not grant again, no host grant', () => {
  const open = { claimed_by: null, claimed_at: null, role: 'player' as const };
  assert.deepEqual(decideClaim(open, 'did:privy:a'), { action: 'grant', credits: STARTER_CREDITS });
  assert.deepEqual(
    decideClaim({ claimed_by: 'did:privy:a', claimed_at: '2026-10-15T00:00:00Z', role: 'player' }, 'did:privy:a'),
    { action: 'replay' },
  );
  assert.deepEqual(
    decideClaim({ claimed_by: 'did:privy:a', claimed_at: '2026-10-15T00:00:00Z', role: 'player' }, 'did:privy:b'),
    { action: 'conflict' },
  );
  assert.deepEqual(
    decideClaim({ claimed_by: null, claimed_at: null, role: 'host' }, 'did:privy:a'),
    { action: 'grant', credits: 0 },
  );
});
