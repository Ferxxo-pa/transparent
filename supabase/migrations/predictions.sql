-- Prediction Market Table
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/spyafdjlbgcoxhnyrijk/sql

CREATE TABLE IF NOT EXISTS predictions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id                 UUID REFERENCES games(id) ON DELETE CASCADE,
  bettor_wallet           TEXT NOT NULL,
  bettor_name             TEXT NOT NULL DEFAULT 'Anon',
  predicted_winner_wallet TEXT NOT NULL,
  amount_lamports         BIGINT NOT NULL DEFAULT 0,
  settled                 BOOLEAN NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast game lookups
CREATE INDEX IF NOT EXISTS predictions_game_id_idx ON predictions (game_id);

-- Allow anyone to read predictions (public game data)
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "predictions_select" ON predictions FOR SELECT USING (true);
CREATE POLICY "predictions_insert" ON predictions FOR INSERT WITH CHECK (true);
CREATE POLICY "predictions_update" ON predictions FOR UPDATE USING (true);
