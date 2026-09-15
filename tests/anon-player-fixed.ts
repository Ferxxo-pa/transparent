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

  await db.query(`
    grant usage on schema public to anon, service_role;
    grant select, insert, update, delete on all tables in schema public to anon, service_role;
    grant execute on all functions in schema public to anon, service_role;
  `);

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

  // Seed a waiting game for leave-flow tests
  const { rows: [waitGame] } = await db.query(
    `insert into games (room_code, host_wallet, status, current_round)
     values ('WAIT01','HOSTWALLET','waiting',0) returning id`,
  );
  await db.query(
    `insert into players (game_id, wallet_address, display_name) values ($1, 'LEAVER', 'Leaver')`,
    [waitGame.id],
  );

  async function as(role: "anon" | "service_role", sql: string, params: unknown[] = []) {
    await db.query(`set local role ${role}; set local request.jwt.claim.role = '${role}'`);
    try {
      const r = await db.query(sql, params);
      return { ok: true, rowCount: r.rowCount ?? 0, rows: r.rows, err: "" };
    } catch (e: any) {
      return { ok: false, err: e.message, rowCount: 0, rows: [] };
    } finally {
      await db.query(`reset role; reset request.jwt.claim.role`);
    }
  }

  console.log("\n=== FIX VERIFICATION: anon player attacks should be BLOCKED ===\n");

  // 1. Anon cannot change display_name directly
  let r = await as("anon",
    `update players set display_name='PWNED' where game_id=$1 and wallet_address='VICTIM_WALLET'`,
    [game.id],
  );
  report(r.rowCount === 0, "BLOCKED: anon cannot update display_name directly");

  // 2. Anon cannot change has_paid
  r = await as("anon",
    `update players set has_paid=false where game_id=$1 and wallet_address='VICTIM_WALLET'`,
    [game.id],
  );
  report(r.rowCount === 0, "BLOCKED: anon cannot change has_paid");

  // 3. Anon cannot change is_ready
  r = await as("anon",
    `update players set is_ready=false where game_id=$1 and wallet_address='VICTIM_WALLET'`,
    [game.id],
  );
  report(r.rowCount === 0, "BLOCKED: anon cannot change is_ready");

  // 4. Anon cannot delete player rows
  r = await as("anon",
    `delete from players where game_id=$1 and wallet_address='VICTIM_WALLET'`,
    [game.id],
  );
  report(r.rowCount === 0, "BLOCKED: anon cannot delete player rows");

  // 5. Predictions require game in progress
  const { rows: [finishedGame] } = await db.query(
    `insert into games (room_code, host_wallet, status, current_round)
     values ('DONE01','HOSTWALLET','gameover',5) returning id`,
  );
  r = await as("anon",
    `insert into predictions (game_id, bettor_wallet, predicted_winner_wallet, amount_lamports)
     values ($1, 'BETTOR', 'SOMEONE', 999)`,
    [finishedGame.id],
  );
  report(!r.ok || r.rowCount === 0, "BLOCKED: cannot predict on a finished game");

  // 6. Predictions still work for active games
  r = await as("anon",
    `insert into predictions (game_id, bettor_wallet, predicted_winner_wallet, amount_lamports)
     values ($1, 'BETTOR', 'VICTIM_WALLET', 1000)`,
    [game.id],
  );
  report(r.ok && r.rowCount === 1, "ALLOWED: can predict on an active game");

  // 7. Service role CAN update display_name via RPC
  r = await as("service_role",
    `select update_player_display_name($1, 'VICTIM_WALLET', 'New Name')`,
    [game.id],
  );
  report(r.ok, "ALLOWED: service_role can update display_name via RPC");

  // 8. Service role CAN set has_paid / is_ready
  r = await as("service_role",
    `update players set has_paid=true, is_ready=true where game_id=$1 and wallet_address='VICTIM_WALLET'`,
    [game.id],
  );
  report(r.ok && r.rowCount === 1, "ALLOWED: service_role can set has_paid/is_ready");

  // 9. Service role CAN remove player via leave RPC (waiting game)
  r = await as("service_role",
    `select leave_game_verified($1, 'LEAVER')`,
    [waitGame.id],
  );
  report(r.ok, "ALLOWED: service_role can remove player via leave RPC");

  // 10. Leave RPC refuses on playing game
  r = await as("service_role",
    `select leave_game_verified($1, 'ATTACKER_WALLET')`,
    [game.id],
  );
  report(!r.ok && r.err.includes("waiting"), "BLOCKED: cannot leave a game that is playing");

  // 11. Anon cannot call the RPCs directly
  r = await as("anon",
    `select update_player_display_name($1, 'VICTIM_WALLET', 'Hacked')`,
    [game.id],
  );
  report(!r.ok, "BLOCKED: anon cannot call update_player_display_name");

  r = await as("anon",
    `select leave_game_verified($1, 'VICTIM_WALLET')`,
    [waitGame.id],
  );
  report(!r.ok, "BLOCKED: anon cannot call leave_game_verified");

  // 12. Victim row still intact
  const { rows: players } = await db.query(
    `select wallet_address, display_name, has_paid, is_ready from players where game_id=$1 order by wallet_address`,
    [game.id],
  );
  const victim = players.find((p: any) => p.wallet_address === "VICTIM_WALLET");
  report(
    !!victim && victim.display_name === "New Name" && victim.has_paid === true && victim.is_ready === true,
    "CONFIRMED: victim row intact with service_role-updated display_name",
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
