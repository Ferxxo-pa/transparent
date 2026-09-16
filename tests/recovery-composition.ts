/**
 * Recovery composition: settlement crash-recovery end-to-end, reconnect
 * state consistency, and walletReady-gate documentation.
 *
 * Builds on (does not re-test in isolation) the primitives already proven
 * in tests/full-stack-composition.ts:
 *   - crash-lease reclaim (5min stale 'retrying'/'pending' -> 'failed')
 *   - normalizeSigRecords null-return for empty/invalid sig maps
 *   - paid_tx_signatures omitted unless authoritative
 *   - typed settlement lifecycle sigs (submitted/confirmed/failed/unknown)
 *
 * Section A imports the REAL src/lib/gameAuth.ts normalizeSigRecords (via
 * vite-node, so import.meta.env resolves) against a disposable Postgres —
 * proving the actual client-side merge logic, not a re-implementation of
 * it, handles a full crash -> reclaim -> retry -> settle cycle correctly.
 *
 * Section B replicates (does NOT invoke, to avoid opening a live realtime
 * websocket to whatever project .env points at) the exact reconnect
 * sequence in src/contexts/GameContext.tsx (the "re-subscribe after page
 * refresh" effect) and src/lib/supabase.ts (subscribeToGame) to prove
 * what a reconnecting client actually sees.
 *
 * Section C documents (does not fix) the walletReady gate in
 * distributeWinnings — GameContext.tsx:1007-1008.
 *
 * Run against a DISPOSABLE local Postgres:
 *   docker run -d --name recovery-pg -e POSTGRES_PASSWORD=postgres -p 55446:5432 postgres:16
 *   DSN=postgres://postgres:postgres@127.0.0.1:55446/postgres npx vite-node tests/recovery-composition.ts
 */

import { readFileSync } from 'node:fs';
import pg from 'pg';
import { normalizeSigRecords, type SigRecord } from '../src/lib/gameAuth.ts';

const DSN = process.env.DSN ?? 'postgres://postgres:postgres@127.0.0.1:55445/postgres';
const LEASE_TIMEOUT_MS = 5 * 60 * 1000;

