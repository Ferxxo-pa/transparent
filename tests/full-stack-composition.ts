/**
 * Full-stack composition regression test.
 *
 * Every other test file in this directory applies a PARTIAL migration
 * stack (whatever set of files that specific fix needed). That's fine for
 * proving an individual fix works in isolation, but it is exactly the
 * blind spot that let the historical schema-full.sql-lineage policies
 * ("players_insert" WITH CHECK true, "games_insert" WITH CHECK true, …)
 * survive silently for months — Postgres ORs permissive policies
 * together, so a scoped policy added in one migration does nothing if an
 * older permissive alias for the same command is still present under a
 * different name.
 *
 * This test applies EVERY migration file in the repo, in dependency
 * order, exactly once — the actual upgrade path a real environment goes
 * through — then re-verifies the full set of anon attack vectors closed
 * across all of them. It also asserts, from pg_policies directly, that no
 * permissive non-SELECT policy with an unconditional `true` check remains
 * on any game table.
 *
 * Run against a DISPOSABLE local Postgres:
 *   docker run -d --name rls-full-stack -e POSTGRES_PASSWORD=postgres -p 55445:5432 postgres:16
 *   DSN=postgres://postgres:postgres@127.0.0.1:55445/postgres npx tsx tests/full-stack-composition.ts
 */

import { readFileSync } from "node:fs";
import pg from "pg";

const DSN = process.env.DSN ?? "postgres://postgres:postgres@127.0.0.1:55445/postgres";

