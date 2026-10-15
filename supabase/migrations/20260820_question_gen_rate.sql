-- Per-wallet rate limit for the generate-questions edge function.
-- APPLY THIS BEFORE deploying generate-questions. If the function is deployed
-- first, every request fails closed with 503.
-- This file is not applied to production by the integration branch.

create table if not exists public.question_gen_rate (
  wallet        text    not null,
  game_id       text    not null,
  minute_bucket bigint  not null,
  call_count    integer not null default 1,
  created_at    timestamptz not null default now(),
  primary key (wallet, game_id, minute_bucket)
);

alter table public.question_gen_rate enable row level security;

drop policy if exists "service role full access on question_gen_rate" on public.question_gen_rate;
create policy "service role full access on question_gen_rate"
  on public.question_gen_rate
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.question_gen_rate from public, anon, authenticated;

create or replace function public.increment_question_gen_rate(
  p_wallet        text,
  p_game_id       text,
  p_minute_bucket bigint
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.question_gen_rate (wallet, game_id, minute_bucket, call_count)
  values (p_wallet, p_game_id, p_minute_bucket, 1)
  on conflict (wallet, game_id, minute_bucket)
  do update set call_count = public.question_gen_rate.call_count + 1
  returning call_count into v_count;
  return v_count;
end;
$$;

revoke all on function public.increment_question_gen_rate(text, text, bigint) from public, anon, authenticated;
grant execute on function public.increment_question_gen_rate(text, text, bigint) to service_role;
