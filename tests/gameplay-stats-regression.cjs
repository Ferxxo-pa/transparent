// Run from the repository root: node tests/gameplay-stats-regression.cjs
// Executes the existing caller and writer with synthetic data. No network or transactions.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, 'Source extraction markers changed; update the probe');
  return source.slice(from, to);
}

async function check(status) {
  let payload;
  const existing = {
    games_played: 4, sol_won: 7, sol_lost: 3,
    total_transparent_votes: 8, total_fake_votes: 2,
  };
  const supabase = { from: () => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: existing }) }) }),
    upsert: async value => { payload = value; return { error: null }; },
  }) };
  const writerSource = fs.readFileSync(path.join(root, 'src/lib/supabase.ts'), 'utf8');
  const writer = between(writerSource, 'export async function upsertPlayerStats(', '// ── Real-Time Subscriptions');
  const module = { exports: {} };
  vm.runInNewContext(compile(writer), { module, exports: module.exports, supabase, console, Date });

  const callerSource = fs.readFileSync(path.join(root, 'src/contexts/GameContext.tsx'), 'utf8');
  const lastLine = 'await upsertPlayerStats(player.id, player.name, gameplayStats);';
  const caller = between(callerSource, '            const gameplayStats:', lastLine) + lastLine;
  const invoke = vm.runInNewContext(compile(`async function invoke(score, settlementOutcome, gameState, hostW, allScores, winnerWallet, player, upsertPlayerStats) { ${caller} }`) + ';invoke');
  await invoke({ transparent: 2, fake: 1 }, status,
    { payoutMode: 'winner-takes-all', numQuestions: 1, players: [], buyInAmount: 1, currentPot: 4 },
    'host', {}, 'player', { id: 'player', name: 'Synthetic player' }, module.exports.upsertPlayerStats);

  assert(payload, `${status}: missing statistics write`);
  assert.equal(payload.games_played, 5);
  assert.equal(payload.total_transparent_votes, 10);
  assert.equal(payload.total_fake_votes, 3);
  assert.equal(payload.sol_won, 7, `${status}: existing total must be preserved`);
  assert.equal(payload.sol_lost, 3, `${status}: existing total must be preserved`);
  const serialized = JSON.parse(JSON.stringify(payload));
  assert.equal(serialized.sol_won, 7, 'Non-finite totals must not serialize as null');
  assert.equal(serialized.sol_lost, 3);
}

(async () => {
  for (const status of ['none', 'failed', 'partial']) await check(status);
  console.log('PASS: three unconfirmed-game states preserve totals and record gameplay.');
  console.log('Scope: actual extracted caller/writer; synthetic database. No deployed RLS or persistence acceptance.');
})().catch(error => { console.error(error); process.exitCode = 1; });
