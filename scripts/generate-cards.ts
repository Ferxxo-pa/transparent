// Generate a batch of signed NFC card URLs and a SQL seed.
// Does not connect to Supabase and does not mint anything.
//
//   CARD_SIGNING_SECRET=... node --experimental-strip-types scripts/generate-cards.ts \
//     --host 10 --player 90 --out cards.csv --sql cards.sql \
//     --origin https://transparent-five.vercel.app
//
// Program the URL column onto NTAG215 tags, then lock the tag. Keep the CSV private.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  formatCardToken,
  randomCardId,
  signCard,
  type CardRole,
} from '../supabase/functions/_shared/cards.ts';

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || !process.argv[index + 1]) return fallback;
  return process.argv[index + 1]!;
}

function sqlString(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`refusing to emit unsafe SQL value: ${value}`);
  }
  return `'${value}'`;
}

const secret = process.env.CARD_SIGNING_SECRET ?? '';
if (secret.length < 16) {
  console.error('Set CARD_SIGNING_SECRET to at least 16 characters. Nothing was written.');
  process.exit(1);
}

const hostCount = Number(arg('host', '10'));
const playerCount = Number(arg('player', '90'));
const origin = arg('origin', 'https://transparent-five.vercel.app').replace(/\/$/, '');
const csvPath = arg('out', 'cards.csv');
const sqlPath = arg('sql', 'cards.sql');

if (!Number.isInteger(hostCount) || !Number.isInteger(playerCount) || hostCount < 0 || playerCount < 0) {
  console.error('--host and --player must be non-negative integers');
  process.exit(1);
}
if (hostCount + playerCount > 10000) {
  console.error('refusing to generate more than 10000 cards in one batch');
  process.exit(1);
}

const cards: { id: string; serial: string; role: CardRole }[] = [];
for (let i = 1; i <= hostCount; i++) {
  cards.push({ id: randomCardId(), serial: `H${String(i).padStart(4, '0')}`, role: 'host' });
}
for (let i = 1; i <= playerCount; i++) {
  cards.push({ id: randomCardId(), serial: `P${String(i).padStart(4, '0')}`, role: 'player' });
}

const csv = ['serial,role,card_id,url,chip'];
const inserts: string[] = [];
for (const card of cards) {
  const signature = await signCard(card, secret);
  const token = formatCardToken(card.id, signature);
  const url = `${origin}/c/${token}`;
  csv.push(`${card.serial},${card.role},${card.id},${url},NTAG215`);
  inserts.push(
    `insert into public.cards (id, serial, role) values (${sqlString(card.id)}, ${sqlString(card.serial)}, ${sqlString(card.role)}) on conflict (id) do nothing;`,
  );
}

mkdirSync(dirname(csvPath), { recursive: true });
mkdirSync(dirname(sqlPath), { recursive: true });
writeFileSync(csvPath, `${csv.join('\n')}\n`);
writeFileSync(
  sqlPath,
  `-- Seed for NFC cards. Apply AFTER 20261015_cards_and_credits.sql.\n-- Signatures are not stored. The CSV is the secret URL list.\nbegin;\n${inserts.join('\n')}\ncommit;\n`,
);

console.log(`Wrote ${cards.length} cards`);
console.log(`CSV ${csvPath}`);
console.log(`SQL ${sqlPath}`);
console.log('Program the url column onto NTAG215, print a QR of the same URL, then lock the tag.');
