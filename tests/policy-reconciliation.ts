/**
 * Verifies policy reconciliation: after applying the full migration stack,
 * the legacy schema-full.sql-lineage policies ("votes_insert",
 * "question_submissions_update", "players_insert", "players_update") no
 * longer survive alongside the escrow-hardening policies. Proves anon
 * denial on the 4 gaps closed by 20260915_policy_reconciliation.sql.
 *
 * Run against a DISPOSABLE local Postgres:
 *   docker run -d --name rls-policy-recon -e POSTGRES_PASSWORD=postgres -p 55443:5432 postgres:16
 *   DSN=postgres://postgres:postgres@127.0.0.1:55443/postgres npx tsx tests/policy-reconciliation.ts
 */

import { readFileSync } from "node:fs";
import pg from "pg";

const DSN = process.env.DSN ?? "postgres://postgres:postgres@127.0.0.1:55443/postgres";

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

  // Apply the supabase/schema.sql lineage first (this is what the anon
  // hardening migrations target by name), THEN layer the schema-full.sql
  // lineage's short-named legacy policies on top — this reproduces the
  // exact "two lineages coexist" state the reconciliation migration must
  // clean up, regardless of which schema a given environment was actually
  // bootstrapped from.
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

  // Simulate the legacy schema-full.sql-lineage leftovers directly (these
  // are what a DB bootstrapped from src/lib/schema-full.sql would still
  // have at this point, since none of the migrations above touch them).
  await db.query(`
    create policy "votes_insert" on public.votes for insert with check (true);
    create policy "question_submissions_update" on public.question_submissions
      for update using (true) with check (true);
    create policy "players_insert" on public.players for insert with check (true);
    create policy "players_update" on public.players for update using (true) with check (true);
  `);
  console.log("seeded legacy schema-full.sql-lineage policies");

  await db.query(readFileSync("supabase/migrations/20260915_policy_reconciliation.sql", "utf8"));
  console.log("applied supabase/migrations/20260915_policy_reconciliation.sql");

  await db.query(`
    grant usage on schema public to anon, service_role;
    grant select, insert, update, delete on all tables in schema public to anon, service_role;
  `);

  // ── Setup ─────────────────────────────────────────────────
  const { rows: [waitingGame] } = await db.query(
    `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, current_pot)
     values ('PRW001', 'HOST1', 'waiting', 0, 100000, 0)
     returning id`,
  );
  const { rows: [playingGame] } = await db.query(
    `insert into games (room_code, host_wallet, status, current_round, buy_in_lamports, current_pot)
     values ('PRP001', 'HOST2', 'playing', 1, 100000, 0.5)
     returning id`,
  );
  await db.query(
    `insert into players (game_id, wallet_address, display_name, has_paid, is_ready)
     values ($1, 'PLAYER_A', 'A', true, true)`,
    [playingGame.id],
  );
  const { rows: [question] } = await db.query(
    `insert into question_submissions (game_id, round, submitter_wallet, question_text, votes)
     values ($1, 1, 'PLAYER_A', 'Who is most likely to...', 0)
     returning id`,
    [playingGame.id],
  );

  console.log("\n── Anon attack tests (must be BLOCKED) ──\n");

  await db.query("set role anon");

  // RLS denial on INSERT/UPDATE with no matching permissive policy raises a
  // 42501 exception rather than a silent 0-row result. Both count as "blocked".
  async function denied(sql: string, params: unknown[] = []): Promise<{ blocked: boolean; detail: string }> {
    try {
      const { rowCount } = await db.query(sql, params);
      return { blocked: rowCount === 0, detail: `rowCount=${rowCount}` };
    } catch (e: any) {
      return { blocked: e.code === "42501", detail: `${e.code}: ${e.message}` };
    }
  }

  // 1. votes: legacy unscoped INSERT gone — anon cannot insert votes for a
  //    game that isn't playing/voting.
  {
    const r = await denied(
      `insert into votes (game_id, round, voter_wallet, vote)
       values ($1, 0, 'PLAYER_A', 'transparent')`,
      [waitingGame.id],
    );
    report(r.blocked, "anon cannot insert vote into a waiting (not playing/voting) game", r.detail);
  }

  // 2. question_submissions: legacy unscoped UPDATE gone — anon cannot
  //    rewrite vote counts directly.
  {
    const r = await denied(
      `update question_submissions set votes = 9999 where id = $1`,
      [question.id],
    );
    report(r.blocked, "anon cannot directly update question_submissions.votes", r.detail);
  }

  // 3. players: legacy unscoped INSERT gone — anon cannot insert a player
  //    into a game that isn't waiting.
  {
    const r = await denied(
      `insert into players (game_id, wallet_address, display_name, has_paid, is_ready)
       values ($1, 'LATE_JOINER', 'Late', false, false)`,
      [playingGame.id],
    );
    report(r.blocked, "anon cannot insert player into a non-waiting game", r.detail);
  }

  // 4. players: positive control — legitimate INSERT into a waiting game
  //    still works (the scoped hardening policy is untouched).
  {
    const { rowCount } = await db.query(
      `insert into players (game_id, wallet_address, display_name, has_paid, is_ready)
       values ($1, 'LEGIT_JOIN', 'NewPlayer', false, false)`,
      [waitingGame.id],
    );
    report(rowCount === 1, "anon CAN still insert player into a waiting game (scoped policy intact)");
  }

  await db.query("reset role");

  // ── Policy inventory audit ────────────────────────────────
  console.log("\n── Policy inventory ──\n");
  const { rows: policies } = await db.query(`
    select tablename, policyname, cmd, permissive, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename in ('votes', 'question_submissions', 'players')
      and cmd in ('INSERT', 'UPDATE')
    order by tablename, cmd, policyname
  `);

  for (const p of policies) {
    const wideOpen =
      p.permissive === "PERMISSIVE" &&
      (p.qual === "(true)" || p.with_check === "(true)" || p.with_check === "true");
    console.log(`  ${p.tablename}.${p.cmd}: ${p.policyname} [${p.permissive}] qual=${p.qual} check=${p.with_check}${wideOpen ? " ⚠ WIDE-OPEN" : ""}`);
  }

  const knownLegacyNames = new Set([
    "votes_insert",
    "question_submissions_update",
    "players_insert",
    "players_update",
  ]);
  const leftoverLegacy = policies.filter((p: any) => knownLegacyNames.has(p.policyname));
  report(leftoverLegacy.length === 0, "no legacy schema-full.sql-lineage policies remain",
    leftoverLegacy.length > 0 ? leftoverLegacy.map((p: any) => p.policyname).join(", ") : "");

  await db.end();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
