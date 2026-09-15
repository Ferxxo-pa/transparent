/**
 * Verifies the fix: after applying
 * 20260915_server_authoritative_pot_settlement.sql, the attacks from
 * tests/pot-payment-attack.ts are BLOCKED, service_role (Edge Functions)
 * can still write the protected columns, and the normal
 * join -> pay -> ready -> play -> gameover flow still works.
 *
 * Run against a DISPOSABLE local Postgres:
 *   docker run -d --name rls-transparent-fixed -e POSTGRES_PASSWORD=postgres -p 55441:5432 postgres:16
 *   DSN=postgres://postgres:postgres@127.0.0.1:55441/postgres npx tsx tests/pot-payment-fixed.ts
 */

import { readFileSync } from "node:fs";
import pg from "pg";

const DSN = process.env.DSN ?? "postgres://postgres:postgres@127.0.0.1:55441/postgres";

let passed = 0;
let failed = 0;
function report(ok: boolean, name: string, detail = "") {
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? `  (${detail})` : ""}`);
}

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

  for (const f of [
    "supabase/schema.sql",
    "supabase/migrations/predictions.sql",
    "supabase/migrations/20260701_escrow_hardening.sql",
    "supabase/migrations/20260915_server_authoritative_pot_settlement.sql",
  ]) {
    await db.query(readFileSync(f, "utf8"));
    console.log(`applied ${f}`);
  }

  await db.query(`
    grant usage on schema public to anon, service_role;
    grant select, insert, update, delete on all tables in schema public to anon, service_role;
  `);

  const { rows: [game] } = await db.query(
    `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, current_pot)
     values ('POTFX01','HOSTWALLET','playing',1, 100000, 0.5)
     returning id`,
  );
  await db.query(
    `insert into players (game_id, wallet_address, display_name, has_paid, is_ready)
     values ($1, 'ATTACKER_WALLET', 'Attacker', false, false)`,
    [game.id],
  );

  async function as(role: "anon" | "service_role", sql: string, params: unknown[] = []) {
    await db.query("BEGIN");
    try {
      await db.query(`SET LOCAL ROLE ${role}`);
      await db.query(`SET LOCAL request.jwt.claim.role = '${role}'`);
      let roleCheck: { cu: string; ar: string };
      try {
        const { rows } = await db.query(`SELECT current_user AS cu, auth.role() AS ar`);
        roleCheck = rows[0];
      } catch (e: any) {
        await db.query("ROLLBACK");
        throw new Error(`FATAL: role assertion query failed for '${role}' (${e.code ?? "?"}: ${e.message}).`);
      }
      if (roleCheck.cu !== role || roleCheck.ar !== role) {
        await db.query("ROLLBACK");
        throw new Error(`FATAL: role not applied — current_user=${roleCheck.cu}, auth.role()=${roleCheck.ar}, expected ${role}`);
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

  // Like `as()`, but COMMITs instead of ROLLBACK — used for happy-path /
  // recovery steps where a later step depends on the previous write
  // actually landing (the pure permission-boundary tests above use `as()`
  // deliberately, since they only need to prove ALLOWED/BLOCKED, not
  // build up state).
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

  {
    const anonCheck = await as("anon", "SELECT 1 AS ok");
    const svcCheck = await as("service_role", "SELECT 1 AS ok");
    if (!anonCheck.ok || !svcCheck.ok) throw new Error("FATAL: preflight role checks did not execute cleanly");
    console.log("preflight: anon + service_role role assertions OK\n");
  }

  console.log("\n=== FIX VERIFICATION: pot + payment forgery should be BLOCKED ===\n");

  // 1. Anon cannot set current_pot directly
  let r = await as("anon", `UPDATE games SET current_pot = 999999 WHERE id=$1`, [game.id]);
  report(r.rowCount === 0, "BLOCKED: anon cannot set current_pot directly", r.err);

  // 2. Anon cannot set has_paid via UPDATE
  r = await as("anon", `UPDATE players SET has_paid=true WHERE game_id=$1 AND wallet_address='ATTACKER_WALLET'`, [game.id]);
  report(r.rowCount === 0, "BLOCKED: anon cannot set has_paid via UPDATE", r.err);

  // 3. Anon cannot set is_ready via UPDATE
  r = await as("anon", `UPDATE players SET is_ready=true WHERE game_id=$1 AND wallet_address='ATTACKER_WALLET'`, [game.id]);
  report(r.rowCount === 0, "BLOCKED: anon cannot set is_ready via UPDATE", r.err);

  // 4. Anon cannot forge has_paid=true at INSERT time
  const { rows: [waiting] } = await db.query(
    `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports)
     values ('POTFX03','HOST_W','waiting',0,100000) returning id`,
  );
  r = await as("anon",
    `INSERT INTO players (game_id, wallet_address, display_name, has_paid, is_ready)
     VALUES ($1, 'FORGER', 'Forger', true, false)`,
    [waiting.id],
  );
  report(!r.ok || r.rowCount === 0, "BLOCKED: anon cannot INSERT with forged has_paid=true", r.err || `rowCount=${r.rowCount}`);

  // 5. Anon cannot forge is_ready=true at INSERT time
  r = await as("anon",
    `INSERT INTO players (game_id, wallet_address, display_name, has_paid, is_ready)
     VALUES ($1, 'FORGER2', 'Forger2', false, true)`,
    [waiting.id],
  );
  report(!r.ok || r.rowCount === 0, "BLOCKED: anon cannot INSERT with forged is_ready=true", r.err || `rowCount=${r.rowCount}`);

  // 6. Anon cannot forge settlement_status / pending_payouts
  r = await as("anon", `UPDATE games SET settlement_status='settled' WHERE id=$1`, [game.id]);
  report(r.rowCount === 0, "BLOCKED: anon cannot set settlement_status directly", r.err);
  r = await as("anon", `UPDATE games SET pending_payouts='{"X":1}'::jsonb WHERE id=$1`, [game.id]);
  report(r.rowCount === 0, "BLOCKED: anon cannot set pending_payouts directly", r.err);

  console.log("\n=== FIX VERIFICATION: service_role (Edge Functions) still works ===\n");

  // 7. service_role CAN set current_pot (verify-payment / advance-phase path)
  r = await as("service_role", `UPDATE games SET current_pot=1.5 WHERE id=$1`, [game.id]);
  report(r.ok && r.rowCount === 1, "ALLOWED: service_role can set current_pot");

  // 8. service_role CAN set has_paid (verify-payment path)
  r = await as("service_role", `UPDATE players SET has_paid=true WHERE game_id=$1 AND wallet_address='ATTACKER_WALLET'`, [game.id]);
  report(r.ok && r.rowCount === 1, "ALLOWED: service_role can set has_paid (verify-payment)");

  // 9. service_role CAN set is_ready (ready-up-player path), gated by has_paid check done at app layer
  r = await as("service_role", `UPDATE players SET is_ready=true WHERE game_id=$1 AND wallet_address='ATTACKER_WALLET'`, [game.id]);
  report(r.ok && r.rowCount === 1, "ALLOWED: service_role can set is_ready (ready-up-player)");

  // 10. service_role CAN set settlement_status + pending_payouts (settle-game / advance-phase path)
  r = await as("service_role", `UPDATE games SET settlement_status='failed', pending_payouts='{"W1":5000}'::jsonb WHERE id=$1`, [game.id]);
  report(r.ok && r.rowCount === 1, "ALLOWED: service_role can set settlement_status + pending_payouts");

  console.log("\n=== HAPPY PATH: join -> pay -> ready -> play -> gameover still works ===\n");

  // Fresh game for the full happy-path flow.
  const { rows: [hp] } = await db.query(
    `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports)
     values ('HAPPY01','HOST_HP','waiting',0,100000) returning id`,
  );

  // Anon join: legitimate insert (has_paid=false, is_ready=false, waiting game).
  r = await asPersist("anon",
    `INSERT INTO players (game_id, wallet_address, display_name, has_paid, is_ready)
     VALUES ($1, 'PLAYER_HP', 'Player', false, false)`,
    [hp.id],
  );
  report(r.ok && r.rowCount === 1, "HAPPY: anon can join (legit unpaid insert)");

  // Payment: only service_role (verify-payment Edge Function) can flip has_paid.
  r = await asPersist("service_role", `UPDATE players SET has_paid=true WHERE game_id=$1 AND wallet_address='PLAYER_HP'`, [hp.id]);
  report(r.ok && r.rowCount === 1, "HAPPY: service_role marks player paid (verify-payment)");

  // Ready-up: only service_role (ready-up-player Edge Function) can flip is_ready.
  r = await asPersist("service_role", `UPDATE players SET is_ready=true WHERE game_id=$1 AND wallet_address='PLAYER_HP'`, [hp.id]);
  report(r.ok && r.rowCount === 1, "HAPPY: service_role marks player ready (ready-up-player)");

  // Host starts game + raises pot: service_role / advance-phase path.
  r = await asPersist("service_role", `UPDATE games SET status='playing', current_pot=1.0 WHERE id=$1`, [hp.id]);
  report(r.ok && r.rowCount === 1, "HAPPY: service_role starts game and sets pot (advance-phase)");

  // Gameover with successful settlement.
  r = await asPersist("service_role",
    `UPDATE games SET status='gameover', settlement_status='settled', pending_payouts=NULL WHERE id=$1`,
    [hp.id],
  );
  report(r.ok && r.rowCount === 1, "HAPPY: service_role settles game successfully");

  const { rows: [finalGame] } = await db.query(
    `SELECT status, settlement_status, pending_payouts FROM games WHERE id=$1`,
    [hp.id],
  );
  report(
    finalGame.status === "gameover" && finalGame.settlement_status === "settled" && finalGame.pending_payouts === null,
    "HAPPY: final game state is gameover + settled + no pending payouts",
    JSON.stringify(finalGame),
  );

  console.log("\n=== SETTLEMENT RECOVERY: failed payout stays visible + retryable ===\n");

  const { rows: [failGame] } = await db.query(
    `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, current_pot)
     values ('FAILSET01','HOST_FS','playing',3,100000,2.0) returning id`,
  );
  // Simulate the client reporting a partial distribute() failure.
  r = await asPersist("service_role",
    `UPDATE games SET status='gameover', settlement_status='failed', pending_payouts='{"UNPAID_WALLET":1000000}'::jsonb WHERE id=$1`,
    [failGame.id],
  );
  report(r.ok && r.rowCount === 1, "RECOVERY: settlement failure recorded (gameover but not silently settled)");

  const { rows: [afterFail] } = await db.query(
    `SELECT status, settlement_status, pending_payouts FROM games WHERE id=$1`,
    [failGame.id],
  );
  report(
    afterFail.status === "gameover" && afterFail.settlement_status === "failed" && afterFail.pending_payouts?.UNPAID_WALLET === 1000000,
    "RECOVERY: gameover does not imply settled — failure + amount owed are visible",
    JSON.stringify(afterFail),
  );

  // Anon cannot short-circuit a failed settlement back to 'settled' themselves
  // (must be tested while the game is still genuinely 'failed' — an anon
  // UPDATE setting an already-'settled' value to the same value would be a
  // same-value no-op, not a real forgery attempt).
  r = await as("anon", `UPDATE games SET settlement_status='settled' WHERE id=$1`, [failGame.id]);
  report(r.rowCount === 0, "RECOVERY: anon cannot forge settlement_status='settled' to hide a failure");

  // Retry succeeds and clears pending_payouts (idempotent: only the still-owed wallet was retried).
  r = await asPersist("service_role",
    `UPDATE games SET settlement_status='settled', pending_payouts=NULL WHERE id=$1`,
    [failGame.id],
  );
  report(r.ok && r.rowCount === 1, "RECOVERY: retry can flip failed -> settled and clear pending_payouts");

  console.log(`\n${passed} passed, ${failed} failed`);
  await db.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("fix verification failed:", e.message);
  process.exit(1);
});
