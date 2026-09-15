/**
 * Negative security tests: prove that on the pre-fix schema (schema.sql +
 * 20260701_escrow_hardening.sql, WITHOUT 20260915_server_authoritative_pot_settlement.sql)
 * anon can:
 *   1. Set games.current_pot to an arbitrary value (pot griefing / overdraw)
 *   2. Set players.has_paid = true without ever paying (payment bypass)
 *   3. Set players.is_ready = true without paying (ready-state forgery)
 *
 * Run against a DISPOSABLE local Postgres (never production):
 *   docker run -d --name rls-transparent-attack -e POSTGRES_PASSWORD=postgres -p 55440:5432 postgres:16
 *   DSN=postgres://postgres:postgres@127.0.0.1:55440/postgres npx tsx tests/pot-payment-attack.ts
 *
 * These tests MUST FAIL once 20260915_server_authoritative_pot_settlement.sql
 * is applied (see tests/pot-payment-fixed.ts).
 */

import { readFileSync } from "node:fs";
import pg from "pg";

const DSN = process.env.DSN ?? "postgres://postgres:postgres@127.0.0.1:55440/postgres";

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
  ]) {
    await db.query(readFileSync(f, "utf8"));
    console.log(`applied ${f}`);
  }

  // current_pot is referenced by the app but was never captured in
  // supabase/schema.sql or a migration prior to the fix — add it here to
  // reproduce the pre-fix production shape (see fix migration header).
  await db.query(`alter table public.games add column if not exists current_pot numeric not null default 0;`);

  await db.query(`
    grant usage on schema public to anon, service_role;
    grant select, insert, update, delete on all tables in schema public to anon, service_role;
    grant execute on all functions in schema public to anon, service_role;
  `);

  const { rows: [game] } = await db.query(
    `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, current_pot)
     values ('POT001','HOSTWALLET','playing',1, 100000, 0.5)
     returning id`,
  );
  await db.query(
    `insert into players (game_id, wallet_address, display_name, has_paid, is_ready)
     values ($1, 'ATTACKER_WALLET', 'Attacker', false, false)`,
    [game.id],
  );

  async function asAnon(sql: string, params: unknown[] = []) {
    await db.query("BEGIN");
    try {
      await db.query("SET LOCAL ROLE anon");
      await db.query("SET LOCAL request.jwt.claim.role = 'anon'");
      let roleCheck: { cu: string; ar: string };
      try {
        const { rows } = await db.query(`SELECT current_user AS cu, auth.role() AS ar`);
        roleCheck = rows[0];
      } catch (e: any) {
        await db.query("ROLLBACK");
        throw new Error(`FATAL: role assertion query failed (${e.code ?? "?"}: ${e.message}).`);
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
      throw e;
    }
  }

  await asAnon("SELECT 1");
  console.log("preflight: anon role assertion OK");

  console.log("\n=== VULNERABILITY PROOF: pot + payment forgery ===\n");

  // 1. Anon can set current_pot to an arbitrary value exceeding real escrow
  let r = await asAnon(
    `update games set current_pot = 999999 where id=$1`,
    [game.id],
  );
  report(r.ok && r.rowCount === 1, "VULN: anon set current_pot to 999999 (pot overdraw/griefing)");

  // 2. Anon can set has_paid=true without ever depositing to escrow
  r = await asAnon(
    `update players set has_paid=true where game_id=$1 and wallet_address='ATTACKER_WALLET'`,
    [game.id],
  );
  report(r.ok && r.rowCount === 1, "VULN: anon set own has_paid=true without paying");

  // 3. Anon can set is_ready=true without paying
  r = await asAnon(
    `update players set is_ready=true where game_id=$1 and wallet_address='ATTACKER_WALLET'`,
    [game.id],
  );
  report(r.ok && r.rowCount === 1, "VULN: anon set own is_ready=true without paying");

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log("\nAll passing tests above prove exploitable vulnerabilities.");
  console.log("Once 20260915_server_authoritative_pot_settlement.sql is applied, these should FAIL.\n");

  await db.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("attack harness failed:", e.message);
  process.exit(1);
});
