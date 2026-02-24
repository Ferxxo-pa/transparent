-- ============================================================
-- Transparent — Supabase Schema
-- Paste this entire file into: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- ── Tables ──────────────────────────────────────────────────

create table if not exists public.games (
  id                      uuid primary key default gen_random_uuid(),
  room_code               text not null unique,
  room_name               text not null default 'Game Room',
  host_wallet             text not null,
  buy_in_lamports         bigint not null default 0,
  status                  text not null default 'waiting'
                            check (status in ('waiting','playing','voting','gameover')),
  current_question_index  int not null default 0,
  current_hot_seat_player text,
  question_mode           text not null default 'classic'
                            check (question_mode in ('classic','custom','hot-take')),
  custom_questions        text[],
  game_phase              text,
  current_round           int not null default 0,
  created_at              timestamptz not null default now()
);

create table if not exists public.players (
  id             uuid primary key default gen_random_uuid(),
  game_id        uuid not null references public.games(id) on delete cascade,
  wallet_address text not null,
  display_name   text not null default 'Player',
  has_paid       boolean not null default false,
  joined_at      timestamptz not null default now(),
  unique(game_id, wallet_address)
);

create table if not exists public.votes (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references public.games(id) on delete cascade,
  round         int not null,
  voter_wallet  text not null,
  vote          text not null check (vote in ('transparent','fake')),
  created_at    timestamptz not null default now(),
  unique(game_id, round, voter_wallet)
);

create table if not exists public.question_submissions (
  id               uuid primary key default gen_random_uuid(),
  game_id          uuid not null references public.games(id) on delete cascade,
  round            int not null,
  submitter_wallet text not null,
  question_text    text not null,
  votes            int not null default 0,
  created_at       timestamptz not null default now()
);

-- ── Realtime ─────────────────────────────────────────────────

alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.votes;
alter publication supabase_realtime add table public.question_submissions;

-- ── RLS — enable but allow anon full access (party game, no auth needed) ──

alter table public.games                enable row level security;
alter table public.players              enable row level security;
alter table public.votes                enable row level security;
alter table public.question_submissions enable row level security;

-- Games
create policy "anon can read games"   on public.games for select using (true);
create policy "anon can insert games" on public.games for insert with check (true);
create policy "anon can update games" on public.games for update using (true);

-- Players
create policy "anon can read players"   on public.players for select using (true);
create policy "anon can insert players" on public.players for insert with check (true);

-- Votes
create policy "anon can read votes"   on public.votes for select using (true);
create policy "anon can insert votes" on public.votes for insert with check (true);

-- Question submissions
create policy "anon can read questions"   on public.question_submissions for select using (true);
create policy "anon can insert questions" on public.question_submissions for insert with check (true);
create policy "anon can update questions" on public.question_submissions for update using (true);

-- ── RPC for atomic vote increment ────────────────────────────

create or replace function increment_question_votes(question_id uuid)
returns void language sql security definer as $$
  update public.question_submissions
  set votes = votes + 1
  where id = question_id;
$$;
