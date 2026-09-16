-- ============================================================
-- Question submission + game config auth binding
--
-- Gap 1: question_submissions INSERT checked player membership but not wallet
-- ownership. Any anon client can claim any existing player's wallet address.
-- Fix: drop the anon INSERT policy. Questions now route through submit-question
-- Edge Function which verifies ed25519 wallet signature, then inserts with
-- service_role.
--
-- Gap 2: games UPDATE using(true) let any anon client write config columns.
-- The trigger protects critical columns, but config writes (room_name,
-- question_mode, etc.) were unguarded. Fix: restrict anon UPDATE to
-- service_role only. All game mutations now route through advance-phase
-- Edge Function which verifies wallet identity and enforces host-only for
-- config columns.
-- ============================================================

-- 1. Drop the membership-only question insert policy
drop policy if exists "anon can insert question_submissions" on public.question_submissions;

-- 2. Restrict games UPDATE to service_role
drop policy if exists "anon can update games" on public.games;

create policy "service_role can update games" on public.games
  for update using (
    current_setting('role', true) = 'service_role'
  );
