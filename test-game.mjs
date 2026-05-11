/**
 * Transparent — Full Game Integration Test
 *
 * Simulates a complete 3-player, 2-round game via Supabase directly.
 * Tests: create → join → ready → start → vote → advance → game over → cleanup
 *
 * Run: node test-game.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://spyafdjlbgcoxhnyrijk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNweWFmZGpsYmdjb3hobnlyaWprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4OTg1MzUsImV4cCI6MjA4NzQ3NDUzNX0.yL0YWvO81Ea92DG-MgK14ihG_YN_Z3WUR8Svp0jV86w';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// Fake wallet addresses for test players
const HOST   = 'TestHost1111111111111111111111111111111111111';
const PLAYER2 = 'TestPlayer2222222222222222222222222222222222';
const PLAYER3 = 'TestPlayer3333333333333333333333333333333333';

const ROOM_CODE = `T${Date.now().toString().slice(-5)}`;
let gameId = null;

function log(icon, msg) { console.log(`  ${icon} ${msg}`); }
function pass(msg) { log('✅', msg); }
function fail(msg, err) { log('❌', `${msg}: ${err?.message || err}`); }
function section(msg) { console.log(`\n━━ ${msg} ━━`); }

async function cleanup() {
  if (!gameId) return;
  section('CLEANUP');
  try {
    await sb.from('votes').delete().eq('game_id', gameId);
    await sb.from('players').delete().eq('game_id', gameId);
    await sb.from('question_submissions').delete().eq('game_id', gameId);
    await sb.from('predictions').delete().eq('game_id', gameId);
    await sb.from('games').delete().eq('id', gameId);
    pass(`Cleaned up game ${gameId}`);
  } catch (e) { fail('Cleanup', e); }
}

async function run() {
  console.log(`\n🎮 TRANSPARENT — FULL GAME TEST`);
  console.log(`   Room: ${ROOM_CODE}\n`);

  let totalTests = 0, passed = 0, failed = 0;
  function check(ok, msg, err) {
    totalTests++;
    if (ok) { passed++; pass(msg); }
    else { failed++; fail(msg, err); }
    return ok;
  }

  try {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    section('1. CREATE GAME');
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const { data: game, error: createErr } = await sb
      .from('games')
      .insert({
        room_code: ROOM_CODE,
        room_name: 'Test Room',
        host_wallet: HOST,
        buy_in_lamports: 0,  // free game
        status: 'waiting',
        question_mode: 'classic',
        current_question_index: 0,
        current_round: 0,
        payout_mode: 'winner-takes-all',
        num_questions: 2,
      })
      .select()
      .single();

    check(!createErr, `Game created (${ROOM_CODE})`, createErr);
    if (!game) { console.log('\n💀 Cannot continue without game. Aborting.'); return; }
    gameId = game.id;
    log('📎', `Game ID: ${gameId}`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    section('2. LOOKUP BY ROOM CODE');
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const { data: lookup, error: lookupErr } = await sb
      .from('games')
      .select('*')
      .eq('room_code', ROOM_CODE)
      .single();

    check(!lookupErr && lookup?.id === gameId, 'Room code lookup works', lookupErr);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    section('3. JOIN PLAYERS');
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const players = [
      { game_id: gameId, wallet_address: HOST, display_name: 'HostEz', has_paid: true },
      { game_id: gameId, wallet_address: PLAYER2, display_name: 'Alice', has_paid: false },
      { game_id: gameId, wallet_address: PLAYER3, display_name: 'Bob', has_paid: false },
    ];

    for (const p of players) {
      const { error } = await sb.from('players').upsert(p, { onConflict: 'game_id,wallet_address' });
      check(!error, `${p.display_name} joined`, error);
    }

    // Verify player count
    const { data: allPlayers } = await sb.from('players').select('*').eq('game_id', gameId);
    check(allPlayers?.length === 3, `3 players in game (got ${allPlayers?.length})`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    section('4. READY UP');
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    for (const wallet of [HOST, PLAYER2, PLAYER3]) {
      const { error } = await sb
        .from('players')
        .update({ is_ready: true, has_paid: true })
        .eq('game_id', gameId)
        .eq('wallet_address', wallet);
      check(!error, `${wallet.slice(4, 12)} readied up`, error);
    }

    // Verify all ready
    const { data: readyPlayers } = await sb
      .from('players')
      .select('*')
      .eq('game_id', gameId)
      .eq('is_ready', true);
    check(readyPlayers?.length === 3, `All 3 ready (got ${readyPlayers?.length})`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    section('5. START GAME (Round 1)');
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const hotSeatRound1 = PLAYER2; // Alice in the hot seat

    const { error: startErr } = await sb.from('games').update({
      status: 'playing',
      current_round: 1,
      current_hot_seat_player: hotSeatRound1,
      current_question_index: 0,
    }).eq('id', gameId);
    check(!startErr, `Game started — ${hotSeatRound1.slice(4, 12)} in hot seat`, startErr);

    // Verify game status
    const { data: startedGame } = await sb.from('games').select('*').eq('id', gameId).single();
    check(startedGame?.status === 'playing', `Status = playing (got ${startedGame?.status})`);
    check(startedGame?.current_round === 1, `Round = 1 (got ${startedGame?.current_round})`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    section('6. ROUND 1 VOTES');
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Host and Bob vote on Alice (hot seat player doesn't vote)
    const round1Votes = [
      { game_id: gameId, round: 1, voter_wallet: HOST, vote: 'transparent' },
      { game_id: gameId, round: 1, voter_wallet: PLAYER3, vote: 'fake' },
    ];

    for (const v of round1Votes) {
      const { error } = await sb.from('votes').insert(v);
      check(!error, `${v.voter_wallet.slice(4, 12)} voted "${v.vote}"`, error);
    }

    // Verify votes
    const { data: r1Votes } = await sb.from('votes').select('*').eq('game_id', gameId).eq('round', 1);
    check(r1Votes?.length === 2, `2 votes in round 1 (got ${r1Votes?.length})`);

    // Verify unique constraint (no double votes)
    const { error: dupeErr } = await sb.from('votes').insert({
      game_id: gameId, round: 1, voter_wallet: HOST, vote: 'fake'
    });
    check(!!dupeErr, 'Duplicate vote blocked by unique constraint');

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    section('7. ADVANCE TO ROUND 2');
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const hotSeatRound2 = PLAYER3; // Bob's turn

    const { error: advErr } = await sb.from('games').update({
      current_round: 2,
      current_hot_seat_player: hotSeatRound2,
      current_question_index: 1,
    }).eq('id', gameId);
    check(!advErr, `Advanced to round 2 — ${hotSeatRound2.slice(4, 12)} in hot seat`, advErr);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    section('8. ROUND 2 VOTES');
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const round2Votes = [
      { game_id: gameId, round: 2, voter_wallet: HOST, vote: 'transparent' },
      { game_id: gameId, round: 2, voter_wallet: PLAYER2, vote: 'transparent' },
    ];

    for (const v of round2Votes) {
      const { error } = await sb.from('votes').insert(v);
      check(!error, `${v.voter_wallet.slice(4, 12)} voted "${v.vote}" (R2)`, error);
    }

    const { data: r2Votes } = await sb.from('votes').select('*').eq('game_id', gameId).eq('round', 2);
    check(r2Votes?.length === 2, `2 votes in round 2 (got ${r2Votes?.length})`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    section('9. SCORE CALCULATION');
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Calculate like the frontend does
    const { data: allVotes } = await sb.from('votes').select('*').eq('game_id', gameId);
    check(allVotes?.length === 4, `4 total votes across 2 rounds (got ${allVotes?.length})`);

    // Score each player's hot seat rounds
    const scores = {};
    const hotSeats = { 1: PLAYER2, 2: PLAYER3 };

    for (const round of [1, 2]) {
      const hsPlayer = hotSeats[round];
      const roundVotes = allVotes.filter(v => v.round === round);
      const transparent = roundVotes.filter(v => v.vote === 'transparent').length;
      const fake = roundVotes.filter(v => v.vote === 'fake').length;

      if (!scores[hsPlayer]) scores[hsPlayer] = { transparent: 0, fake: 0 };
      scores[hsPlayer].transparent += transparent;
      scores[hsPlayer].fake += fake;
    }

    // Alice (round 1): 1 transparent, 1 fake = 50%
    check(scores[PLAYER2]?.transparent === 1, `Alice: 1 transparent vote (got ${scores[PLAYER2]?.transparent})`);
    check(scores[PLAYER2]?.fake === 1, `Alice: 1 fake vote (got ${scores[PLAYER2]?.fake})`);

    // Bob (round 2): 2 transparent, 0 fake = 100%
    check(scores[PLAYER3]?.transparent === 2, `Bob: 2 transparent votes (got ${scores[PLAYER3]?.transparent})`);
    check(scores[PLAYER3]?.fake === 0, `Bob: 0 fake votes (got ${scores[PLAYER3]?.fake})`);

    // Winner = Bob (100% honest)
    const winner = Object.entries(scores).sort((a, b) => {
      const aHonesty = a[1].transparent / (a[1].transparent + a[1].fake);
      const bHonesty = b[1].transparent / (b[1].transparent + b[1].fake);
      return bHonesty - aHonesty;
    })[0];

    check(winner[0] === PLAYER3, `Winner = Bob (most honest)`);
    log('📊', `Alice: ${scores[PLAYER2].transparent}T/${scores[PLAYER2].fake}F = 50%`);
    log('📊', `Bob: ${scores[PLAYER3].transparent}T/${scores[PLAYER3].fake}F = 100% 🏆`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    section('10. GAME OVER');
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const { error: overErr } = await sb.from('games').update({
      status: 'gameover',
    }).eq('id', gameId);
    check(!overErr, 'Game status → gameover', overErr);

    const { data: finalGame } = await sb.from('games').select('*').eq('id', gameId).single();
    check(finalGame?.status === 'gameover', `Final status = gameover (got ${finalGame?.status})`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    section('11. PLAYER STATS UPSERT');
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const { error: statsErr } = await sb.from('player_stats').upsert({
      wallet_address: PLAYER3,
      display_name: 'Bob',
      games_played: 1,
      sol_won: 0,
      sol_lost: 0,
      total_transparent_votes: 2,
      total_fake_votes: 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'wallet_address' });
    check(!statsErr, 'Player stats saved', statsErr);

    // Read back
    const { data: stats } = await sb.from('player_stats').select('*').eq('wallet_address', PLAYER3).single();
    check(stats?.games_played === 1, `Bob stats: 1 game played (got ${stats?.games_played})`);
    check(stats?.total_transparent_votes === 2, `Bob stats: 2 transparent votes (got ${stats?.total_transparent_votes})`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    section('12. PREDICTION MARKET');
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const { data: prediction, error: predErr } = await sb.from('predictions').insert({
      game_id: gameId,
      bettor_wallet: HOST,
      bettor_name: 'HostEz',
      predicted_winner_wallet: PLAYER3,
      amount_lamports: 50000000,  // 0.05 SOL
      settled: false,
    }).select().single();
    check(!predErr, 'Prediction placed (Host bets on Bob)', predErr);

    // Settle
    const { error: settleErr } = await sb.from('predictions').update({ settled: true }).eq('game_id', gameId);
    check(!settleErr, 'Predictions settled', settleErr);

    const { data: settled } = await sb.from('predictions').select('*').eq('game_id', gameId);
    check(settled?.every(p => p.settled), `All predictions marked settled`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    section('13. REALTIME CHECK');
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let realtimeReceived = false;
    const channel = sb
      .channel(`test-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, () => {
        realtimeReceived = true;
      })
      .subscribe();

    // Wait for subscription
    await new Promise(r => setTimeout(r, 2000));

    // Trigger a change
    await sb.from('games').update({ room_name: 'Test Room Updated' }).eq('id', gameId);
    await new Promise(r => setTimeout(r, 2000));

    check(realtimeReceived, 'Realtime subscription received game update');
    sb.removeChannel(channel);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    section('14. EDGE CASES');
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // Duplicate room code should fail
    const { error: dupeRoom } = await sb.from('games').insert({
      room_code: ROOM_CODE, room_name: 'Dupe', host_wallet: HOST,
      buy_in_lamports: 0, status: 'waiting', question_mode: 'classic',
      current_question_index: 0, current_round: 0,
    });
    check(!!dupeRoom, 'Duplicate room code rejected (unique constraint)');

    // Duplicate player join should upsert, not fail
    const { error: dupePlayer } = await sb.from('players').upsert(
      { game_id: gameId, wallet_address: PLAYER2, display_name: 'AliceRenamed', has_paid: true },
      { onConflict: 'game_id,wallet_address' }
    );
    check(!dupePlayer, 'Duplicate player upserts cleanly (renamed)');

    const { data: renamed } = await sb.from('players').select('*')
      .eq('game_id', gameId).eq('wallet_address', PLAYER2).single();
    check(renamed?.display_name === 'AliceRenamed', `Player rename worked (got ${renamed?.display_name})`);

  } catch (e) {
    console.error('\n💥 UNEXPECTED ERROR:', e);
  } finally {
    await cleanup();
    // Clean up test player stats
    await sb.from('player_stats').delete().eq('wallet_address', PLAYER3);

    console.log(`\n${'═'.repeat(40)}`);
    console.log(`  RESULTS: ${passed}/${totalTests} passed, ${failed} failed`);
    console.log(`${'═'.repeat(40)}`);

    if (failed === 0) {
      console.log('\n  🎉 ALL TESTS PASSED — game flow is solid\n');
    } else {
      console.log(`\n  ⚠️  ${failed} TESTS FAILED — check above\n`);
    }

    process.exit(failed > 0 ? 1 : 0);
  }
}

run();
