-- ============================================================
-- Transparent Game — Complete Supabase Schema
-- Run this in the Supabase SQL Editor (fresh project)
-- ============================================================

-- Games table
CREATE TABLE IF NOT EXISTS games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_code TEXT NOT NULL UNIQUE,
  room_name TEXT NOT NULL DEFAULT 'Game Room',
  host_wallet TEXT NOT NULL,
  buy_in_lamports BIGINT NOT NULL DEFAULT 100000000,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'voting', 'gameover')),
  current_question_index INTEGER NOT NULL DEFAULT 0,
  current_hot_seat_player TEXT,
  question_mode TEXT NOT NULL DEFAULT 'classic',
  custom_questions JSONB,
  game_phase TEXT,
  current_round INTEGER NOT NULL DEFAULT 0,
  payout_mode TEXT DEFAULT 'winner-takes-all',
  num_questions INTEGER,
  current_pot NUMERIC DEFAULT 0,
  question_options JSONB,
  question_pick_votes JSONB,
  storyteller_choice TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Players table
CREATE TABLE IF NOT EXISTS players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT 'Anon',
  has_paid BOOLEAN NOT NULL DEFAULT FALSE,
  is_ready BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_id, wallet_address)
);

-- Votes table
CREATE TABLE IF NOT EXISTS votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round INTEGER NOT NULL DEFAULT 0,
  voter_wallet TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('transparent', 'fake')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_id, round, voter_wallet)
);

-- Question submissions (hot-take mode)
CREATE TABLE IF NOT EXISTS question_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  submitter_wallet TEXT NOT NULL,
  question_text TEXT NOT NULL,
  votes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_id, round, submitter_wallet)
);

-- Predictions (prediction market)
CREATE TABLE IF NOT EXISTS predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  bettor_wallet TEXT NOT NULL,
  bettor_name TEXT NOT NULL DEFAULT 'Anon',
  predicted_winner_wallet TEXT NOT NULL,
  amount_lamports BIGINT NOT NULL DEFAULT 0,
  settled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Player stats — persistent across games
CREATE TABLE IF NOT EXISTS player_stats (
  wallet_address TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT 'Anon',
  games_played INTEGER NOT NULL DEFAULT 0,
  sol_won NUMERIC NOT NULL DEFAULT 0,
  sol_lost NUMERIC NOT NULL DEFAULT 0,
  total_transparent_votes INTEGER NOT NULL DEFAULT 0,
  total_fake_votes INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_games_room_code ON games(room_code);
CREATE INDEX IF NOT EXISTS idx_players_game_id ON players(game_id);
CREATE INDEX IF NOT EXISTS idx_players_wallet ON players(wallet_address);
CREATE INDEX IF NOT EXISTS idx_votes_game_id ON votes(game_id);
CREATE INDEX IF NOT EXISTS idx_votes_round ON votes(game_id, round);
CREATE INDEX IF NOT EXISTS idx_question_submissions_game ON question_submissions(game_id);
CREATE INDEX IF NOT EXISTS idx_question_submissions_round ON question_submissions(game_id, round);
CREATE INDEX IF NOT EXISTS idx_predictions_game ON predictions(game_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_wallet ON player_stats(wallet_address);

-- Enable RLS
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "games_select" ON games FOR SELECT USING (true);
CREATE POLICY "games_insert" ON games FOR INSERT WITH CHECK (true);
CREATE POLICY "games_update" ON games FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "games_delete" ON games FOR DELETE USING (true);

CREATE POLICY "players_select" ON players FOR SELECT USING (true);
CREATE POLICY "players_insert" ON players FOR INSERT WITH CHECK (true);
CREATE POLICY "players_update" ON players FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "players_delete" ON players FOR DELETE USING (true);

CREATE POLICY "votes_select" ON votes FOR SELECT USING (true);
CREATE POLICY "votes_insert" ON votes FOR INSERT WITH CHECK (true);

CREATE POLICY "question_submissions_select" ON question_submissions FOR SELECT USING (true);
CREATE POLICY "question_submissions_insert" ON question_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "question_submissions_update" ON question_submissions FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "predictions_select" ON predictions FOR SELECT USING (true);
CREATE POLICY "predictions_insert" ON predictions FOR INSERT WITH CHECK (true);
CREATE POLICY "predictions_update" ON predictions FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "player_stats_select" ON player_stats FOR SELECT USING (true);
CREATE POLICY "player_stats_insert" ON player_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "player_stats_update" ON player_stats FOR UPDATE USING (true) WITH CHECK (true);

-- Atomic vote increment function
CREATE OR REPLACE FUNCTION increment_question_votes(question_id UUID)
RETURNS void AS $$
  UPDATE question_submissions SET votes = votes + 1 WHERE id = question_id;
$$ LANGUAGE sql;

-- Enable real-time
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE votes;
ALTER PUBLICATION supabase_realtime ADD TABLE question_submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE predictions;
