-- Migration: per-wallet+game rate-limit table for generate-questions edge fn.
-- Tracks how many times each (wallet, game_id) pair has called the endpoint
-- within a given minute bucket (floor(unix_ms / 60000)).
--
-- NOTE: do NOT apply this migration directly.
-- Ez ships from a clean copy and applies migrations manually.

create table if not exists question_gen_rate (
  wallet        text    not null,
  game_id       text    not null,
  minute_bucket bigint  not null,
  call_count    integer not null default 1,
  created_at    timestamptz not null default now(),
  primary key (wallet, game_id, minute_bucket)
);

-- Only the service role (edge functions) may read/write this table.
alter table question_gen_rate enable row level security;

create policy "service role full access on question_gen_rate"
  on question_gen_rate
  for all
  to service_role
  using (true)
  with check (true);

-- Atomically increments the call counter for a given (wallet, game, minute)
-- and returns the new count. Used by the generate-questions edge function to
-- enforce the per-caller rate limit without a read-then-write race.
create or replace function increment_question_gen_rate(
  p_wallet        text,
  p_game_id       text,
  p_minute_bucket bigint
) returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  insert into question_gen_rate (wallet, game_id, minute_bucket, call_count)
  values (p_wallet, p_game_id, p_minute_bucket, 1)
  on conflict (wallet, game_id, minute_bucket)
  do update set call_count = question_gen_rate.call_count + 1
  returning call_count into v_count;
  return v_count;
end;
$$;
