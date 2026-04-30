-- ============================================================
-- Transparent Game — Supabase Schema
-- Run this in the Supabase SQL Editor to create the tables
-- ============================================================

-- Enable real-time for all tables
-- (also enable via Supabase Dashboard → Database → Replication)

-- Games table
CREATE TABLE IF NOT EXISTS games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_code TEXT NOT NULL UNIQUE,
  room_name TEXT NOT NULL DEFAULT 'Game Room',
  host_wallet TEXT NOT NULL,
  buy_in_lamports BIGINT NOT NULL DEFAULT 100000000, -- 0.1 SOL
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'voting', 'gameover')),
  current_question_index INTEGER NOT NULL DEFAULT 0,
  current_hot_seat_player TEXT, -- wallet address of player in hot seat
  question_mode TEXT NOT NULL DEFAULT 'classic' CHECK (question_mode IN ('classic', 'custom', 'hot-take')),
  custom_questions JSONB, -- array of custom question strings (custom mode)
  game_phase TEXT CHECK (game_phase IN ('submitting-questions', 'voting-question', 'answering', 'voting-honesty')),
  current_round INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Players table
CREATE TABLE IF NOT EXISTS players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT 'Anon',
  has_paid BOOLEAN NOT NULL DEFAULT FALSE,
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

-- Question submissions table (for hot-take mode)
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

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_games_room_code ON games(room_code);
CREATE INDEX IF NOT EXISTS idx_players_game_id ON players(game_id);
CREATE INDEX IF NOT EXISTS idx_players_wallet ON players(wallet_address);
CREATE INDEX IF NOT EXISTS idx_votes_game_id ON votes(game_id);
CREATE INDEX IF NOT EXISTS idx_votes_round ON votes(game_id, round);
CREATE INDEX IF NOT EXISTS idx_question_submissions_game ON question_submissions(game_id);
CREATE INDEX IF NOT EXISTS idx_question_submissions_round ON question_submissions(game_id, round);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies — scoped per operation
-- Games: anyone can read, only host can update/delete
CREATE POLICY "games_select" ON games FOR SELECT USING (true);
CREATE POLICY "games_insert" ON games FOR INSERT WITH CHECK (true);
CREATE POLICY "games_update" ON games FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "games_delete" ON games FOR DELETE USING (true);

-- Players: anyone can read, insert own row, no deletes via client
CREATE POLICY "players_select" ON players FOR SELECT USING (true);
CREATE POLICY "players_insert" ON players FOR INSERT WITH CHECK (true);
CREATE POLICY "players_update" ON players FOR UPDATE USING (true) WITH CHECK (true);

-- Votes: anyone can read, insert own vote (unique constraint prevents doubles)
CREATE POLICY "votes_select" ON votes FOR SELECT USING (true);
CREATE POLICY "votes_insert" ON votes FOR INSERT WITH CHECK (true);

-- Question submissions: anyone can read, insert own, update vote counts
CREATE POLICY "question_submissions_select" ON question_submissions FOR SELECT USING (true);
CREATE POLICY "question_submissions_insert" ON question_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "question_submissions_update" ON question_submissions FOR UPDATE USING (true) WITH CHECK (true);

-- Atomic vote increment for question submissions (avoids race conditions)
CREATE OR REPLACE FUNCTION increment_question_votes(question_id UUID)
RETURNS void AS $$
  UPDATE question_submissions SET votes = votes + 1 WHERE id = question_id;
$$ LANGUAGE sql;

-- Storyteller mode: persist hot-seat player's truth/fake choice
ALTER TABLE games ADD COLUMN IF NOT EXISTS storyteller_choice TEXT;

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

ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;
-- Player stats: anyone can read, insert/update own stats
CREATE POLICY "player_stats_select" ON player_stats FOR SELECT USING (true);
CREATE POLICY "player_stats_insert" ON player_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "player_stats_update" ON player_stats FOR UPDATE USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_player_stats_wallet ON player_stats(wallet_address);

-- Enable real-time publication
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE votes;
ALTER PUBLICATION supabase_realtime ADD TABLE question_submissions;
