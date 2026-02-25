-- Fix waitlist RLS policies
-- Run in Supabase SQL Editor if waitlist inserts fail with RLS error

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "waitlist_insert" ON waitlist;
DROP POLICY IF EXISTS "waitlist_select" ON waitlist;

-- Re-create policies
CREATE POLICY "waitlist_insert" ON waitlist FOR INSERT WITH CHECK (true);
CREATE POLICY "waitlist_select" ON waitlist FOR SELECT USING (false);
