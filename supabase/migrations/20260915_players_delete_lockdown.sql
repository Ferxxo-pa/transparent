-- ============================================================
-- Players DELETE lockdown — close the "anon can delete any waiting
-- player" gap left open by 20260915_delete_policy_reconciliation.sql
--
-- Gap: that migration's own comment admits it — "Without real auth we
-- can't scope to own row — but we can at least prevent deletes during
-- active play." The resulting policy (`using (g.status = 'waiting')`)
-- lets ANY anon caller delete ANY player row in a waiting game,
-- including another wallet's already-PAID row. A malicious or buggy
-- client can bump a paid player out of the game they escrowed into.
--
-- Fix: block anon DELETE on players entirely and route the two
-- legitimate delete paths (self-leave, host-approved leave/kick) through
-- the leave-game Edge Function, which verifies an ed25519 signature from
-- the caller's own wallet before calling this migration's
-- leave_game_player() RPC with service_role. That RPC is the real "own
-- row" check this table can't express in RLS alone — signature
-- verification proves wallet ownership; RLS only sees the anon key.
--
-- Scope note: this migration is intentionally narrower than
-- 20260915_player_rls_lockdown.PROPOSED.sql. It touches ONLY the players
-- DELETE policy, not INSERT/UPDATE (has_paid, is_ready, join, ready-up
-- stay on their current client-write paths, already covered by the
-- protect_player_columns trigger from 20260915_server_authoritative_pot_
-- settlement.sql). That keeps this safe to apply without also requiring
-- the join-game / ready-up-player Edge Functions to be live.
--
-- PREREQUISITE: the leave-game Edge Function (supabase/functions/
-- leave-game) must be deployed before this migration is applied, or
-- self-leave / host-kick will fail closed (the on-chain refund still
-- happens; only the DB row removal is blocked until the function is
-- live). The client (GameContext.tsx leaveGame / approveLeave) now calls
-- leaveGameViaEdge() unconditionally for player deletion, independent of
-- the VITE_USE_EDGE_GAME_AUTH flag — that flag continues to gate the
-- phase/settlement admin paths only.
-- ============================================================

-- ── replay protection for the leave/kick action token ───────────
-- Needed by supabase/functions/_shared/gameAuth.ts consumeAuthToken().

create table if not exists public.used_game_tokens (
  token_hash text primary key,
  game_id    uuid not null,
  action     text not null,
  wallet     text,
  used_at    timestamptz not null default now()
);
alter table public.used_game_tokens add column if not exists wallet text;

alter table public.used_game_tokens enable row level security;
revoke all on public.used_game_tokens from anon, authenticated;
grant select, insert on public.used_game_tokens to service_role;

-- ── assert the caller is the trusted server ─────────────────────

create or replace function public.assert_game_server()
returns void
language plpgsql
security definer
as $$
begin
  if coalesce(auth.role(), 'postgres') in ('anon', 'authenticated') then
    raise exception 'permission denied: player mutations must go through the game server';
  end if;
end;
$$;
revoke all on function public.assert_game_server() from public, anon, authenticated;
grant execute on function public.assert_game_server() to service_role;

-- ── leave: delete + (host) cancel, atomically ───────────────────
-- If the host leaves, the delete and the status='cancelled' update happen
-- in one transaction — a failed cancel rolls back the delete too, so no
-- partial "host left" state is ever committed.

create or replace function public.leave_game_player(
  p_game_id uuid,
  p_caller text,
  p_target text default null
) returns boolean
language plpgsql
security definer
as $$
declare
  g public.games;
  wallet_to_remove text;
  removed_count int;
  is_host boolean;
begin
  perform public.assert_game_server();

  select * into g from public.games where id = p_game_id for update;
  if not found then raise exception 'game not found' using errcode = 'P0002'; end if;
  if g.status <> 'waiting' then
    raise exception 'can only leave a game that is still waiting' using errcode = 'P0001';
  end if;

  wallet_to_remove := coalesce(p_target, p_caller);

  if p_target is not null and p_target <> p_caller and p_caller <> g.host_wallet then
    raise exception 'only the host can remove other players' using errcode = 'P0004';
  end if;

  delete from public.players
  where game_id = p_game_id and wallet_address = wallet_to_remove;
  get diagnostics removed_count = row_count;
  if removed_count = 0 then
    raise exception 'player not found in this game' using errcode = 'P0002';
  end if;

  is_host := (p_caller = g.host_wallet and wallet_to_remove = p_caller);
  if is_host then
    update public.games set status = 'cancelled' where id = p_game_id;
  end if;

  return is_host;
end;
$$;
revoke all on function public.leave_game_player(uuid, text, text) from public, anon, authenticated;
grant execute on function public.leave_game_player(uuid, text, text) to service_role;

-- ── block anon DELETE on players entirely ───────────────────────
-- All player deletes now go through leave_game_player() above, called
-- only by the leave-game Edge Function (service_role, wallet-signature
-- verified).

drop policy if exists "anon can delete players" on public.players;
create policy "anon cannot directly delete players" on public.players
  for delete using (false);
