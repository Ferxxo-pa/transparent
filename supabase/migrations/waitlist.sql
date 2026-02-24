-- Waitlist Table
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/spyafdjlbgcoxhnyrijk/sql

CREATE TABLE IF NOT EXISTS waitlist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  name       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "waitlist_insert" ON waitlist FOR INSERT WITH CHECK (true);
CREATE POLICY "waitlist_select" ON waitlist FOR SELECT USING (false); -- private
