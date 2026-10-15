-- NFC cards + off-chain credits ledger.
-- APPLY BEFORE deploying claim-card / credits-balance, and before a client
-- build that writes games.spice. Not applied to production by this branch.
--
-- Credits are an append-only per-user balance. There is no mint, no transfer
-- row, and no cash-out. One claim per card, ever.

alter table public.games add column if not exists spice text not null default 'mild';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'games_spice_check'
  ) then
    alter table public.games
      add constraint games_spice_check check (spice in ('mild', 'spicy'));
  end if;
end $$;

create table if not exists public.cards (
  id          text primary key,
  serial      text not null unique,
  role        text not null check (role in ('host', 'player')),
  claimed_at  timestamptz,
  claimed_by  text,
  created_at  timestamptz not null default now(),
  constraint cards_claim_pair check (
    (claimed_at is null and claimed_by is null)
    or (claimed_at is not null and claimed_by is not null)
  )
);

create index if not exists cards_claimed_by_idx on public.cards (claimed_by);

create table if not exists public.credits_ledger (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null,
  delta           integer not null,
  reason          text not null,
  card_id         text references public.cards (id),
  idempotency_key text not null unique,
  created_at      timestamptz not null default now(),
  constraint credits_reason_sign check (
    (reason = 'card_claim' and delta > 0)
    or (reason = 'spend' and delta < 0)
  )
);

create index if not exists credits_ledger_user_idx on public.credits_ledger (user_id);

create or replace function public.reject_credits_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'credits_ledger is append-only';
end;
$$;

drop trigger if exists credits_ledger_append_only on public.credits_ledger;
create trigger credits_ledger_append_only
  before update or delete on public.credits_ledger
  for each row execute function public.reject_credits_mutation();

create or replace function public.credits_balance_for(p_user text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(delta), 0)::bigint
  from public.credits_ledger
  where user_id = p_user;
$$;

create table if not exists public.card_claim_rate (
  bucket_key    text not null,
  minute_bucket bigint not null,
  call_count    integer not null default 1,
  created_at    timestamptz not null default now(),
  primary key (bucket_key, minute_bucket)
);

create or replace function public.increment_card_claim_rate(
  p_bucket_key    text,
  p_minute_bucket bigint
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.card_claim_rate (bucket_key, minute_bucket, call_count)
  values (p_bucket_key, p_minute_bucket, 1)
  on conflict (bucket_key, minute_bucket)
  do update set call_count = public.card_claim_rate.call_count + 1
  returning call_count into v_count;
  return v_count;
end;
$$;

alter table public.cards enable row level security;
alter table public.credits_ledger enable row level security;
alter table public.card_claim_rate enable row level security;

-- Default deny for browser roles. Edge functions use the service role.
revoke all on table public.cards from public, anon, authenticated;
revoke all on table public.credits_ledger from public, anon, authenticated;
revoke all on table public.card_claim_rate from public, anon, authenticated;

revoke all on function public.credits_balance_for(text) from public, anon, authenticated;
grant execute on function public.credits_balance_for(text) to service_role;

revoke all on function public.increment_card_claim_rate(text, bigint) from public, anon, authenticated;
grant execute on function public.increment_card_claim_rate(text, bigint) to service_role;

revoke all on function public.reject_credits_mutation() from public, anon, authenticated;