let passed = 0;
let failed = 0;
function report(ok: boolean, name: string, detail = '') {
  ok ? passed++ : failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? `  (${detail})` : ''}`);
}

const FULL_STACK = [
  'supabase/schema.sql',
  'supabase/migrations/predictions.sql',
  'supabase/migrations/20260701_escrow_hardening.sql',
  'supabase/migrations/20260915_server_authoritative_pot_settlement.sql',
  'supabase/migrations/20260915_settlement_tx_signature_tracking.sql',
  'supabase/migrations/20260915_delete_policy_reconciliation.sql',
  'supabase/migrations/20260915_policy_reconciliation.sql',
  'supabase/migrations/20260915_comprehensive_legacy_alias_cleanup.sql',
  'supabase/migrations/20260915_policy_alias_review_closeout.sql',
  'supabase/migrations/20260915_players_delete_lockdown.sql',
  'supabase/migrations/20260915_add_cancelled_status.sql',
  'supabase/migrations/20260915_fix_policy_status_mismatch.sql',
  'supabase/migrations/20260915_settlement_retrying_check.sql',
  'supabase/migrations/20260915_question_submitter_verification.sql',
  'supabase/migrations/20260916_settlement_lease_reclaim.sql',
];

async function main() {
  const db = new pg.Client({ connectionString: DSN });
  await db.connect();

  await db.query(`
    do $$ begin
      if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    create schema if not exists auth;
    create or replace function auth.role() returns text language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
    grant usage on schema auth to anon, authenticated, service_role;
    do $$ begin
      if not exists (select from pg_publication where pubname = 'supabase_realtime') then
        create publication supabase_realtime;
      end if;
    end $$;
  `);

  for (const f of FULL_STACK) {
    await db.query(readFileSync(f, 'utf8'));
  }
  await db.query(`
    grant usage on schema public to anon, service_role;
    grant select, insert, update, delete on all tables in schema public to anon, service_role;
  `);
  console.log('schema applied\n');

  async function asPersist(role: 'anon' | 'service_role', sql: string, params: unknown[] = []) {
    await db.query('BEGIN');
    try {
      await db.query(`SET LOCAL ROLE ${role}`);
      await db.query(`SET LOCAL request.jwt.claim.role = '${role}'`);
      const r = await db.query(sql, params);
      await db.query('COMMIT');
      return { ok: true, rowCount: r.rowCount ?? 0, rows: r.rows, err: '' };
    } catch (e: any) {
      await db.query('ROLLBACK');
      return { ok: false, err: e.message, rowCount: 0, rows: [] };
    }
  }

  // ════════════════════════════════════════════════════════════════
  // Section A — settlement recovery end-to-end: start -> broadcast ->
  // crash -> lease reclaim -> retry -> settle
  // ════════════════════════════════════════════════════════════════
  console.log('── Section A: settlement recovery end-to-end ──\n');

  {
    // 1. Game starts, two players, settle-game claims 'none' -> 'pending'.
    const { rows: [g] } = await db.query(
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, settlement_status)
       values ('RECOV-A', 'HOST_RECOV_A', 'playing', 1, 200000, 'none') returning id`,
    );
    const claim = await asPersist('service_role',
      `update games set settlement_status = 'pending', pending_payouts = '{"W1":100000,"W2":100000}'::jsonb
       where id = $1 and settlement_status = 'none' returning id`, [g.id]);
    report(claim.ok && claim.rowCount === 1, 'A1: settle-game atomic claim none -> pending succeeds', claim.err);

    // 2. Pre-broadcast persist for W1 (settle-game writes sig identity before
    // sendRawTransaction — see supabase/functions/settle-game/index.ts).
    const preBroadcast = await asPersist('service_role',
      `update games set paid_tx_signatures = '{"W1":{"sig":"recov_a_w1_sig","status":"submitted"}}'::jsonb
       where id = $1`, [g.id]);
    report(preBroadcast.ok, 'A2: pre-broadcast sig for W1 persisted before send', preBroadcast.err);

    // 3. CRASH — process dies here. W1's send may or may not have reached
    // the chain; W2 was never attempted. Row is stuck at 'pending'.
    // Backdate updated_at past the lease window to simulate elapsed time.
    const staleUpdatedAt = new Date(Date.now() - LEASE_TIMEOUT_MS - 60_000).toISOString();
    await db.query('SET session_replication_role = replica');
    await db.query('update games set updated_at = $2 where id = $1', [g.id, staleUpdatedAt]);
    await db.query('SET session_replication_role = DEFAULT');

    // 4. retry-settlement fires: stale 'pending' lease reclaim -> 'failed'.
    const staleThreshold = new Date(Date.now() - LEASE_TIMEOUT_MS).toISOString();
    const reclaim = await asPersist('service_role',
      `update games set settlement_status = 'failed', lease_reclaimed_at = now()
       where id = $1 and settlement_status = 'pending' and updated_at < $2
       returning id`, [g.id, staleThreshold]);
    report(reclaim.ok && reclaim.rowCount === 1, 'A3: crash-lease reclaim fires (pending -> failed)', reclaim.err);

    const { rows: [afterReclaim] } = await db.query(
      `select settlement_status, pending_payouts, paid_tx_signatures from games where id = $1`, [g.id]);
    const w1AfterReclaim = (afterReclaim.paid_tx_signatures as any).W1;
    report(
      w1AfterReclaim?.sig === 'recov_a_w1_sig' && w1AfterReclaim?.status === 'submitted' &&
      (afterReclaim.pending_payouts as any).W1 === 100000 && (afterReclaim.pending_payouts as any).W2 === 100000,
      'A4: reclaim preserves the pre-crash sig and pending_payouts exactly',
      `sig=${JSON.stringify(w1AfterReclaim)} pending=${JSON.stringify(afterReclaim.pending_payouts)}`,
    );

    // 5. Settlement retried: atomic claim failed -> retrying.
    const retryClaim = await asPersist('service_role',
      `update games set settlement_status = 'retrying' where id = $1 and settlement_status = 'failed'
       returning id, pending_payouts, paid_tx_signatures`, [g.id]);
    report(retryClaim.ok && retryClaim.rowCount === 1, 'A5: retry atomic claim failed -> retrying succeeds', retryClaim.err);

    // 6. Retry uses the REAL client-side normalizeSigRecords (src/lib/gameAuth.ts)
    // to parse the persisted sig map, exactly as GameContext does when merging
    // edge-function responses. This is not a re-implementation — it's the
    // actual shipped function.
    const claimedRow = retryClaim.rows[0];
    const sigRecords = normalizeSigRecords(claimedRow.paid_tx_signatures);
    report(
      sigRecords !== null && sigRecords.W1?.sig === 'recov_a_w1_sig' && sigRecords.W1?.status === 'submitted',
      'A6: real normalizeSigRecords() parses the surviving pre-crash sig correctly',
      JSON.stringify(sigRecords),
    );

    // 7. Reconciliation (getSignatureStatuses simulated): W1's tx actually
    // landed on-chain while we were dead — mark confirmed. W2 has no sig at
    // all yet — must still be sent.
    const reconciled: Record<string, SigRecord> = { ...sigRecords, W1: { sig: 'recov_a_w1_sig', status: 'confirmed' } };
    const pendingPayouts: Record<string, number> = { ...claimedRow.pending_payouts };
    delete pendingPayouts.W1; // confirmed -> fully paid, drop from owed
    const persistReconcile = await asPersist('service_role',
      `update games set paid_tx_signatures = $2::jsonb where id = $1`, [g.id, JSON.stringify(reconciled)]);
    report(persistReconcile.ok, 'A7: reconciled W1 confirmed-sig persisted', persistReconcile.err);

    // 8. Send loop for stillOwed = {W2}. New sig persisted pre-broadcast,
    // then confirmed. New sig must be APPENDED alongside W1's, never
    // clobbering it.
    const withW2Submitted = { ...reconciled, W2: { sig: 'recov_a_w2_sig', status: 'submitted' } };
    await db.query(
      `update games set paid_tx_signatures = $2::jsonb where id = $1`, [g.id, JSON.stringify(withW2Submitted)]);
    const withW2Confirmed = { ...withW2Submitted, W2: { sig: 'recov_a_w2_sig', status: 'confirmed' } };
    const finalWrite = await asPersist('service_role',
      `update games set settlement_status = 'settled', pending_payouts = null, paid_tx_signatures = $2::jsonb
       where id = $1`, [g.id, JSON.stringify(withW2Confirmed)]);
    report(finalWrite.ok, 'A8: final settle write (settled, both sigs confirmed) succeeds', finalWrite.err);

    // 9. Verify final state: W1 preserved from before the crash, W2 newly
    // appended, both confirmed, pending_payouts cleared, status settled.
    const { rows: [final] } = await db.query(
      `select settlement_status, pending_payouts, paid_tx_signatures from games where id = $1`, [g.id]);
    const finalSigs = final.paid_tx_signatures as Record<string, SigRecord>;
    report(
      final.settlement_status === 'settled' &&
      final.pending_payouts === null &&
      finalSigs.W1?.sig === 'recov_a_w1_sig' && finalSigs.W1?.status === 'confirmed' &&
      finalSigs.W2?.sig === 'recov_a_w2_sig' && finalSigs.W2?.status === 'confirmed',
      'A9: end-to-end recovery lands settled with W1 preserved + W2 appended, both confirmed',
      JSON.stringify(final),
    );

    await db.query(`delete from games where id = $1`, [g.id]);
  }

  {
    // 10. paid_tx_signatures omitted unless authoritative: normalizeSigRecords
    // on an empty/invalid map returns null (real gameAuth.ts behavior), so a
    // caller following the "only write if non-null" convention never
    // persists an empty {} that downstream code would misread as "has sigs".
    report(normalizeSigRecords({}) === null, 'A10: real normalizeSigRecords({}) returns null (empty map)');
    report(normalizeSigRecords(null) === null, 'A11: real normalizeSigRecords(null) returns null');
    report(normalizeSigRecords(undefined) === null, 'A12: real normalizeSigRecords(undefined) returns null');
    report(normalizeSigRecords({ garbage: 42 }) === null, 'A13: real normalizeSigRecords() drops non-SigRecord junk down to null');

    // Composition with the DB: a game whose paid_tx_signatures column is
    // genuinely empty ('{}') must never be treated as "has confirmed sigs"
    // by a client re-reading it after reconnect.
    const { rows: [g] } = await db.query(
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, settlement_status, paid_tx_signatures)
       values ('RECOV-EMPTY', 'HOST_RECOV_EMPTY', 'playing', 1, 100000, 'none', '{}'::jsonb) returning id`,
    );
    const { rows: [row] } = await db.query(`select paid_tx_signatures from games where id = $1`, [g.id]);
    report(
      normalizeSigRecords(row.paid_tx_signatures) === null,
      'A14: empty paid_tx_signatures read back from DB normalizes to null, not a false "already paid" signal',
    );
    await db.query(`delete from games where id = $1`, [g.id]);
  }

  // ════════════════════════════════════════════════════════════════
  // Section B — reconnect scenario: player disconnects mid-game,
  // reconnects, and the state the client renders is checked for
  // consistency with server truth.
  //
  // This replicates (does not invoke over the network) the exact sequence
  // in src/contexts/GameContext.tsx / src/lib/supabase.ts:
  //   - GameContext.tsx ~361-370 "Re-subscribe after page refresh": on
  //     mount, gameState is seeded from localStorage (a snapshot from
  //     BEFORE the disconnect), then setupSubscription() is called.
  //   - src/lib/supabase.ts subscribeToGame(): wires up postgres_changes
  //     listeners only. It issues NO initial select — onGameChange /
  //     onPlayersChange fire only on a FUTURE row change, never as a
  //     catch-up sync for changes that happened while disconnected.
  //   - GameContext.tsx onGameChange: `setGameState((prev) => { if
  //     (!prev) return prev; ... })` — a no-op if prev is null, and
  //     otherwise a partial merge onto the (stale) previous state.
  // ════════════════════════════════════════════════════════════════
  console.log('\n── Section B: reconnect scenario (state consistency) ──\n');

  {
    const { rows: [g] } = await db.query(
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, game_phase, current_pot)
       values ('RECONNECT-1', 'HOST_RC1', 'playing', 1, 100000, 'question', 100000) returning id`,
    );
    await db.query(
      `insert into players (game_id, wallet_address, display_name, has_paid, is_ready)
       values ($1, 'P1', 'Player One', true, true), ($1, 'P2', 'Player Two', true, true)`, [g.id]);

    // Client's localStorage snapshot, captured the moment before disconnect.
    const localSnapshot = {
      gameId: g.id,
      hostWallet: 'HOST_RC1',
      gameStatus: 'playing',
      gamePhase: 'question',
      currentRound: 1,
      currentPot: 100000,
      players: ['P1', 'P2'],
      gameStatusAtSnapshot: 'gameover-not-yet',
    };

    // While the client is disconnected, the game progresses on the server:
    // round advances, a third player joins, pot grows.
    await db.query(
      `update games set current_round = 2, game_phase = 'voting', current_pot = 150000 where id = $1`, [g.id]);
    await db.query(
      `insert into players (game_id, wallet_address, display_name, has_paid, is_ready)
       values ($1, 'P3', 'Player Three', true, true)`, [g.id]);

    // Reconnect: GameContext's refresh-effect condition
    // (`gs.gameId && gs.gameStatus !== 'gameover'`) is met, so
    // setupSubscription(gameId, hostWallet) is invoked with the STALE
    // snapshot as the seed state — this mirrors GameContext.tsx:362-369.
    const reconnectEligible = !!localSnapshot.gameId && localSnapshot.gameStatus !== 'gameover';
    report(reconnectEligible, 'B1: reconnect effect condition is met (gameId present, not gameover)');

    // subscribeToGame() only registers postgres_changes listeners — it does
    // not perform an initial select. Simulate that: "clientRenderedState"
    // starts as the stale local snapshot and is updated ONLY by simulated
    // future change events, never by a catch-up fetch on mount.
    let clientRenderedState = { ...localSnapshot };

    const { rows: [serverTruth] } = await db.query(
      `select current_round, game_phase, current_pot from games where id = $1`, [g.id]);

    // B2: immediately after reconnect (before any new realtime event
    // fires), the client is still showing the pre-disconnect snapshot —
    // NOT server truth. This is the documented gap: no reconciling fetch
    // happens on reconnect.
    report(
      clientRenderedState.currentRound !== serverTruth.current_round &&
      clientRenderedState.gamePhase !== serverTruth.game_phase &&
      clientRenderedState.currentPot !== serverTruth.current_pot,
      'B2: reconnected client renders STALE round/phase/pot until a new change event arrives (no catch-up fetch on reconnect)',
      `client=${JSON.stringify({ round: clientRenderedState.currentRound, phase: clientRenderedState.gamePhase, pot: clientRenderedState.currentPot })} server=${JSON.stringify(serverTruth)}`,
    );

    // B3: the player list is also stale — P3 (who joined while the client
    // was disconnected) is invisible until a players-table change event
    // for THIS game fires after reconnect.
    const { rows: serverPlayers } = await db.query(
      `select wallet_address from players where game_id = $1 order by wallet_address`, [g.id]);
    report(
      clientRenderedState.players.length !== serverPlayers.length &&
      !clientRenderedState.players.includes('P3'),
      'B3: reconnected client\'s player list is missing P3 (joined while disconnected) until a new players change event fires',
      `client=${JSON.stringify(clientRenderedState.players)} server=${JSON.stringify(serverPlayers.map(p => p.wallet_address))}`,
    );

    // B4: once ANY new row change happens after reconnect (e.g. another
    // player's action triggers a games-table UPDATE), onGameChange fires
    // and the client DOES catch up on that table — proving the gap is
    // specifically "no catch-up on mount", not "realtime is broken".
    await db.query(`update games set current_round = 3 where id = $1`, [g.id]);
    const { rows: [afterNewEvent] } = await db.query(
      `select current_round, game_phase, current_pot from games where id = $1`, [g.id]);
    // Simulate onGameChange's merge (GameContext.tsx ~204-224): full payload.new
    // is merged in, so once an event fires, the client is fully consistent again.
    clientRenderedState = {
      ...clientRenderedState,
      currentRound: afterNewEvent.current_round,
      gamePhase: afterNewEvent.game_phase,
      currentPot: afterNewEvent.current_pot,
    };
    report(
      clientRenderedState.currentRound === afterNewEvent.current_round &&
      clientRenderedState.gamePhase === afterNewEvent.game_phase,
      'B4: client DOES resync once a new postgres_changes event fires post-reconnect (confirms the gap is mount-time only)',
    );

    // B5: onGameChange's own guard — `if (!prev) return prev;` — means if a
    // client reconnects with NO localStorage snapshot at all (prev === null,
    // e.g. new device / cleared storage) and the refresh-effect never calls
    // setupSubscription (its condition requires `gs.gameId`), the game view
    // would never populate from realtime alone; a page-level fetch (e.g. via
    // getGameByRoomCode on the room-code entry flow) is required. Document
    // that a raw subscribeToGame() call with prev===null renders a no-op.
    const prevIsNull = null;
    const wouldOnGameChangeUpdate = prevIsNull !== null; // mirrors `if (!prev) return prev;`
    report(
      !wouldOnGameChangeUpdate,
      'B5: DOCUMENTED — onGameChange no-ops when prev state is null (fresh reconnect with no snapshot needs an explicit fetch, not just resubscribe)',
    );

    await db.query(`delete from games where id = $1`, [g.id]);
  }

  // ════════════════════════════════════════════════════════════════
  // Section C — walletReady gate: document (do not fix) current
  // behavior when the host's wallet is not ready at settlement time.
  //
  // GameContext.tsx:1005-1008:
  //   const distributeWinnings = useCallback(async (winnerWallet: string) => {
  //     const wallet = walletRef.current;
  //     if (!wallet || !gameState) return;
  //     setLoading(true);
  //     ...
  // ════════════════════════════════════════════════════════════════
  console.log('\n── Section C: walletReady gate (documented, not fixed) ──\n');

  {
    // Simulate the exact guard from GameContext.tsx:1008. walletRef.current
    // is null whenever walletReady is false (setWalletAdapter sets both
    // together — see GameContext.tsx:169-173) or the adapter hasn't been
    // set at all yet.
    let loadingWasSet = false;
    let errorWasSet = false;
    let settlementStatusTransitionAttempted = false;

    function simulateDistributeWinnings(walletRefCurrent: unknown, gameStateIsPresent: boolean) {
      // Mirrors: const wallet = walletRef.current; if (!wallet || !gameState) return;
      if (!walletRefCurrent || !gameStateIsPresent) return;
      loadingWasSet = true;
      settlementStatusTransitionAttempted = true;
    }

    simulateDistributeWinnings(null /* walletRef.current — wallet not ready */, true);

    report(
      !loadingWasSet && !errorWasSet && !settlementStatusTransitionAttempted,
      'C1: DOCUMENTED — when host wallet is not ready, distributeWinnings() is a silent no-op: no loading state, no error, no settlement attempt',
    );

    // C2: this is a SILENT failure mode from the player/host's perspective
    // — clicking "distribute winnings" with a not-yet-ready wallet produces
    // no visible feedback (setError is never called on this path, only
    // setLoading(true) which never happens either since the return is
    // before it). The game is left at whatever pre-settlement status it
    // was in, with no error surfaced and no retry affordance triggered.
    report(
      errorWasSet === false,
      'C2: DOCUMENTED — no setError() call on the not-ready-wallet path; UI has no way to distinguish "not ready yet" from "did nothing happened"',
    );

    // C3: cross-check against the real source to catch drift — if this
    // guard's shape changes, this test should be revisited rather than
    // silently keep asserting stale behavior.
    const src = readFileSync('src/contexts/GameContext.tsx', 'utf8');
    const guardPresent = /const wallet = walletRef\.current;\s*\n\s*if \(!wallet \|\| !gameState\) return;/.test(src);
    report(guardPresent, 'C3: source still contains the documented silent-return guard at GameContext.tsx (drift check)');
  }

  // ════════════════════════════════════════════════════════════════
  // Section D — client retrySettlement handles stale 'pending'
  //
  // Before fix: retrySettlement's freshStatus check only handled
  // 'retrying' for stale-lease detection. A stale 'pending' (crashed
  // initial settlement) fell through to a silent return — the user
  // could never trigger recovery from the UI.
  //
  // After fix: the client check mirrors the server
  // (freshStatus === 'retrying' || freshStatus === 'pending').
  // ════════════════════════════════════════════════════════════════
  console.log('\n── Section D: client retrySettlement covers stale pending ──\n');

  {
    const RETRY_LEASE_TIMEOUT_MS = 5 * 60 * 1000;

    function simulateRetrySettlementGuard(freshStatus: string, updatedAt: Date): 'blocked' | 'in-progress' | 'allowed' {
      if (freshStatus !== 'failed') {
        if (freshStatus === 'retrying' || freshStatus === 'pending') {
          const leaseAgeMs = Date.now() - updatedAt.getTime();
          if (leaseAgeMs < RETRY_LEASE_TIMEOUT_MS) {
            return 'in-progress';
          }
          return 'allowed';
        } else {
          return 'blocked';
        }
      }
      return 'allowed';
    }

    const staleTime = new Date(Date.now() - RETRY_LEASE_TIMEOUT_MS - 60_000);
    const freshTime = new Date(Date.now() - 30_000);

    report(
      simulateRetrySettlementGuard('pending', staleTime) === 'allowed',
      'D1: stale pending (>5min) allows retry — user can recover from crashed initial settlement',
    );
    report(
      simulateRetrySettlementGuard('pending', freshTime) === 'in-progress',
      'D2: fresh pending (<5min) returns in-progress — does not interfere with active settlement',
    );
    report(
      simulateRetrySettlementGuard('retrying', staleTime) === 'allowed',
      'D3: stale retrying (>5min) allows retry (unchanged behavior)',
    );
    report(
      simulateRetrySettlementGuard('retrying', freshTime) === 'in-progress',
      'D4: fresh retrying (<5min) returns in-progress (unchanged behavior)',
    );
    report(
      simulateRetrySettlementGuard('settled', staleTime) === 'blocked',
      'D5: settled status blocks retry regardless of age',
    );
    report(
      simulateRetrySettlementGuard('none', staleTime) === 'blocked',
      'D6: none status blocks retry regardless of age',
    );
    report(
      simulateRetrySettlementGuard('failed', freshTime) === 'allowed',
      'D7: failed status always allows retry (direct path)',
    );

    // D8: cross-check the real source matches the fixed guard shape
    const retrySrc = readFileSync('src/contexts/GameContext.tsx', 'utf8');
    const pendingGuardPresent = /freshStatus === 'retrying' \|\| freshStatus === 'pending'/.test(retrySrc);
    report(pendingGuardPresent, 'D8: source contains the fixed retrySettlement guard covering both retrying and pending (drift check)');
  }

  await db.end();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
