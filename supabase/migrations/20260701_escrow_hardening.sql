-- ============================================================
-- Escrow Hardening — RLS lockdown + host-gated phase advance
-- Run in Supabase SQL Editor (or `supabase db push`).
--
-- IMPORTANT: apply this TOGETHER with deploying the `advance-phase` and
-- `settle-game` Edge Functions and setting VITE_USE_EDGE_GAME_AUTH=true in
-- the client. After this migration, anon clients can no longer write
-- game-critical columns directly — those writes must go through the Edge
-- Functions, which verify a wallet signature and act with the service role.
--
-- Identity model: this app has no Supabase Auth (players are Privy Solana
-- wallets), so RLS cannot distinguish individual players. The lockdown
-- strategy is therefore:
--   1. Protected columns on `games` (status/phase/round/host/buy-in/…) are
--      frozen for anon — only the service role (Edge Functions) may change
--      them, after verifying an ed25519 signature from the host wallet.
--   2. Append-only tables (votes, question_submissions, predictions) lose
--      their anon UPDATE paths entirely.
--   3. Rows carry immutable identity columns enforced by triggers
--      (wallet_address / game_id can never be rewritten by anon).
-- ============================================================

-- ── games: game_pda column (escrow PDA reference) ───────────

alter table public.games add column if not exists game_pda text;

-- ── games: protect game-critical columns from anon writes ───

create or replace function public.protect_game_columns()
returns trigger
language plpgsql
security definer
as $$
begin
  -- service_role (Edge Functions) and direct SQL (postgres) bypass;
  -- anon / authenticated API callers are restricted.
  if coalesce(auth.role(), 'postgres') not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.status                  is distinct from old.status
     or new.game_phase              is distinct from old.game_phase
     or new.current_round           is distinct from old.current_round
     or new.current_question_index  is distinct from old.current_question_index
     or new.current_hot_seat_player is distinct from old.current_hot_seat_player
     or new.host_wallet             is distinct from old.host_wallet
     or new.buy_in_lamports         is distinct from old.buy_in_lamports
     or new.room_code               is distinct from old.room_code
     or new.game_pda                is distinct from old.game_pda
  then
    raise exception 'protected game columns can only be changed via the game server (advance-phase / settle-game)';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_game_columns on public.games;
create trigger trg_protect_game_columns
  before update on public.games
  for each row execute function public.protect_game_columns();

-- Keep a permissive UPDATE policy for the remaining (unprotected) columns —
-- pot raises, question options etc. The trigger above does the real gating.
drop policy if exists "anon can update games" on public.games;
create policy "anon can update games" on public.games for update using (true);

-- No anon deletes on games (host cancel = status change via Edge Function).
drop policy if exists "anon can delete games" on public.games;

-- ── players: immutable identity, no row hijacking ────────────

create or replace function public.protect_player_columns()
returns trigger
language plpgsql
security definer
as $$
begin
  if coalesce(auth.role(), 'postgres') not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.game_id is distinct from old.game_id
     or new.wallet_address is distinct from old.wallet_address
     or new.joined_at is distinct from old.joined_at
  then
    raise exception 'player identity columns are immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_player_columns on public.players;
create trigger trg_protect_player_columns
  before update on public.players
  for each row execute function public.protect_player_columns();

-- Explicit player policies (idempotent re-create).
drop policy if exists "anon can read players"   on public.players;
drop policy if exists "anon can insert players" on public.players;
drop policy if exists "anon can update players" on public.players;
drop policy if exists "anon can delete players" on public.players;

create policy "anon can read players"   on public.players for select using (true);
-- Players may only insert themselves into games that are still open.
create policy "anon can insert players" on public.players for insert
  with check (
    exists (
      select 1 from public.games g
      where g.id = game_id and g.status = 'waiting'
    )
  );
-- Ready-up / display-name changes (identity columns frozen by trigger).
create policy "anon can update players" on public.players for update using (true);
-- Needed by leave / approve-leave flows. Cannot be scoped to "own row"
-- without real auth — documented limitation.
create policy "anon can delete players" on public.players for delete using (true);

-- ── votes: append-only ───────────────────────────────────────

drop policy if exists "anon can update votes" on public.votes;
drop policy if exists "anon can delete votes" on public.votes;
-- (select/insert policies from schema.sql remain; votes are unique per
--  (game_id, round, voter_wallet) so a wallet cannot double-vote.)

-- Votes may only be inserted for games that are actually in progress.
drop policy if exists "anon can insert votes" on public.votes;
create policy "anon can insert votes" on public.votes for insert
  with check (
    exists (
      select 1 from public.games g
      where g.id = game_id and g.status in ('playing', 'voting')
    )
  );

-- ── question_submissions: counts only via RPC ────────────────

-- Vote counts change only through increment_question_votes() (security
-- definer). Direct anon updates are removed.
drop policy if exists "anon can update questions" on public.question_submissions;
drop policy if exists "anon can delete questions" on public.question_submissions;

-- ── predictions: append-only; settlement via Edge Function ───

drop policy if exists "predictions_update" on public.predictions;
drop policy if exists "predictions_delete" on public.predictions;
-- (predictions_select / predictions_insert remain. `settled` can now only be
--  flipped by the settle-game Edge Function using the service role.)