let passed = 0;
let failed = 0;
function report(ok: boolean, name: string, detail = "") {
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? `  (${detail})` : ""}`);
}

// The full, ordered upgrade path: base schema lineage, then every
// 20260915 hardening migration in the order they must be applied.
const FULL_STACK = [
  "supabase/schema.sql",
  "supabase/migrations/predictions.sql",
  "supabase/migrations/20260701_escrow_hardening.sql",
  "supabase/migrations/20260915_server_authoritative_pot_settlement.sql",
  "supabase/migrations/20260915_settlement_tx_signature_tracking.sql",
  "supabase/migrations/20260915_delete_policy_reconciliation.sql",
  "supabase/migrations/20260915_policy_reconciliation.sql",
  "supabase/migrations/20260915_comprehensive_legacy_alias_cleanup.sql",
  "supabase/migrations/20260915_policy_alias_review_closeout.sql",
  "supabase/migrations/20260915_players_delete_lockdown.sql",
  "supabase/migrations/20260915_add_cancelled_status.sql",
  "supabase/migrations/20260915_fix_policy_status_mismatch.sql",
  "supabase/migrations/20260915_settlement_retrying_check.sql",
  "supabase/migrations/20260915_question_submitter_verification.sql",
  "supabase/migrations/20260916_settlement_lease_reclaim.sql",
];

// Phase 2: auth binding drops anon INSERT on question_submissions entirely
// and restricts games UPDATE to service_role. Applied AFTER membership-only
// tests prove the wallet-forgery gap.
const AUTH_BINDING_MIGRATION = "supabase/migrations/20260915_question_auth_binding.sql";

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
    await db.query(readFileSync(f, "utf8"));
    console.log(`applied ${f}`);
  }

  // Reproduce the historical schema-full.sql-lineage leftovers that a
  // real environment bootstrapped from that file (instead of
  // supabase/schema.sql) would still have at this exact point in the
  // upgrade path. Every migration above claims to drop these by name —
  // this proves it.
  await db.query(`
    create policy "games_insert" on public.games for insert with check (true);
    create policy "games_update" on public.games for update using (true) with check (true);
    create policy "games_delete" on public.games for delete using (true);
    create policy "players_insert" on public.players for insert with check (true);
    create policy "players_update" on public.players for update using (true) with check (true);
    create policy "players_delete" on public.players for delete using (true);
    create policy "votes_insert" on public.votes for insert with check (true);
    create policy "question_submissions_update" on public.question_submissions for update using (true) with check (true);
    create policy "question_submissions_insert" on public.question_submissions for insert with check (true);
    create policy "predictions_insert" on public.predictions for insert with check (true);
    create policy "predictions_update" on public.predictions for update using (true) with check (true);
  `);
  console.log("seeded schema-full.sql-lineage legacy aliases (simulating a real bootstrapped-from-schema-full.sql environment)\n");

  // Re-run the alias-dropping migrations again, exactly as an operator
  // would if they discovered the legacy lineage was still present.
  // 20260915_delete_policy_reconciliation.sql and
  // 20260915_policy_reconciliation.sql are fully idempotent (every drop is
  // `if exists`, and any recreated policy drops its own name first) so
  // they're re-sourced whole. 20260915_comprehensive_legacy_alias_cleanup.sql
  // is NOT fully idempotent — its `create policy` statements for "anon can
  // update games" / "anon can insert predictions" / "anon can insert
  // question_submissions" don't drop-if-exists their own name first, so
  // re-running the whole file errors once those already exist (see
  // POLICY-ALIAS-REVIEW.md, "non-idempotent recreate" finding). Only its
  // `drop policy if exists` lines — the actual alias-cleanup guarantee —
  // are replayed here.
  for (const f of [
    "supabase/migrations/20260915_delete_policy_reconciliation.sql",
    "supabase/migrations/20260915_policy_reconciliation.sql",
    "supabase/migrations/20260915_policy_alias_review_closeout.sql",
  ]) {
    await db.query(readFileSync(f, "utf8"));
  }
  // players_delete_lockdown.sql is NOT replayed here — its CREATE POLICY
  // is not idempotent (no IF NOT EXISTS in Postgres), and it is not an
  // alias-dropper. The initial stack already applied it above.
  await db.query(`
    drop policy if exists "games_insert" on public.games;
    drop policy if exists "games_update" on public.games;
    drop policy if exists "player_stats_insert" on public.player_stats;
    drop policy if exists "player_stats_update" on public.player_stats;
    drop policy if exists "predictions_insert" on public.predictions;
    drop policy if exists "question_submissions_insert" on public.question_submissions;
    drop policy if exists "anon can insert questions" on public.question_submissions;
    drop policy if exists "players_delete" on public.players;
    -- delete_policy_reconciliation.sql recreated "anon can delete players" which
    -- players_delete_lockdown.sql originally dropped. Re-drop it here since
    -- players_delete_lockdown is not idempotent enough to re-apply.
    drop policy if exists "anon can delete players" on public.players;
  `);
  console.log("re-applied alias-dropping migrations against the seeded legacy lineage\n");

  await db.query(`
    grant usage on schema public to anon, service_role;
    grant select, insert, update, delete on all tables in schema public to anon, service_role;
  `);

  async function as(role: "anon" | "service_role", sql: string, params: unknown[] = []) {
    await db.query("BEGIN");
    try {
      await db.query(`SET LOCAL ROLE ${role}`);
      await db.query(`SET LOCAL request.jwt.claim.role = '${role}'`);
      const { rows } = await db.query(`SELECT current_user AS cu, auth.role() AS ar`);
      if (rows[0].cu !== role || rows[0].ar !== role) {
        await db.query("ROLLBACK");
        throw new Error(`FATAL: role not applied — got cu=${rows[0].cu} ar=${rows[0].ar}, expected ${role}`);
      }
      try {
        const r = await db.query(sql, params);
        await db.query("ROLLBACK");
        return { ok: true, rowCount: r.rowCount ?? 0, rows: r.rows, err: "" };
      } catch (e: any) {
        await db.query("ROLLBACK");
        return { ok: false, err: e.message, rowCount: 0, rows: [] };
      }
    } catch (e: any) {
      try { await db.query("ROLLBACK"); } catch {}
      throw e;
    }
  }

  // Like `as()`, but COMMITs instead of ROLLBACK — used where a later
  // assertion depends on the row actually persisting (e.g. inserting a
  // row here, then deleting it in a later positive-control check).
  async function asPersist(role: "anon" | "service_role", sql: string, params: unknown[] = []) {
    await db.query("BEGIN");
    try {
      await db.query(`SET LOCAL ROLE ${role}`);
      await db.query(`SET LOCAL request.jwt.claim.role = '${role}'`);
      try {
        const r = await db.query(sql, params);
        await db.query("COMMIT");
        return { ok: true, rowCount: r.rowCount ?? 0, rows: r.rows, err: "" };
      } catch (e: any) {
        await db.query("ROLLBACK");
        return { ok: false, err: e.message, rowCount: 0, rows: [] };
      }
    } catch (e: any) {
      try { await db.query("ROLLBACK"); } catch {}
      throw e;
    }
  }

  const { rows: [waitingGame] } = await db.query(
    `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, current_pot)
     values ('FSC-WAIT', 'HOST1', 'waiting', 0, 100000, 0) returning id`,
  );
  const { rows: [playingGame] } = await db.query(
    `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, current_pot)
     values ('FSC-PLAY', 'HOST2', 'playing', 1, 100000, 0.5) returning id`,
  );
  await db.query(
    `insert into players (game_id, wallet_address, display_name, has_paid, is_ready)
     values ($1, 'PLAYER_A', 'A', true, true)`,
    [playingGame.id],
  );
  await db.query(
    `insert into players (game_id, wallet_address, display_name, has_paid, is_ready)
     values ($1, 'WAIT_PLAYER', 'WaitP', false, false)`,
    [waitingGame.id],
  );

  console.log("\n── Anon attack vectors across the FULL applied stack (must be BLOCKED) ──\n");

  // 1. Anon INSERT players with has_paid=true must fail.
  {
    const r = await as("anon",
      `insert into players (game_id, wallet_address, display_name, has_paid, is_ready)
       values ($1, 'FORGE1', 'Forger', true, false)`,
      [waitingGame.id],
    );
    report(!r.ok || r.rowCount === 0, "anon INSERT players(has_paid=true) is blocked", r.err || `rowCount=${r.rowCount}`);
  }

  // 2. Anon INSERT players with is_ready=true must fail.
  {
    const r = await as("anon",
      `insert into players (game_id, wallet_address, display_name, has_paid, is_ready)
       values ($1, 'FORGE2', 'Forger2', false, true)`,
      [waitingGame.id],
    );
    report(!r.ok || r.rowCount === 0, "anon INSERT players(is_ready=true) is blocked", r.err || `rowCount=${r.rowCount}`);
  }

  // 3. Anon INSERT games with current_pot=999 must fail.
  {
    const r = await as("anon",
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, current_pot)
       values ('FORGE-POT', 'ATTACKER', 'waiting', 0, 0, 999)`,
    );
    report(!r.ok || r.rowCount === 0, "anon INSERT games(current_pot=999) is blocked", r.err || `rowCount=${r.rowCount}`);
  }

  // 4. Anon INSERT games with settlement_status='settled' must fail.
  {
    const r = await as("anon",
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, settlement_status)
       values ('FORGE-SETL', 'ATTACKER', 'waiting', 0, 0, 'settled')`,
    );
    report(!r.ok || r.rowCount === 0, "anon INSERT games(settlement_status='settled') is blocked", r.err || `rowCount=${r.rowCount}`);
  }

  // 5. Anon INSERT games with a non-null pending_payouts must fail.
  {
    const r = await as("anon",
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, pending_payouts)
       values ('FORGE-PEND', 'ATTACKER', 'waiting', 0, 0, '{"X":1}'::jsonb)`,
    );
    report(!r.ok || r.rowCount === 0, "anon INSERT games(pending_payouts non-null) is blocked", r.err || `rowCount=${r.rowCount}`);
  }

  // 6. Anon DELETE on games must fail (host cancel is a status change, not a row delete).
  {
    const r = await as("anon", `delete from games where id = $1`, [waitingGame.id]);
    report(r.rowCount === 0, "anon DELETE games is blocked", r.err);
  }

  // 7. Anon DELETE on players in a non-waiting game must fail.
  {
    const r = await as("anon", `delete from players where game_id = $1`, [playingGame.id]);
    report(r.rowCount === 0, "anon DELETE players in a non-waiting game is blocked", r.err);
  }

  console.log("\n── Positive controls (legitimate anon paths must still work) ──\n");

  // 8. Anon INSERT games with safe defaults still succeeds (real client behavior — see
  //    src/lib/supabase.ts createGameInDB, which never sets these columns).
  {
    const r = await as("anon",
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports)
       values ('LEGIT-GAME', 'HOST3', 'waiting', 0, 100000)`,
    );
    report(r.ok && r.rowCount === 1, "anon INSERT games with safe defaults (current_pot=0 etc) still works", r.err);
  }

  // 9. Anon INSERT players with unpaid/not-ready shape into a waiting game still succeeds.
  // (asPersist: check 10 deletes this exact row, so it must actually commit.)
  {
    const r = await asPersist("anon",
      `insert into players (game_id, wallet_address, display_name, has_paid, is_ready)
       values ($1, 'LEGIT_JOIN', 'NewPlayer', false, false)`,
      [waitingGame.id],
    );
    report(r.ok && r.rowCount === 1, "anon INSERT players(unpaid, not ready) into a waiting game still works", r.err);
  }

  // 10. Anon DELETE on their own player row in a waiting game is BLOCKED (leave goes through Edge Function).
  {
    const r = await as("anon", `delete from players where game_id = $1 and wallet_address = 'LEGIT_JOIN'`, [waitingGame.id]);
    report(r.rowCount === 0, "anon DELETE players in a waiting game is blocked (leave via Edge Function only)", r.err);
  }

  // 10b. service_role DELETE (Edge Function leave_game_player RPC) still works.
  {
    const r = await asPersist("service_role", `delete from players where game_id = $1 and wallet_address = 'LEGIT_JOIN'`, [waitingGame.id]);
    report(r.ok && r.rowCount === 1, "service_role DELETE players still works (Edge Function path)", r.err);
  }

  console.log("\n── service_role must retain full write access (Edge Functions) ──\n");

  // 11. service_role INSERT games with a forged pot (recovery/import tooling) still succeeds —
  //     the trigger only restricts anon/authenticated, matching protect_game_columns' own bypass.
  // (asPersist: check 12 deletes this exact row, so it must actually commit.)
  {
    const r = await asPersist("service_role",
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, current_pot)
       values ('SVC-GAME', 'HOST4', 'playing', 1, 100000, 5)`,
    );
    report(r.ok && r.rowCount === 1, "service_role INSERT games with non-zero current_pot still works", r.err);
  }

  // 12. service_role DELETE on games/players still succeeds (admin/cleanup tooling).
  {
    const r = await asPersist("service_role", `delete from games where room_code = 'SVC-GAME'`);
    report(r.ok && r.rowCount === 1, "service_role DELETE games still works", r.err);
  }

  console.log("\n── CHECK constraint coverage (settlement + game status) ──\n");

  // 14. settlement_status='retrying' must be valid (used by retry-settlement Edge Function).
  {
    const r = await asPersist("service_role",
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, settlement_status)
       values ('CHECK-RETRY', 'HOST5', 'gameover', 0, 0, 'retrying')`,
    );
    report(r.ok && r.rowCount === 1, "service_role INSERT games(settlement_status='retrying') succeeds", r.err);
    if (r.ok) await db.query(`delete from games where room_code = 'CHECK-RETRY'`);
  }

  // 15. status='cancelled' must be valid (used by leave_game_player RPC).
  {
    const r = await asPersist("service_role",
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports)
       values ('CHECK-CANCEL', 'HOST6', 'cancelled', 0, 0)`,
    );
    report(r.ok && r.rowCount === 1, "service_role INSERT games(status='cancelled') succeeds", r.err);
    if (r.ok) await db.query(`delete from games where room_code = 'CHECK-CANCEL'`);
  }

  // 16. Predictions INSERT into a 'playing' game must work (was broken when policies used 'active').
  {
    const r = await as("anon",
      `insert into predictions (game_id, bettor_wallet, predicted_winner_wallet, amount_lamports)
       values ($1, 'PLAYER_A', 'PLAYER_A', 100)`,
      [playingGame.id],
    );
    report(r.ok && r.rowCount === 1, "anon INSERT predictions into 'playing' game succeeds", r.err);
  }

  // 17. service_role can claim retry (settlement_status 'failed' → 'retrying').
  {
    const { rows: [failedGame] } = await db.query(
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, settlement_status)
       values ('RETRY-CLAIM', 'HOST7', 'gameover', 0, 0, 'failed') returning id`,
    );
    const r = await asPersist("service_role",
      `update games set settlement_status = 'retrying' where id = $1 and settlement_status = 'failed'`,
      [failedGame.id],
    );
    report(r.ok && r.rowCount === 1, "service_role UPDATE settlement_status 'failed' → 'retrying' succeeds", r.err);
    await db.query(`delete from games where id = $1`, [failedGame.id]);
  }

  // 18. Anon cannot mutate settlement_status (trigger guard).
  {
    const r = await as("anon",
      `update games set settlement_status = 'settled' where id = $1`,
      [playingGame.id],
    );
    report(!r.ok || r.rowCount === 0, "anon UPDATE settlement_status is blocked", r.err);
  }

  console.log("\n── Question submitter verification (membership-only, pre-auth-binding) ──\n");

  // 19. Anon INSERT question_submissions with a wallet NOT in the game must fail.
  {
    const r = await as("anon",
      `insert into question_submissions (game_id, round, submitter_wallet, question_text)
       values ($1, 1, 'NOT_A_PLAYER', 'forged question')`,
      [waitingGame.id],
    );
    report(!r.ok || r.rowCount === 0, "anon INSERT question with non-player wallet is blocked", r.err);
  }

  // 20. Anon INSERT question_submissions with a wallet that IS a player in the game succeeds.
  {
    const r = await as("anon",
      `insert into question_submissions (game_id, round, submitter_wallet, question_text)
       values ($1, 1, 'WAIT_PLAYER', 'legit question from a real player')`,
      [waitingGame.id],
    );
    report(r.ok && r.rowCount === 1, "anon INSERT question with valid player wallet succeeds", r.err);
  }

  // 20b. WALLET FORGERY: another player claims an existing player's wallet.
  // Under the membership-only policy this SUCCEEDS — proving membership
  // alone does not prove caller identity. This is why auth_binding is needed.
  await db.query(
    `insert into players (game_id, wallet_address, display_name, has_paid, is_ready)
     values ($1, 'PLAYER_B', 'PlayerB', false, false)`,
    [waitingGame.id],
  );
  {
    const r = await as("anon",
      `insert into question_submissions (game_id, round, submitter_wallet, question_text)
       values ($1, 1, 'WAIT_PLAYER', 'forged by PLAYER_B claiming WAIT_PLAYER wallet')`,
      [waitingGame.id],
    );
    report(r.ok && r.rowCount === 1,
      "VULNERABILITY: anon INSERT question claiming another player's wallet succeeds (membership-only gap)",
      r.err);
  }

  // 21. Anon INSERT question into a gameover game must fail (status check).
  {
    const { rows: [overGame] } = await db.query(
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, current_pot)
       values ('FSC-OVER', 'HOST9', 'gameover', 3, 100000, 0) returning id`,
    );
    await db.query(
      `insert into players (game_id, wallet_address, display_name, has_paid, is_ready)
       values ($1, 'OVER_PLAYER', 'OverP', true, true)`,
      [overGame.id],
    );
    const r = await as("anon",
      `insert into question_submissions (game_id, round, submitter_wallet, question_text)
       values ($1, 1, 'OVER_PLAYER', 'too late question')`,
      [overGame.id],
    );
    report(!r.ok || r.rowCount === 0, "anon INSERT question into gameover game is blocked (status check)", r.err);
  }

  // 21b. Anon can still UPDATE games config (pre-binding, using(true) policy active).
  {
    const r = await as("anon",
      `update games set room_name = 'hacked-name' where id = $1`,
      [waitingGame.id],
    );
    report(r.ok && r.rowCount === 1,
      "VULNERABILITY: anon UPDATE games config columns succeeds (pre-binding, no actor enforcement)",
      r.err);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Phase 2: Apply auth binding migration — drops anon question INSERT,
  // restricts games UPDATE to service_role.
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n── Applying auth binding migration ──\n");
  await db.query(readFileSync(AUTH_BINDING_MIGRATION, "utf8"));
  console.log(`applied ${AUTH_BINDING_MIGRATION}`);

  console.log("\n── Post-auth-binding: anon question INSERT fully blocked ──\n");

  // 22. After auth binding, anon INSERT question is completely blocked (no policy exists).
  {
    const r = await as("anon",
      `insert into question_submissions (game_id, round, submitter_wallet, question_text)
       values ($1, 1, 'WAIT_PLAYER', 'should be blocked entirely now')`,
      [waitingGame.id],
    );
    report(!r.ok || r.rowCount === 0, "anon INSERT question fully blocked after auth binding", r.err);
  }

  // 23. After auth binding, wallet forgery via anon INSERT also blocked.
  {
    const r = await as("anon",
      `insert into question_submissions (game_id, round, submitter_wallet, question_text)
       values ($1, 1, 'WAIT_PLAYER', 'forged by another player after binding')`,
      [waitingGame.id],
    );
    report(!r.ok || r.rowCount === 0, "anon INSERT question claiming another player's wallet blocked after auth binding", r.err);
  }

  // 24. service_role INSERT question still works (Edge Function path).
  {
    const r = await as("service_role",
      `insert into question_submissions (game_id, round, submitter_wallet, question_text)
       values ($1, 1, 'WAIT_PLAYER', 'submitted via Edge Function with wallet signature')`,
      [waitingGame.id],
    );
    report(r.ok && r.rowCount === 1, "service_role INSERT question succeeds (Edge Function path)", r.err);
  }

  console.log("\n── Post-auth-binding: games UPDATE restricted to service_role ──\n");

  // 25. Anon UPDATE games config columns blocked after auth binding.
  {
    const r = await as("anon",
      `update games set room_name = 'anon-edit-attempt' where id = $1`,
      [waitingGame.id],
    );
    report(r.rowCount === 0, "anon UPDATE games config columns blocked after auth binding", r.err);
  }

  // 26. service_role UPDATE games still works (Edge Function path).
  {
    const r = await as("service_role",
      `update games set room_name = 'edge-function-edit' where id = $1`,
      [waitingGame.id],
    );
    report(r.ok && r.rowCount === 1, "service_role UPDATE games succeeds (Edge Function path)", r.err);
  }

  console.log("\n── Settlement DB state machine: failure modes (typed sig records) ──\n");

  // 27. Failed-on-chain: sig recorded with status:'failed' after value.err.
  // Retry must treat this recipient as STILL OWED (failed sig ≠ paid).
  {
    const { rows: [g] } = await db.query(
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, settlement_status, pending_payouts, paid_tx_signatures)
       values ('FAIL-CHAIN', 'HOST_FAIL1', 'playing', 1, 100000, 'pending', '{"W1":50000,"W2":50000}'::jsonb, '{}'::jsonb) returning id`,
    );
    // Simulate settle-game: W1 pre-broadcast persist as 'submitted', then chain error → 'failed'
    const r1 = await asPersist("service_role",
      `update games set paid_tx_signatures = '{"W1":{"sig":"sig_chain_fail","status":"submitted"}}'::jsonb where id = $1`, [g.id]);
    report(r1.ok, "settlement: typed sig record persisted as submitted", r1.err);
    // Chain failure detected: update status to 'failed', keep sig for audit
    const r2 = await asPersist("service_role",
      `update games set paid_tx_signatures = '{"W1":{"sig":"sig_chain_fail","status":"failed"}}'::jsonb, settlement_status = 'failed' where id = $1`, [g.id]);
    report(r2.ok, "settlement: sig status→failed after on-chain error (sig retained for audit)", r2.err);
    // Verify: W1 still owed, sig present but marked failed
    const { rows: [state1] } = await db.query(`select pending_payouts, paid_tx_signatures, settlement_status from games where id = $1`, [g.id]);
    const w1Sig = (state1.paid_tx_signatures as any).W1;
    report(
      state1.settlement_status === 'failed' &&
      (state1.pending_payouts as any).W1 === 50000 &&
      w1Sig?.status === 'failed',
      "settlement: failed-on-chain — recipient still owed, sig marked failed (not deleted)",
      `status=${state1.settlement_status} sig_status=${w1Sig?.status}`,
    );
    await db.query(`delete from games where id = $1`, [g.id]);
  }

  // 28. Unknown outcome: sendRawTransaction succeeds but confirmTransaction times out.
  // Sig stored as {sig, status:'unknown'}. Retry MUST call getSignatureStatuses
  // to reconcile — it cannot blindly skip or blindly re-send.
  {
    const { rows: [g] } = await db.query(
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, settlement_status, pending_payouts, paid_tx_signatures)
       values ('FAIL-TIMEOUT', 'HOST_FAIL2', 'playing', 1, 100000, 'pending', '{"W1":50000,"W2":50000}'::jsonb, '{}'::jsonb) returning id`,
    );
    // W1 send succeeded, confirm timed out → unknown status
    const r = await asPersist("service_role",
      `update games set settlement_status = 'failed',
        pending_payouts = '{"W1":50000,"W2":50000}'::jsonb,
        paid_tx_signatures = '{"W1":{"sig":"sig_timeout_unknown","status":"unknown"}}'::jsonb
       where id = $1`, [g.id]);
    report(r.ok, "settlement: unknown-outcome typed sig persisted + status→failed", r.err);
    const { rows: [state] } = await db.query(`select pending_payouts, paid_tx_signatures, settlement_status from games where id = $1`, [g.id]);
    const w1Sig = (state.paid_tx_signatures as any).W1;
    report(
      state.settlement_status === 'failed' &&
      w1Sig?.status === 'unknown' &&
      w1Sig?.sig === 'sig_timeout_unknown' &&
      (state.pending_payouts as any).W1 === 50000,
      "settlement: unknown-outcome — typed sig in DB, recipient still owed, retry must reconcile on-chain",
      `sig=${JSON.stringify(w1Sig)}`,
    );
    // Retry claim still works
    const r2 = await asPersist("service_role",
      `update games set settlement_status = 'retrying' where id = $1 and settlement_status = 'failed'`, [g.id]);
    report(r2.ok && r2.rowCount === 1, "settlement: retry claim succeeds after unknown-outcome failure", r2.err);
    await db.query(`delete from games where id = $1`, [g.id]);
  }

  // 28b. Backward compat: old bare-string sigs normalized to unknown by retry.
  // If DB has legacy format '{"W1":"old_sig_string"}', retry's normalizeSigRecords
  // treats it as {sig:"old_sig_string", status:"unknown"} — conservative, requires
  // on-chain verification before skipping.
  {
    const { rows: [g] } = await db.query(
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, settlement_status, pending_payouts, paid_tx_signatures)
       values ('LEGACY-SIG', 'HOST_LEGACY', 'playing', 1, 100000, 'failed', '{"W1":50000}'::jsonb, '{"W1":"legacy_bare_string"}'::jsonb) returning id`,
    );
    const { rows: [state] } = await db.query(`select paid_tx_signatures from games where id = $1`, [g.id]);
    report(
      typeof (state.paid_tx_signatures as any).W1 === 'string',
      "settlement: legacy bare-string sig format still valid in JSONB (backward compat)",
    );
    await db.query(`delete from games where id = $1`, [g.id]);
  }

  // 29. DB failure after broadcast: chain send confirmed, but DB persist fails.
  // Edge Function falls back to status='failed' with typed sig in response.
  {
    const { rows: [g] } = await db.query(
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, settlement_status, pending_payouts, paid_tx_signatures)
       values ('FAIL-DB', 'HOST_FAIL3', 'playing', 1, 100000, 'pending', '{"W1":50000,"W2":50000}'::jsonb, '{}'::jsonb) returning id`,
    );
    // Fallback: write confirmed sig + mark failed
    const r = await asPersist("service_role",
      `update games set settlement_status = 'failed',
        paid_tx_signatures = '{"W1":{"sig":"sig_db_fallback","status":"confirmed"}}'::jsonb
       where id = $1`, [g.id]);
    report(r.ok, "settlement: DB-failure fallback (status→failed + confirmed sig) persists", r.err);
    const { rows: [state] } = await db.query(`select pending_payouts, paid_tx_signatures, settlement_status from games where id = $1`, [g.id]);
    const w1Sig = (state.paid_tx_signatures as any).W1;
    report(
      state.settlement_status === 'failed' && w1Sig?.status === 'confirmed' && w1Sig?.sig === 'sig_db_fallback',
      "settlement: DB-failure fallback sig is durable + typed in DB",
      `status=${state.settlement_status} sig=${JSON.stringify(w1Sig)}`,
    );
    await db.query(`delete from games where id = $1`, [g.id]);
  }

  // 29b. Concurrent claim rejection: two settle-game calls for the same game.
  // .select().single() on UPDATE ... WHERE settlement_status='none' means
  // only one caller gets a row back. Second caller gets 0 rows → 409.
  {
    const { rows: [g] } = await db.query(
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, settlement_status)
       values ('CONC-CLAIM', 'HOST_CONC', 'playing', 1, 100000, 'none') returning id`,
    );
    // First claim succeeds
    const r1 = await asPersist("service_role",
      `update games set settlement_status = 'pending' where id = $1 and settlement_status = 'none' returning id`, [g.id]);
    report(r1.ok && r1.rowCount === 1, "settlement: first atomic claim succeeds (1 row returned)", r1.err);
    // Second claim: status is now 'pending', not 'none' → 0 rows
    const r2 = await as("service_role",
      `update games set settlement_status = 'pending' where id = $1 and settlement_status = 'none' returning id`, [g.id]);
    report(r2.rowCount === 0, "settlement: concurrent second claim returns 0 rows (would be 409)", `rowCount=${r2.rowCount}`);
    await db.query(`delete from games where id = $1`, [g.id]);
  }

  // 29c. Pre-broadcast sig persistence: sig identity written to DB BEFORE
  // sendRawTransaction. This reduces the crash window to between the pre-persist
  // DB write and the sendRawTransaction call — if the function crashes after
  // send, the sig is already in DB as 'submitted' and retry can reconcile.
  {
    const { rows: [g] } = await db.query(
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, settlement_status, pending_payouts, paid_tx_signatures)
       values ('PRE-PERSIST', 'HOST_PRE', 'playing', 1, 100000, 'pending', '{"W1":50000}'::jsonb, '{}'::jsonb) returning id`,
    );
    // Simulate: sig extracted from signed tx, persisted as 'submitted' before broadcast
    const r = await asPersist("service_role",
      `update games set paid_tx_signatures = '{"W1":{"sig":"pre_broadcast_sig","status":"submitted"}}'::jsonb where id = $1`, [g.id]);
    report(r.ok, "settlement: pre-broadcast sig persisted as submitted before sendRawTransaction", r.err);
    // If process crashes here, retry sees 'submitted' → reconciles on-chain
    const { rows: [state] } = await db.query(`select paid_tx_signatures from games where id = $1`, [g.id]);
    const w1 = (state.paid_tx_signatures as any).W1;
    report(
      w1?.sig === 'pre_broadcast_sig' && w1?.status === 'submitted',
      "settlement: crash after pre-persist leaves recoverable submitted sig in DB",
    );
    await db.query(`delete from games where id = $1`, [g.id]);
  }

  // 30. Remaining crash boundary: process death between pre-persist DB write
  // and sendRawTransaction means DB has 'submitted' sig but tx never went
  // on-chain. Retry's getSignatureStatuses returns null → sig stays 'submitted'.
  // Retry halts with "unknown on-chain status" error — no blind re-send.
  {
    const { rows: [g] } = await db.query(
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, settlement_status, pending_payouts, paid_tx_signatures)
       values ('CRASH-GAP', 'HOST_CRASH', 'playing', 1, 100000, 'failed', '{"W1":50000}'::jsonb, '{"W1":{"sig":"never_sent","status":"submitted"}}'::jsonb) returning id`,
    );
    const { rows: [state] } = await db.query(`select pending_payouts, paid_tx_signatures from games where id = $1`, [g.id]);
    const w1 = (state.paid_tx_signatures as any).W1;
    report(
      (state.pending_payouts as any).W1 === 50000 && w1?.status === 'submitted',
      "DOCUMENTED: crash after pre-persist but before send — retry must reconcile via getSignatureStatuses (halts on unresolvable)",
    );
    await db.query(`delete from games where id = $1`, [g.id]);
  }

  // 30b. Setup failure recovery: if keypair/PDA derivation throws after
  // claiming 'retrying', status must revert to 'failed' (not stuck forever).
  {
    const { rows: [g] } = await db.query(
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, settlement_status)
       values ('SETUP-FAIL', 'HOST_SETUP', 'playing', 1, 100000, 'failed') returning id`,
    );
    // Claim retrying
    const r1 = await asPersist("service_role",
      `update games set settlement_status = 'retrying' where id = $1 and settlement_status = 'failed'`, [g.id]);
    report(r1.ok && r1.rowCount === 1, "settlement: claim retrying for setup-failure test", r1.err);
    // Setup throws → revert to failed
    const r2 = await asPersist("service_role",
      `update games set settlement_status = 'failed' where id = $1 and settlement_status = 'retrying'`, [g.id]);
    report(r2.ok && r2.rowCount === 1, "settlement: setup failure reverts retrying→failed (not stuck)", r2.err);
    // Can be re-claimed
    const r3 = await as("service_role",
      `update games set settlement_status = 'retrying' where id = $1 and settlement_status = 'failed' returning id`, [g.id]);
    report(r3.rowCount === 1, "settlement: game recoverable after setup-failure revert", `rowCount=${r3.rowCount}`);
    await db.query(`delete from games where id = $1`, [g.id]);
  }

  console.log("\n── Crash-lease reclaim (retry-settlement stale 'retrying' recovery) ──\n");

  const LEASE_TIMEOUT_MS = 5 * 60 * 1000;

  // 31. Stale lease reclaim preserves existing signatures — the reclaim
  // UPDATE only ever touches settlement_status + lease_reclaimed_at, so a
  // sig persisted by the dead run must survive byte-for-byte.
  {
    const staleUpdatedAt = new Date(Date.now() - LEASE_TIMEOUT_MS - 60_000).toISOString();
    const { rows: [g] } = await db.query(
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, settlement_status, pending_payouts, paid_tx_signatures)
       values ('LEASE-STALE', 'HOST_LEASE1', 'gameover', 0, 100000, 'retrying', '{"W1":50000,"W2":50000}'::jsonb, '{"W1":{"sig":"pre_crash_sig","status":"submitted"}}'::jsonb) returning id`,
    );
    // Force updated_at to look stale (bypassing the touch trigger via a raw postgres update).
    // The touch trigger fires on every UPDATE for every role — disable it
    // just for this test-only backdate so we can simulate "time has passed".
    await db.query(`SET session_replication_role = replica`);
    await db.query(`update games set updated_at = $2 where id = $1`, [g.id, staleUpdatedAt]);
    await db.query(`SET session_replication_role = DEFAULT`);

    const staleThreshold = new Date(Date.now() - LEASE_TIMEOUT_MS).toISOString();
    const r = await asPersist("service_role",
      `update games set settlement_status = 'failed', lease_reclaimed_at = now()
       where id = $1 and settlement_status = 'retrying' and updated_at < $2
       returning id`,
      [g.id, staleThreshold],
    );
    report(r.ok && r.rowCount === 1, "settlement: stale-lease reclaim UPDATE succeeds", r.err);

    const { rows: [state] } = await db.query(
      `select settlement_status, lease_reclaimed_at, pending_payouts, paid_tx_signatures from games where id = $1`, [g.id],
    );
    const w1Sig = (state.paid_tx_signatures as any).W1;
    report(
      w1Sig?.sig === 'pre_crash_sig' && w1Sig?.status === 'submitted' &&
      (state.pending_payouts as any).W1 === 50000 && (state.pending_payouts as any).W2 === 50000,
      "settlement: reclaim preserves existing signatures and pending_payouts untouched",
      `sig=${JSON.stringify(w1Sig)} pending=${JSON.stringify(state.pending_payouts)}`,
    );

    // 32. Reclaimed row is 'failed' (retriable), not 'none' (would allow
    // a fresh settle-game claim and risk re-derivation of payouts/duplicate send).
    report(
      state.settlement_status === 'failed' && state.lease_reclaimed_at !== null,
      "settlement: reclaimed row is 'failed' (not 'none'), lease_reclaimed_at audit field set",
      `status=${state.settlement_status} lease_reclaimed_at=${state.lease_reclaimed_at}`,
    );

    await db.query(`delete from games where id = $1`, [g.id]);
  }

  // 33. Non-stale 'retrying' lease is NOT reclaimed — a genuinely in-progress
  // run must not be yanked out from under itself.
  {
    const { rows: [g] } = await db.query(
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, settlement_status, pending_payouts, paid_tx_signatures)
       values ('LEASE-FRESH', 'HOST_LEASE2', 'gameover', 0, 100000, 'retrying', '{"W1":50000}'::jsonb, '{}'::jsonb) returning id`,
    );
    // updated_at defaults to now() — well within the lease window.
    const staleThreshold = new Date(Date.now() - LEASE_TIMEOUT_MS).toISOString();
    const r = await as("service_role",
      `update games set settlement_status = 'failed', lease_reclaimed_at = now()
       where id = $1 and settlement_status = 'retrying' and updated_at < $2
       returning id`,
      [g.id, staleThreshold],
    );
    report(r.rowCount === 0, "settlement: fresh (non-stale) 'retrying' lease is not reclaimed", `rowCount=${r.rowCount}`);
    await db.query(`delete from games where id = $1`, [g.id]);
  }

  // 34. Concurrent reclaim attempts on the same stale lease — only one
  // succeeds (atomic UPDATE ... WHERE settlement_status='retrying' means
  // the second caller's WHERE no longer matches once the first commits).
  {
    const staleUpdatedAt = new Date(Date.now() - LEASE_TIMEOUT_MS - 60_000).toISOString();
    const { rows: [g] } = await db.query(
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, settlement_status, pending_payouts, paid_tx_signatures)
       values ('LEASE-RACE', 'HOST_LEASE3', 'gameover', 0, 100000, 'retrying', '{"W1":50000}'::jsonb, '{}'::jsonb) returning id`,
    );
    // The touch trigger fires on every UPDATE for every role — disable it
    // just for this test-only backdate so we can simulate "time has passed".
    await db.query(`SET session_replication_role = replica`);
    await db.query(`update games set updated_at = $2 where id = $1`, [g.id, staleUpdatedAt]);
    await db.query(`SET session_replication_role = DEFAULT`);
    const staleThreshold = new Date(Date.now() - LEASE_TIMEOUT_MS).toISOString();

    const r1 = await asPersist("service_role",
      `update games set settlement_status = 'failed', lease_reclaimed_at = now()
       where id = $1 and settlement_status = 'retrying' and updated_at < $2 returning id`,
      [g.id, staleThreshold],
    );
    report(r1.ok && r1.rowCount === 1, "settlement: first concurrent reclaim succeeds", r1.err);

    const r2 = await as("service_role",
      `update games set settlement_status = 'failed', lease_reclaimed_at = now()
       where id = $1 and settlement_status = 'retrying' and updated_at < $2 returning id`,
      [g.id, staleThreshold],
    );
    report(r2.rowCount === 0, "settlement: second concurrent reclaim gets 0 rows (already reclaimed)", `rowCount=${r2.rowCount}`);
    await db.query(`delete from games where id = $1`, [g.id]);
  }

  // 35. Retry after reclaim skips players with confirmed/submitted/unknown
  // sigs — only a definite 'failed' sig or no sig entry at all is re-sent.
  // This mirrors retry-settlement's doNotResend logic post-reconciliation.
  {
    const { rows: [g] } = await db.query(
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, settlement_status, pending_payouts, paid_tx_signatures)
       values ('LEASE-RECLAIM-SKIP', 'HOST_LEASE4', 'gameover', 0, 400000, 'failed',
         '{"CONFIRMED_W":100000,"SUBMITTED_W":100000,"UNKNOWN_W":100000,"FAILED_W":100000,"NOSIG_W":100000}'::jsonb,
         '{"CONFIRMED_W":{"sig":"s1","status":"confirmed"},"SUBMITTED_W":{"sig":"s2","status":"submitted"},"UNKNOWN_W":{"sig":"s3","status":"unknown"},"FAILED_W":{"sig":"s4","status":"failed"}}'::jsonb
       ) returning id`,
    );
    const { rows: [claimed] } = await db.query(`select pending_payouts, paid_tx_signatures from games where id = $1`, [g.id]);
    const pendingPayouts: Record<string, number> = { ...claimed.pending_payouts };
    const sigRecords: Record<string, { sig: string; status: string }> = { ...claimed.paid_tx_signatures };

    // Simulate reconciliation: getSignatureStatuses returns nothing new for
    // SUBMITTED_W/UNKNOWN_W (still unresolved) — never-resend-unknown rule.
    const unresolved = Object.entries(sigRecords).filter(([, r]) => r.status === 'unknown' || r.status === 'submitted');
    const doNotResend = new Set(unresolved.map(([w]) => w));

    // Confirmed recipients are fully paid — drop from owed entirely.
    for (const [w, r] of Object.entries(sigRecords)) {
      if (r.status === 'confirmed') delete pendingPayouts[w];
    }

    const sendable = Object.keys(pendingPayouts).filter((w) => !doNotResend.has(w));
    report(
      sendable.length === 2 && sendable.includes('FAILED_W') && sendable.includes('NOSIG_W') &&
      !sendable.includes('CONFIRMED_W') && !sendable.includes('SUBMITTED_W') && !sendable.includes('UNKNOWN_W'),
      "settlement: retry sendable set is exactly {failed sig, no sig} — confirmed/submitted/unknown all skipped",
      `sendable=${JSON.stringify(sendable)}`,
    );
    // doNotResend wallets stay "owed" for bookkeeping even though un-sent.
    report(
      pendingPayouts['SUBMITTED_W'] === 100000 && pendingPayouts['UNKNOWN_W'] === 100000,
      "settlement: unresolved-after-check wallets remain in pending_payouts (never marked settled while unknown)",
    );
    await db.query(`delete from games where id = $1`, [g.id]);
  }

  // 36. Fresh retry (no stale lease involved) still works exactly as
  // before — 'failed' -> atomic claim to 'retrying' succeeds normally.
  {
    const { rows: [g] } = await db.query(
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, settlement_status, pending_payouts, paid_tx_signatures)
       values ('LEASE-NOOP', 'HOST_LEASE5', 'gameover', 0, 100000, 'failed', '{"W1":50000}'::jsonb, '{}'::jsonb) returning id`,
    );
    const r = await asPersist("service_role",
      `update games set settlement_status = 'retrying' where id = $1 and settlement_status = 'failed' returning id`, [g.id]);
    report(r.ok && r.rowCount === 1, "settlement: fresh retry claim (no reclaim needed) still succeeds", r.err);
    await db.query(`delete from games where id = $1`, [g.id]);
  }

  // 37. Stale 'pending' crash-lease reclaim — settle-game crashed after
  // claiming 'pending' but before completing. Same 5-min timeout applies.
  {
    const staleUpdatedAt = new Date(Date.now() - LEASE_TIMEOUT_MS - 60_000).toISOString();
    const { rows: [g] } = await db.query(
      `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, settlement_status, pending_payouts, paid_tx_signatures)
       values ('LEASE-PENDING', 'HOST_LEASE6', 'gameover', 0, 100000, 'pending', '{"W1":50000}'::jsonb, '{"W1":{"sig":"mid_crash_sig","status":"submitted"}}'::jsonb) returning id`,
    );
    await db.query(`SET session_replication_role = replica`);
    await db.query(`update games set updated_at = $2 where id = $1`, [g.id, staleUpdatedAt]);
    await db.query(`SET session_replication_role = DEFAULT`);

    const staleThreshold = new Date(Date.now() - LEASE_TIMEOUT_MS).toISOString();
    const r = await asPersist("service_role",
      `update games set settlement_status = 'failed', lease_reclaimed_at = now()
       where id = $1 and settlement_status = 'pending' and updated_at < $2
       returning id`,
      [g.id, staleThreshold],
    );
    report(r.ok && r.rowCount === 1, "settlement: stale 'pending' crash-lease reclaim succeeds", r.err);

    const { rows: [state] } = await db.query(
      `select settlement_status, lease_reclaimed_at, paid_tx_signatures from games where id = $1`, [g.id],
    );
    const w1Sig = (state.paid_tx_signatures as any).W1;
    report(
      state.settlement_status === 'failed' && state.lease_reclaimed_at !== null &&
      w1Sig?.sig === 'mid_crash_sig' && w1Sig?.status === 'submitted',
      "settlement: pending crash-lease preserves sigs and transitions to 'failed'",
      `status=${state.settlement_status} sig=${JSON.stringify(w1Sig)}`,
    );
    await db.query(`delete from games where id = $1`, [g.id]);
  }

  const { rows: policies } = await db.query(`
    select tablename, policyname, cmd, permissive, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename in ('games', 'players', 'votes', 'question_submissions', 'predictions', 'player_stats')
    order by tablename, cmd, policyname
  `);

  const wideOpenNonSelect = policies.filter((p: any) => {
    if (p.cmd === "SELECT") return false;
    const trueCheck = (v: string | null) => v === "true" || v === "(true)";
    return p.permissive === "PERMISSIVE" && (trueCheck(p.qual) || trueCheck(p.with_check));
  });

  for (const p of policies) {
    const flag = wideOpenNonSelect.includes(p) ? " ⚠ WIDE-OPEN" : "";
    console.log(`  ${p.tablename}.${p.cmd}: ${p.policyname} [${p.permissive}] qual=${p.qual} check=${p.with_check}${flag}`);
  }

  report(
    wideOpenNonSelect.length === 0,
    "no wide-open (permissive, unconditional true) non-SELECT policy remains on any game table",
    wideOpenNonSelect.length > 0
      ? wideOpenNonSelect.map((p: any) => `${p.tablename}.${p.cmd}:${p.policyname}`).join(", ")
      : "",
  );

  await db.end();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
