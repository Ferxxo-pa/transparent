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
    -- Test roles must be able to resolve auth.role(). Without USAGE on the auth
    -- schema, calling auth.role() raises 42501 (permission denied) — which the
    -- harness must treat as an infra failure, NOT a silently "denied" action.
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
    await db.query("BEGIN");
    try {
      await db.query(`SET LOCAL ROLE ${role}`);
      await db.query(`SET LOCAL request.jwt.claim.role = '${role}'`);

      // Assert the role is actually applied. A failure HERE (e.g. 42501 on
      // auth.role() because the role lacks USAGE on schema auth) is an infra
      // fault and MUST abort the whole test run — it must never be mistaken for
      // a policy "denial" that a later `rowCount === 0` assertion would pass.
      let roleCheck: { cu: string; ar: string };
      try {
        const { rows } = await db.query(`SELECT current_user AS cu, auth.role() AS ar`);
        roleCheck = rows[0];
      } catch (e: any) {
        await db.query("ROLLBACK");
        throw new Error(
          `FATAL: role assertion query failed for '${role}' (${e.code ?? "?"}: ${e.message}). ` +
          `This means the test harness cannot resolve current_user/auth.role() — ` +
          `fix the bootstrap (GRANT USAGE ON SCHEMA auth) before trusting any result.`,
        );
      }
      if (roleCheck.cu !== role || roleCheck.ar !== role) {
        await db.query("ROLLBACK");
        throw new Error(
          `FATAL: role not applied — current_user=${roleCheck.cu}, auth.role()=${roleCheck.ar}, expected ${role}`,
        );
      }

      // From here on, errors are genuine action outcomes (e.g. RLS denial).
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
      throw e; // propagate FATAL infra faults
    }
  }

  // ── Preflight: prove the role machinery works before any policy test ──
  {
    const anonCheck = await as("anon", "SELECT 1 AS ok");
    const svcCheck = await as("service_role", "SELECT 1 AS ok");
    if (!anonCheck.ok || !svcCheck.ok) {
      throw new Error("FATAL: preflight role checks did not execute cleanly");
    }
    console.log("preflight: anon + service_role role assertions OK\n");
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

  // ── RPC behavior: lifecycle fixes 1–4 (run as service_role, rolled back) ──

  console.log("\n=== RPC behavior (fixes 1–4) ===\n");

  async function svcTx<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL ROLE service_role");
    await db.query("SET LOCAL request.jwt.claim.role = 'service_role'");
    try {
      return await fn();
    } finally {
      await db.query("ROLLBACK");
    }
  }

  // FIX 1: join on reconnect preserves has_paid/is_ready (no reset to false)
  await svcTx(async () => {
    await db.query(
      `INSERT INTO players (game_id, wallet_address, display_name, has_paid, is_ready)
       VALUES ($1, 'RECONNECT', 'Recon', true, true)`,
      [waitGame.id],
    );
    const { rows: [row] } = await db.query(
      `SELECT * FROM join_game_player($1, 'RECONNECT', 'Recon')`,
      [waitGame.id],
    );
    report(
      row.has_paid === true && row.is_ready === true,
      "FIX1: join on reconnect preserves has_paid/is_ready (no reset)",
      JSON.stringify({ has_paid: row.has_paid, is_ready: row.is_ready }),
    );
  });

  // FIX 2: host leave deletes host AND cancels the game atomically
  await svcTx(async () => {
    const { rows: [hg] } = await db.query(
      `INSERT INTO games (room_code, host_wallet, status, current_round)
       VALUES ('HL01', 'HOST_HL', 'waiting', 0) RETURNING id`,
    );
    await db.query(
      `INSERT INTO players (game_id, wallet_address, display_name) VALUES ($1, 'HOST_HL', 'Host')`,
      [hg.id],
    );
    const { rows: [res] } = await db.query(
      `SELECT leave_game_player($1, 'HOST_HL', NULL) AS host_left`,
      [hg.id],
    );
    const { rows: [g2] } = await db.query(`SELECT status FROM games WHERE id=$1`, [hg.id]);
    const { rows: remaining } = await db.query(`SELECT 1 FROM players WHERE game_id=$1`, [hg.id]);
    report(
      res.host_left === true && g2.status === "cancelled" && remaining.length === 0,
      "FIX2: host leave deletes host AND cancels game in one transaction",
      `host_left=${res.host_left}, status=${g2.status}, remaining=${remaining.length}`,
    );
  });

  // FIX 2b: a non-host leave never cancels the game
  await svcTx(async () => {
    const { rows: [g] } = await db.query(
      `INSERT INTO games (room_code, host_wallet, status, current_round)
       VALUES ('HL02', 'HOST_HL2', 'waiting', 0) RETURNING id`,
    );
    await db.query(
      `INSERT INTO players (game_id, wallet_address, display_name) VALUES ($1, 'PLAYER_X', 'X')`,
      [g.id],
    );
    const { rows: [res] } = await db.query(
      `SELECT leave_game_player($1, 'PLAYER_X', NULL) AS host_left`,
      [g.id],
    );
    const { rows: [g2] } = await db.query(`SELECT status FROM games WHERE id=$1`, [g.id]);
    report(
      res.host_left === false && g2.status === "waiting",
      "FIX2b: non-host leave does not cancel the game",
      `host_left=${res.host_left}, status=${g2.status}`,
    );
  });

  // FIX 4: mark_player_paid is the only false→true path, and is idempotent
  await svcTx(async () => {
    const { rows: [g] } = await db.query(
      `INSERT INTO games (room_code, host_wallet, status, current_round, buy_in_lamports)
       VALUES ('PAY01', 'HOST_PAY', 'waiting', 0, 100000) RETURNING id`,
    );
    await db.query(
      `INSERT INTO players (game_id, wallet_address, display_name, has_paid) VALUES ($1, 'PAYER', 'Payer', false)`,
      [g.id],
    );
    const { rows: [p1] } = await db.query(`SELECT * FROM mark_player_paid($1, 'PAYER')`, [g.id]);
    const { rows: [p2] } = await db.query(`SELECT * FROM mark_player_paid($1, 'PAYER')`, [g.id]);
    report(
      p1.has_paid === true && p2.has_paid === true,
      "FIX4: mark_player_paid flips has_paid false→true and is idempotent",
    );
  });

  // FIX 3/4: ready-up is gated on payment for paid games
  await svcTx(async () => {
    const { rows: [g] } = await db.query(
      `INSERT INTO games (room_code, host_wallet, status, current_round, buy_in_lamports)
       VALUES ('RDY01', 'HOST_RDY', 'waiting', 0, 100000) RETURNING id`,
    );
    await db.query(
      `INSERT INTO players (game_id, wallet_address, display_name, has_paid) VALUES ($1, 'RD', 'RD', false)`,
      [g.id],
    );
    let denied = false;
    await db.query("SAVEPOINT before_ready");
    try {
      await db.query(`SELECT ready_up_player($1, 'RD')`, [g.id]);
    } catch (e: any) {
      denied = /payment required/.test(e.message);
    }
    // Recover the transaction after the expected exception.
    await db.query("ROLLBACK TO SAVEPOINT before_ready");
    await db.query(`SELECT mark_player_paid($1, 'RD')`, [g.id]);
    const { rows: [p] } = await db.query(`SELECT * FROM ready_up_player($1, 'RD')`, [g.id]);
    report(
      denied && p.is_ready === true,
      "FIX3/4: ready-up blocked until paid, then succeeds after payment",
    );
  });

  // FIX 5 (replay guard table): duplicate token hash is rejected
  await svcTx(async () => {
    await db.query(
      `INSERT INTO used_game_tokens (token_hash, game_id, action, wallet) VALUES ('HASH_A', $1, 'leave', 'LEAVER_W')`,
      [waitGame.id],
    );
    let rejected = false;
    try {
      await db.query(
        `INSERT INTO used_game_tokens (token_hash, game_id, action, wallet) VALUES ('HASH_A', $1, 'leave', 'LEAVER_W')`,
        [waitGame.id],
      );
    } catch (e: any) {
      rejected = e.code === "23505";
    }
    report(rejected, "FIX5: replayed destructive token (same hash) is rejected");
  });

  // Anon cannot call the new lifecycle RPCs (defense in depth)
  {
    const r1 = await as("anon", `SELECT join_game_player($1, 'HACKER', 'H')`, [waitGame.id]);
    report(!r1.ok, "BLOCKED: anon cannot call join_game_player", r1.err);
    const r2 = await as("anon", `SELECT leave_game_player($1, 'HACKER', NULL)`, [waitGame.id]);
    report(!r2.ok, "BLOCKED: anon cannot call leave_game_player", r2.err);
    const r3 = await as("anon", `SELECT mark_player_paid($1, 'HACKER')`, [waitGame.id]);
    report(!r3.ok, "BLOCKED: anon cannot call mark_player_paid", r3.err);
  }

  // ── Payment claim atomicity (claim_payment_and_credit RPC) ──

  console.log("\n=== Payment claim atomicity ===\n");

  // Atomic claim + credit: normal path
  await svcTx(async () => {
    const { rows: [g] } = await db.query(
      `INSERT INTO games (room_code, host_wallet, status, current_round, buy_in_lamports)
       VALUES ('ATOM01', 'HOST_ATOM', 'waiting', 0, 100000) RETURNING id`,
    );
    await db.query(
      `INSERT INTO players (game_id, wallet_address, display_name, has_paid) VALUES ($1, 'PAYER_A', 'A', false)`,
      [g.id],
    );
    const { rows: [p] } = await db.query(
      `SELECT * FROM claim_payment_and_credit($1, 'PAYER_A', 'hash_normal_01')`,
      [g.id],
    );
    report(
      p.has_paid === true,
      "ATOMIC: claim_payment_and_credit credits player on first call",
    );
  });

  // Same-owner replay when credit landed: returns success, not 409
  await svcTx(async () => {
    const { rows: [g] } = await db.query(
      `INSERT INTO games (room_code, host_wallet, status, current_round, buy_in_lamports)
       VALUES ('ATOM02', 'HOST_ATOM2', 'waiting', 0, 100000) RETURNING id`,
    );
    await db.query(
      `INSERT INTO players (game_id, wallet_address, display_name, has_paid) VALUES ($1, 'PAYER_B', 'B', false)`,
      [g.id],
    );
    await db.query(
      `SELECT * FROM claim_payment_and_credit($1, 'PAYER_B', 'hash_replay_02')`,
      [g.id],
    );
    // Replay same hash — player already paid, should return success
    const { rows: [p2] } = await db.query(
      `SELECT * FROM claim_payment_and_credit($1, 'PAYER_B', 'hash_replay_02')`,
      [g.id],
    );
    report(
      p2.has_paid === true,
      "ATOMIC: same-owner replay returns paid player (not 409)",
    );
  });

  // Failed credit recovery: dedup record exists but player not paid → retry succeeds
  await svcTx(async () => {
    const { rows: [g] } = await db.query(
      `INSERT INTO games (room_code, host_wallet, status, current_round, buy_in_lamports)
       VALUES ('ATOM03', 'HOST_ATOM3', 'waiting', 0, 100000) RETURNING id`,
    );
    await db.query(
      `INSERT INTO players (game_id, wallet_address, display_name, has_paid) VALUES ($1, 'PAYER_C', 'C', false)`,
      [g.id],
    );
    // Simulate the old bug: dedup record exists but player NOT paid
    await db.query(
      `INSERT INTO used_game_tokens (token_hash, game_id, action, wallet) VALUES ('hash_stale_03', $1, 'pay', 'PAYER_C')`,
      [g.id],
    );
    // Retry should recover: delete stale dedup, re-insert, credit player
    const { rows: [p] } = await db.query(
      `SELECT * FROM claim_payment_and_credit($1, 'PAYER_C', 'hash_stale_03')`,
      [g.id],
    );
    report(
      p.has_paid === true,
      "ATOMIC: retry after failed credit recovers — player gets credited",
    );
  });

  // Two-wallet replay: Alice claims hash, Bob tries same hash → REJECTED
  await svcTx(async () => {
    const { rows: [g] } = await db.query(
      `INSERT INTO games (room_code, host_wallet, status, current_round, buy_in_lamports)
       VALUES ('ATOM04', 'HOST_ATOM4', 'waiting', 0, 100000) RETURNING id`,
    );
    await db.query(
      `INSERT INTO players (game_id, wallet_address, display_name, has_paid) VALUES ($1, 'ALICE', 'Alice', false)`,
      [g.id],
    );
    await db.query(
      `INSERT INTO players (game_id, wallet_address, display_name, has_paid) VALUES ($1, 'BOB', 'Bob', false)`,
      [g.id],
    );
    // Alice claims the payment hash
    const { rows: [alice] } = await db.query(
      `SELECT * FROM claim_payment_and_credit($1, 'ALICE', 'hash_shared_04')`,
      [g.id],
    );
    report(alice.has_paid === true, "TWO-WALLET: Alice claims hash successfully");

    // Bob tries to claim the SAME hash → must be rejected, not steal Alice's claim
    let bobRejected = false;
    let bobErr = "";
    await db.query("SAVEPOINT before_bob");
    try {
      await db.query(
        `SELECT * FROM claim_payment_and_credit($1, 'BOB', 'hash_shared_04')`,
        [g.id],
      );
    } catch (e: any) {
      bobRejected = /already claimed by another wallet/.test(e.message);
      bobErr = e.message;
    }
    await db.query("ROLLBACK TO SAVEPOINT before_bob");

    // Verify Bob is still unpaid
    const { rows: [bobRow] } = await db.query(
      `SELECT has_paid FROM players WHERE game_id=$1 AND wallet_address='BOB'`,
      [g.id],
    );
    // Verify Alice's dedup row still exists and is hers
    const { rows: [dedupRow] } = await db.query(
      `SELECT wallet FROM used_game_tokens WHERE token_hash='hash_shared_04'`,
    );
    report(
      bobRejected && bobRow.has_paid === false && dedupRow.wallet === "ALICE",
      "TWO-WALLET: Bob rejected, Alice's claim intact, Bob still unpaid",
      `rejected=${bobRejected}, bobPaid=${bobRow.has_paid}, dedupOwner=${dedupRow.wallet}, err=${bobErr}`,
    );
  });

  // Stale dedup from different wallet: foreign stale claim must not be recoverable
  await svcTx(async () => {
    const { rows: [g] } = await db.query(
      `INSERT INTO games (room_code, host_wallet, status, current_round, buy_in_lamports)
       VALUES ('ATOM05', 'HOST_ATOM5', 'waiting', 0, 100000) RETURNING id`,
    );
    await db.query(
      `INSERT INTO players (game_id, wallet_address, display_name, has_paid) VALUES ($1, 'MALLORY', 'Mallory', false)`,
      [g.id],
    );
    // Simulate a stale dedup from a DIFFERENT wallet (old claim that failed)
    await db.query(
      `INSERT INTO used_game_tokens (token_hash, game_id, action, wallet) VALUES ('hash_foreign_05', $1, 'pay', 'ORIGINAL_PAYER')`,
      [g.id],
    );
    // Mallory tries to claim — must reject even though "credit never landed" on original
    let rejected = false;
    await db.query("SAVEPOINT before_mallory");
    try {
      await db.query(
        `SELECT * FROM claim_payment_and_credit($1, 'MALLORY', 'hash_foreign_05')`,
        [g.id],
      );
    } catch (e: any) {
      rejected = /already claimed by another wallet/.test(e.message);
    }
    await db.query("ROLLBACK TO SAVEPOINT before_mallory");
    const { rows: [m] } = await db.query(
      `SELECT has_paid FROM players WHERE game_id=$1 AND wallet_address='MALLORY'`,
      [g.id],
    );
    report(
      rejected && m.has_paid === false,
      "TWO-WALLET: foreign stale dedup blocks different wallet from stealing claim",
    );
  });

  // Rollback-failure recovery: same wallet stale dedup → retry succeeds
  await svcTx(async () => {
    const { rows: [g] } = await db.query(
      `INSERT INTO games (room_code, host_wallet, status, current_round, buy_in_lamports)
       VALUES ('ATOM06', 'HOST_ATOM6', 'waiting', 0, 100000) RETURNING id`,
    );
    await db.query(
      `INSERT INTO players (game_id, wallet_address, display_name, has_paid) VALUES ($1, 'RETRIER', 'Retrier', false)`,
      [g.id],
    );
    // Simulate same-wallet stale dedup (own prior failed attempt)
    await db.query(
      `INSERT INTO used_game_tokens (token_hash, game_id, action, wallet) VALUES ('hash_retry_06', $1, 'pay', 'RETRIER')`,
      [g.id],
    );
    const { rows: [p] } = await db.query(
      `SELECT * FROM claim_payment_and_credit($1, 'RETRIER', 'hash_retry_06')`,
      [g.id],
    );
    report(
      p.has_paid === true,
      "RECOVERY: same-wallet stale dedup allows retry and credits player",
    );
  });

  // Anon cannot call claim_payment_and_credit
  {
    const r = await as("anon",
      `SELECT claim_payment_and_credit($1, 'HACKER', 'hash_anon')`,
      [waitGame.id],
    );
    report(!r.ok, "BLOCKED: anon cannot call claim_payment_and_credit", r.err);
  }

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
