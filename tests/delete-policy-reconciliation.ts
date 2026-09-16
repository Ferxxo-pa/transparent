/**
 * Verifies delete-policy reconciliation: after applying the full migration
 * stack, anon DELETE is blocked on games/votes/questions and restricted to
 * waiting-state games on players. Service-role DELETE still works.
 *
 * Run against a DISPOSABLE local Postgres:
 *   docker run -d --name rls-delete-test -e POSTGRES_PASSWORD=postgres -p 55442:5432 postgres:16
 *   DSN=postgres://postgres:postgres@127.0.0.1:55442/postgres npx tsx tests/delete-policy-reconciliation.ts
 */

import { readFileSync } from "node:fs";
import pg from "pg";

const DSN = process.env.DSN ?? "postgres://postgres:postgres@127.0.0.1:55442/postgres";

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
    "supabase/migrations/20260915_delete_policy_reconciliation.sql",
  ]) {
    await db.query(readFileSync(f, "utf8"));
    console.log(`applied ${f}`);
  }

  await db.query(`
    grant usage on schema public to anon, service_role;
    grant select, insert, update, delete on all tables in schema public to anon, service_role;
  `);

  // ── Setup: two games — one waiting, one playing ──────────
  const { rows: [waitingGame] } = await db.query(
    `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, current_pot)
     values ('DELW01', 'HOST1', 'waiting', 0, 100000, 0)
     returning id`,
  );
  const { rows: [playingGame] } = await db.query(
    `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, current_pot)
     values ('DELP01', 'HOST2', 'playing', 1, 100000, 0.5)
     returning id`,
  );
  await db.query(
    `insert into players (game_id, wallet_address, display_name, has_paid, is_ready)
     values ($1, 'PLAYER_W', 'WaitPlayer', false, false),
            ($2, 'PLAYER_P', 'PlayPlayer', true, true)`,
    [waitingGame.id, playingGame.id],
  );

  console.log("\n── Anon DELETE tests ──\n");

  // Switch to anon role
  await db.query("set role anon");

  // 1. Anon cannot delete games (any status)
  {
    const { rowCount } = await db.query(
      "delete from games where id = $1", [waitingGame.id],
    );
    report(rowCount === 0, "anon cannot delete waiting game");
  }
  {
    const { rowCount } = await db.query(
      "delete from games where id = $1", [playingGame.id],
    );
    report(rowCount === 0, "anon cannot delete playing game");
  }

  // 2. Anon can delete players from waiting games
  {
    const { rowCount } = await db.query(
      "delete from players where game_id = $1 and wallet_address = 'PLAYER_W'",
      [waitingGame.id],
    );
    report(rowCount === 1, "anon CAN delete player from waiting game");
  }

  // 3. Anon cannot delete players from playing games
  {
    const { rowCount } = await db.query(
      "delete from players where game_id = $1 and wallet_address = 'PLAYER_P'",
      [playingGame.id],
    );
    report(rowCount === 0, "anon cannot delete player from playing game");
  }

  // Reset role for service_role tests
  await db.query("reset role");

  console.log("\n── Service-role DELETE tests ──\n");

  // Re-insert deleted player for cleanup test
  await db.query(
    `insert into players (game_id, wallet_address, display_name, has_paid, is_ready)
     values ($1, 'PLAYER_W2', 'WaitPlayer2', false, false)`,
    [waitingGame.id],
  );

  await db.query("set role service_role");

  // 4. Service role can delete games
  {
    const { rowCount } = await db.query(
      "delete from games where id = $1", [waitingGame.id],
    );
    report(rowCount === 1, "service_role can delete game (CASCADE cleans players)");
  }

  // 5. Service role can delete players from playing games
  {
    const { rowCount } = await db.query(
      "delete from players where game_id = $1 and wallet_address = 'PLAYER_P'",
      [playingGame.id],
    );
    report(rowCount === 1, "service_role can delete player from playing game");
  }

  await db.query("reset role");

  // ── Policy inventory audit ────────────────────────────────
  console.log("\n── Policy inventory ──\n");
  const { rows: policies } = await db.query(`
    select schemaname, tablename, policyname, cmd, permissive, qual
    from pg_policies
    where schemaname = 'public'
      and cmd = 'DELETE'
    order by tablename, policyname
  `);

  for (const p of policies) {
    const tag = p.permissive === "PERMISSIVE" && p.qual === "(true)" ? " ⚠ WIDE-OPEN" : "";
    console.log(`  ${p.tablename}: ${p.policyname} [${p.permissive}] ${p.qual}${tag}`);
  }

  const wideOpen = policies.filter(
    (p: any) => p.permissive === "PERMISSIVE" && p.qual === "(true)",
  );
  report(wideOpen.length === 0, "no wide-open permissive DELETE policies remain",
    wideOpen.length > 0 ? wideOpen.map((p: any) => `${p.tablename}.${p.policyname}`).join(", ") : "");

  await db.end();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
