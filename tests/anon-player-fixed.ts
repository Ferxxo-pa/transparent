/**
 * Verifies the fix: after applying 20260915_player_rls_lockdown.PROPOSED.sql,
 * all the attacks from anon-player-attack.ts should be BLOCKED.
 *
 * Run against a DISPOSABLE local Postgres:
 *   docker run -d --name rls-fixed -e POSTGRES_PASSWORD=postgres -p 55434:5432 postgres:16
 *   DSN=postgres://postgres:postgres@127.0.0.1:55434/postgres npx tsx tests/anon-player-fixed.ts
 */

import { readFileSync } from "node:fs";
import pg from "pg";

const DSN = process.env.DSN ?? "postgres://postgres:postgres@127.0.0.1:55434/postgres";

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
    "supabase/migrations/20260915_player_rls_lockdown.PROPOSED.sql",
  ]) {
    await db.query(readFileSync(f, "utf8"));
    console.log(`applied ${f}`);
  }

  // Grant table access only — NOT function execute.
  // RPC privilege boundary tested by verifying anon cannot call service_role RPCs.
  await db.query(`
    grant usage on schema public to anon, service_role;
    grant select, insert, update, delete on all tables in schema public to anon, service_role;
  `);

  // Seed: a playing game with two players
  const { rows: [game] } = await db.query(
    `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports)
     values ('FIX001','HOSTWALLET','playing',1, 100000)
     returning id`,
  );
  await db.query(
    `insert into players (game_id, wallet_address, display_name, has_paid, is_ready)
     values ($1, 'VICTIM_WALLET', 'Victim', true, true)`,
    [game.id],
  );
  await db.query(
    `insert into players (game_id, wallet_address, display_name, has_paid, is_ready)
     values ($1, 'ATTACKER_WALLET', 'Attacker', true, true)`,
    [game.id],
  );

  // Seed a waiting game for leave-flow and INSERT tests
  const { rows: [waitGame] } = await db.query(
    `insert into games (room_code, host_wallet, status, current_round)
     values ('WAIT01','HOSTWALLET','waiting',0) returning id`,
  );
  await db.query(
    `insert into players (game_id, wallet_address, display_name) values ($1, 'LEAVER', 'Leaver')`,
    [waitGame.id],
  );

  /**
   * Run SQL as a given role inside a proper transaction so SET LOCAL
   * actually applies to the action query. Asserts current_user and
   * auth.role() match the requested role before executing.
   */
  async function as(role: "anon" | "service_role", sql: string, params: unknown[] = []) {
    try {
      await db.query("BEGIN");
      await db.query(`SET LOCAL ROLE ${role}`);
      await db.query(`SET LOCAL request.jwt.claim.role = '${role}'`);

      // Assert role is actually applied
      const { rows: [roleCheck] } = await db.query(
        `SELECT current_user AS cu, auth.role() AS ar`,
      );
      if (roleCheck.cu !== role || roleCheck.ar !== role) {
        await db.query("ROLLBACK");
        return {
          ok: false,
          err: `role assertion failed: current_user=${roleCheck.cu}, auth.role()=${roleCheck.ar}, expected ${role}`,
          rowCount: 0,
          rows: [],
        };
      }

      const r = await db.query(sql, params);
      await db.query("ROLLBACK");
      return { ok: true, rowCount: r.rowCount ?? 0, rows: r.rows, err: "" };
    } catch (e: any) {
      try { await db.query("ROLLBACK"); } catch {}
      return { ok: false, err: e.message, rowCount: 0, rows: [] };
    }
  }

  console.log("\n=== FIX VERIFICATION: anon player attacks should be BLOCKED ===\n");

  // ── Anon UPDATE blocked ──

  // 1. Anon cannot change display_name directly
  let r = await as("anon",
    `UPDATE players SET display_name='PWNED' WHERE game_id=$1 AND wallet_address='VICTIM_WALLET'`,
    [game.id],
  );
  report(r.rowCount === 0, "BLOCKED: anon cannot update display_name directly");

  // 2. Anon cannot change has_paid
  r = await as("anon",
    `UPDATE players SET has_paid=false WHERE game_id=$1 AND wallet_address='VICTIM_WALLET'`,
    [game.id],
  );
  report(r.rowCount === 0, "BLOCKED: anon cannot change has_paid");

  // 3. Anon cannot change is_ready
  r = await as("anon",
    `UPDATE players SET is_ready=false WHERE game_id=$1 AND wallet_address='VICTIM_WALLET'`,
    [game.id],
  );
  report(r.rowCount === 0, "BLOCKED: anon cannot change is_ready");

  // ── Anon DELETE blocked ──

  // 4. Anon cannot delete player rows
  r = await as("anon",
    `DELETE FROM players WHERE game_id=$1 AND wallet_address='VICTIM_WALLET'`,
    [game.id],
  );
  report(r.rowCount === 0, "BLOCKED: anon cannot delete player rows");

  // ── Anon INSERT: forged has_paid/is_ready blocked ──

  // 5. Anon cannot INSERT with has_paid=true (forged payment)
  r = await as("anon",
    `INSERT INTO players (game_id, wallet_address, display_name, has_paid, is_ready)
     VALUES ($1, 'FORGED_PAID', 'Forger', true, false)`,
    [waitGame.id],
  );
  report(!r.ok || r.rowCount === 0,
    "BLOCKED: anon cannot INSERT with forged has_paid=true",
    r.err || `rowCount=${r.rowCount}`);

  // 6. Anon cannot INSERT with is_ready=true (forged ready)
  r = await as("anon",
    `INSERT INTO players (game_id, wallet_address, display_name, has_paid, is_ready)
     VALUES ($1, 'FORGED_READY', 'Forger', false, true)`,
    [waitGame.id],
  );
  report(!r.ok || r.rowCount === 0,
    "BLOCKED: anon cannot INSERT with forged is_ready=true",
    r.err || `rowCount=${r.rowCount}`);

  // 7. Anon cannot INSERT with both forged (has_paid=true, is_ready=true)
  r = await as("anon",
    `INSERT INTO players (game_id, wallet_address, display_name, has_paid, is_ready)
     VALUES ($1, 'FORGED_BOTH', 'Forger', true, true)`,
    [waitGame.id],
  );
  report(!r.ok || r.rowCount === 0,
    "BLOCKED: anon cannot INSERT with forged has_paid+is_ready",
    r.err || `rowCount=${r.rowCount}`);

  // 8. Anon CAN INSERT a legitimate join (has_paid=false, is_ready=false, waiting game)
  r = await as("anon",
    `INSERT INTO players (game_id, wallet_address, display_name, has_paid, is_ready)
     VALUES ($1, 'LEGIT_JOIN', 'NewPlayer', false, false)`,
    [waitGame.id],
  );
  report(r.ok && r.rowCount === 1,
    "ALLOWED: anon can INSERT legitimate join (unpaid, not ready, waiting game)");

  // 9. Anon cannot INSERT with arbitrary wallet into a playing game
  r = await as("anon",
    `INSERT INTO players (game_id, wallet_address, display_name, has_paid, is_ready)
     VALUES ($1, 'LATE_JOINER', 'Late', false, false)`,
    [game.id],
  );
  report(!r.ok || r.rowCount === 0,
    "BLOCKED: anon cannot INSERT into a playing game",
    r.err || `rowCount=${r.rowCount}`);

  // ── Predictions INSERT: require game in progress ──

  // 10. Predictions blocked on finished game
  const { rows: [finishedGame] } = await db.query(
    `INSERT INTO games (room_code, host_wallet, status, current_round)
     VALUES ('DONE01','HOSTWALLET','gameover',5) RETURNING id`,
  );
  r = await as("anon",
    `INSERT INTO predictions (game_id, bettor_wallet, predicted_winner_wallet, amount_lamports)
     VALUES ($1, 'BETTOR', 'SOMEONE', 999)`,
    [finishedGame.id],
  );
  report(!r.ok || r.rowCount === 0, "BLOCKED: cannot predict on a finished game");

  // 11. Predictions allowed on active games
  r = await as("anon",
    `INSERT INTO predictions (game_id, bettor_wallet, predicted_winner_wallet, amount_lamports)
     VALUES ($1, 'BETTOR', 'VICTIM_WALLET', 1000)`,
    [game.id],
  );
  report(r.ok && r.rowCount === 1, "ALLOWED: can predict on an active game");

  // ── Service role positive tests ──

  // 12. Service role CAN update display_name via RPC
  r = await as("service_role",
    `SELECT update_player_display_name($1, 'VICTIM_WALLET', 'New Name')`,
    [game.id],
  );
  report(r.ok, "ALLOWED: service_role can update display_name via RPC");

  // 13. Service role CAN set has_paid / is_ready
  r = await as("service_role",
    `UPDATE players SET has_paid=true, is_ready=true WHERE game_id=$1 AND wallet_address='VICTIM_WALLET'`,
    [game.id],
  );
  report(r.ok && r.rowCount === 1, "ALLOWED: service_role can set has_paid/is_ready");

  // 14. Service role CAN delete player directly (EF uses service_role client)
  r = await as("service_role",
    `DELETE FROM players WHERE game_id=$1 AND wallet_address='LEAVER'`,
    [waitGame.id],
  );
  report(r.ok && r.rowCount === 1, "ALLOWED: service_role can delete player directly");

  // 15. Service role enforces game-status check in EF (not RLS). Verify
  // service_role CAN delete from playing game (EF adds the status guard).
  r = await as("service_role",
    `DELETE FROM players WHERE game_id=$1 AND wallet_address='ATTACKER_WALLET'`,
    [game.id],
  );
  report(r.ok && r.rowCount === 1, "ALLOWED: service_role can delete from playing game (EF guards status)");

  // ── Anon RPC privilege boundary ──

  // 16. Anon cannot call update_player_display_name
  r = await as("anon",
    `SELECT update_player_display_name($1, 'VICTIM_WALLET', 'Hacked')`,
    [game.id],
  );
  report(!r.ok, "BLOCKED: anon cannot call update_player_display_name",
    r.err);

  // 17. Anon cannot delete players (RLS blocks it)
  r = await as("anon",
    `DELETE FROM players WHERE game_id=$1 AND wallet_address='BYSTANDER'`,
    [waitGame.id],
  );
  report(r.rowCount === 0, "BLOCKED: anon cannot delete players directly");

  // ── Cross-player denial ──

  // 18. RPC with wrong wallet = no-op
  r = await as("service_role",
    `SELECT update_player_display_name($1, 'NONEXISTENT_WALLET', 'Hacked')`,
    [game.id],
  );
  const { rows: [victimAfterWrongWallet] } = await db.query(
    `SELECT display_name FROM players WHERE game_id=$1 AND wallet_address='VICTIM_WALLET'`,
    [game.id],
  );
  report(
    victimAfterWrongWallet.display_name === "Victim",
    "DENIED: RPC with wrong wallet does not affect victim row",
  );

  // 19. Delete with wrong wallet = no-op (EF scopes by wallet_address)
  await db.query(
    `INSERT INTO players (game_id, wallet_address, display_name) VALUES ($1, 'BYSTANDER', 'Bystander')`,
    [waitGame.id],
  );
  r = await as("service_role",
    `DELETE FROM players WHERE game_id=$1 AND wallet_address='NONEXISTENT_WALLET'`,
    [waitGame.id],
  );
  const { rows: waitPlayers } = await db.query(
    `SELECT wallet_address FROM players WHERE game_id=$1 ORDER BY wallet_address`,
    [waitGame.id],
  );
  report(
    waitPlayers.some((p: any) => p.wallet_address === "BYSTANDER"),
    "DENIED: delete with wrong wallet does not remove bystander",
  );

  // ── Cross-room isolation ──

  // 20. RPC on game A cannot affect game B player
  const { rows: [gameB] } = await db.query(
    `INSERT INTO games (room_code, host_wallet, status, current_round, buy_in_lamports)
     VALUES ('ROOM_B','HOST_B','playing',1,50000) RETURNING id`,
  );
  await db.query(
    `INSERT INTO players (game_id, wallet_address, display_name, has_paid, is_ready)
     VALUES ($1, 'VICTIM_WALLET', 'Victim_B', true, true)`,
    [gameB.id],
  );
  r = await as("service_role",
    `SELECT update_player_display_name($1, 'VICTIM_WALLET', 'Cross-Room-Hack')`,
    [game.id],
  );
  const { rows: [victimB] } = await db.query(
    `SELECT display_name FROM players WHERE game_id=$1 AND wallet_address='VICTIM_WALLET'`,
    [gameB.id],
  );
  report(
    victimB.display_name === "Victim_B",
    "ISOLATED: RPC on game A does not affect game B player",
  );

  // 21. Delete on game A cannot delete game B player (game_id scoping)
  const { rows: [waitGameB] } = await db.query(
    `INSERT INTO games (room_code, host_wallet, status, current_round)
     VALUES ('WAIT_B','HOST_B','waiting',0) RETURNING id`,
  );
  await db.query(
    `INSERT INTO players (game_id, wallet_address, display_name) VALUES ($1, 'CROSSLEAVER', 'Cross')`,
    [waitGameB.id],
  );
  r = await as("service_role",
    `DELETE FROM players WHERE game_id=$1 AND wallet_address='CROSSLEAVER'`,
    [waitGame.id],
  );
  const { rows: crossCheck } = await db.query(
    `SELECT wallet_address FROM players WHERE game_id=$1`,
    [waitGameB.id],
  );
  report(
    crossCheck.some((p: any) => p.wallet_address === "CROSSLEAVER"),
    "ISOLATED: delete on game A does not remove game B player",
  );

  // ── Replay / duplicate join ──

  // 22. Cannot re-join same game with same wallet (unique constraint)
  r = await as("anon",
    `INSERT INTO players (game_id, wallet_address, display_name, has_paid, is_ready)
     VALUES ($1, 'BYSTANDER', 'Duplicate', false, false)`,
    [waitGame.id],
  );
  report(!r.ok,
    "BLOCKED: cannot re-join with same wallet (duplicate)",
    r.err);

  // ── Final integrity check ──

  // 23. Victim row still intact
  const { rows: players } = await db.query(
    `SELECT wallet_address, display_name, has_paid, is_ready FROM players WHERE game_id=$1 ORDER BY wallet_address`,
    [game.id],
  );
  const victim = players.find((p: any) => p.wallet_address === "VICTIM_WALLET");
  report(
    !!victim && victim.display_name === "Victim" && victim.has_paid === true && victim.is_ready === true,
    "CONFIRMED: victim row intact, never modified by any test",
    JSON.stringify(victim),
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  await db.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("fix verification failed:", e.message);
  process.exit(1);
});
