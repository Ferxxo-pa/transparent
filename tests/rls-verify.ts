// Verifies the escrow-hardening RLS migration against a DISPOSABLE local
// Postgres (never the hosted project). Run tests/rls-verify.sh, or:
//
//   docker run -d --name rls-verify -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:16
//   node tests/rls-verify.ts
//
// Stubs Supabase's auth.role() with a GUC so the trigger logic sees the same
// role string PostgREST would provide.

import { readFileSync } from "node:fs";
import pg from "pg";

const DSN = process.env.DSN ?? "postgres://postgres:postgres@127.0.0.1:55432/postgres";

let passed = 0;
let failed = 0;
function report(ok: boolean, name: string, detail = "") {
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? `  (${detail})` : ""}`);
}

async function main() {
  const db = new pg.Client({ connectionString: DSN });
  await db.connect();

  // ── environment stubs (what the Supabase platform provides) ──
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

  // ── apply schema + migrations exactly as shipped ──
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

  // ── seed (as superuser) ──
  const { rows: [waiting] } = await db.query(
    `insert into games (room_code, host_wallet, status, current_round) values ('RLSW01','HOSTWALLET','waiting',0) returning id`,
  );
  const { rows: [playing] } = await db.query(
    `insert into games (room_code, host_wallet, status, current_round) values ('RLSP01','HOSTWALLET','playing',1) returning id`,
  );
  await db.query(
    `insert into players (game_id, wallet_address, display_name) values ($1,'PLAYER1','P1')`,
    [playing.id],
  );
  await db.query(
    `insert into votes (game_id, round, voter_wallet, vote) values ($1,1,'PLAYER1','transparent')`,
    [playing.id],
  );
  await db.query(
    `insert into predictions (game_id, bettor_wallet, predicted_winner_wallet, amount_lamports) values ($1,'BETTOR','PLAYER1',1000)`,
    [playing.id],
  );

  async function as(role: "anon" | "service_role", sql: string, params: unknown[] = []) {
    await db.query("begin");
    try {
      await db.query(`set local role ${role}`);
      await db.query(`select set_config('request.jwt.claim.role', $1, true)`, [role]);
      const res = await db.query(sql, params);
      await db.query("commit");
      return { ok: true as const, rowCount: res.rowCount ?? 0, err: "" };
    } catch (e) {
      await db.query("rollback");
      return { ok: false as const, rowCount: 0, err: (e as Error).message };
    }
  }

  console.log("\nas anon (the browser key):");

  let r = await as("anon", `update games set status='gameover' where id=$1`, [playing.id]);
  report(!r.ok && r.err.includes("protected game columns"), "cannot flip games.status", r.err.slice(0, 60));

  r = await as("anon", `update games set current_round=99 where id=$1`, [playing.id]);
  report(!r.ok && r.err.includes("protected game columns"), "cannot jump games.current_round");

  r = await as("anon", `update games set game_phase='storyteller-reveal' where id=$1`, [playing.id]);
  report(!r.ok && r.err.includes("protected game columns"), "cannot force games.game_phase");

  r = await as("anon", `update games set host_wallet='ATTACKER' where id=$1`, [playing.id]);
  report(!r.ok && r.err.includes("protected game columns"), "cannot steal games.host_wallet");

  r = await as("anon", `update games set buy_in_lamports=1 where id=$1`, [playing.id]);
  report(!r.ok && r.err.includes("protected game columns"), "cannot rewrite games.buy_in_lamports");

  r = await as("anon", `update games set room_name='benign rename' where id=$1`, [playing.id]);
  report(r.ok && r.rowCount === 1, "CAN update unprotected games columns (room_name)");

  r = await as("anon", `update votes set vote='fake' where game_id=$1`, [playing.id]);
  report(r.ok && r.rowCount === 0, "cannot rewrite votes (0 rows — no UPDATE policy)");

  r = await as("anon", `delete from votes where game_id=$1`, [playing.id]);
  report(r.ok && r.rowCount === 0, "cannot delete votes (0 rows — no DELETE policy)");

  r = await as("anon", `insert into votes (game_id, round, voter_wallet, vote) values ($1,0,'CHEATER','fake')`, [waiting.id]);
  report(!r.ok && r.err.includes("row-level security"), "cannot vote in a game that is not playing");

  r = await as("anon", `insert into votes (game_id, round, voter_wallet, vote) values ($1,1,'PLAYER2','fake')`, [playing.id]);
  report(r.ok, "CAN vote in a playing game");

  r = await as("anon", `update players set wallet_address='ATTACKER' where game_id=$1`, [playing.id]);
  report(!r.ok && r.err.includes("immutable"), "cannot hijack players.wallet_address");

  r = await as("anon", `update players set display_name='new name' where game_id=$1`, [playing.id]);
  report(r.ok && r.rowCount === 1, "CAN update players.display_name");

  r = await as("anon", `insert into players (game_id, wallet_address) values ($1,'LATECOMER')`, [playing.id]);
  report(!r.ok && r.err.includes("row-level security"), "cannot join a game that already started");

  r = await as("anon", `insert into players (game_id, wallet_address) values ($1,'NEWPLAYER')`, [waiting.id]);
  report(r.ok, "CAN join a waiting game");

  r = await as("anon", `update question_submissions set votes=999`);
  report(r.ok && r.rowCount === 0, "cannot rewrite question vote counts (0 rows)");

  r = await as("anon", `update predictions set settled=true where game_id=$1`, [playing.id]);
  report(r.ok && r.rowCount === 0, "cannot self-settle predictions (0 rows)");

  r = await as("anon", `delete from games where id=$1`, [playing.id]);
  report(r.ok && r.rowCount === 0, "cannot delete games (0 rows)");

  console.log("\nas service_role (Edge Functions):");

  r = await as("service_role", `update games set status='gameover', current_round=2 where id=$1`, [playing.id]);
  report(r.ok && r.rowCount === 1, "CAN advance protected game columns");

  r = await as("service_role", `update predictions set settled=true where game_id=$1`, [playing.id]);
  report(r.ok && r.rowCount === 1, "CAN settle predictions");

  console.log(`\n${passed} passed, ${failed} failed`);
  await db.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("rls-verify failed:", e.message);
  process.exit(1);
});
