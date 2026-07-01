import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, USE_EDGE_GAME_AUTH } from './config';
import { advancePhaseViaEdge, settleGameViaEdge } from './gameAuth';

// ============================================================
// Supabase Client + Real-Time Helpers
// ============================================================

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Database Row Types ──────────────────────────────────────

export interface GameRow {
  id: string;
  room_code: string;
  room_name: string;
  host_wallet: string;
  buy_in_lamports: number;
  status: 'waiting' | 'playing' | 'voting' | 'gameover';
  current_question_index: number;
  current_hot_seat_player: string | null;
  question_mode: 'classic' | 'exposer' | 'storyteller' | 'free-for-all' | 'custom' | 'hot-take' | 'ai';
  custom_questions: string[] | null;
  game_phase: string | null;
  current_round: number;
  payout_mode: string | null;
  num_questions: number | null;
  current_pot?: number | null;
  question_options?: string[] | null;
  question_pick_votes?: Record<string, number> | null;
  storyteller_choice?: 'truth' | 'fake' | null;
  game_pda?: string | null;
  created_at: string;
}

export interface PlayerRow {
  id: string;
  game_id: string;
  wallet_address: string;
  display_name: string;
  has_paid: boolean;
  is_ready: boolean;
  joined_at: string;
}

export interface VoteRow {
  id: string;
  game_id: string;
  round: number;
  voter_wallet: string;
  vote: 'transparent' | 'fake';
  created_at: string;
}

export interface QuestionSubmissionRow {
  id: string;
  game_id: string;
  round: number;
  submitter_wallet: string;
  question_text: string;
  votes: number;
  created_at: string;
}

export interface PredictionRow {
  id: string;
  game_id: string;
  bettor_wallet: string;
  bettor_name: string;
  predicted_winner_wallet: string;
  amount_lamports: number;
  settled: boolean;
  created_at: string;
}

// ── Mode mapping (app ↔ DB) ─────────────────────────────────
// DB constraint only allows: classic, hot-take, custom, storyteller
// App uses: classic, exposer, storyteller, free-for-all
const modeToDb = (mode: string): string => {
  if (mode === 'exposer') return 'hot-take';
  if (mode === 'free-for-all') return 'custom';
  return mode;
};
const modeFromDb = (mode: string): string => {
  if (mode === 'hot-take') return 'exposer';
  if (mode === 'custom') return 'free-for-all';
  return mode;
};

// ── CRUD Helpers ────────────────────────────────────────────

export async function createGameInDB(data: {
  room_code: string;
  room_name: string;
  host_wallet: string;
  buy_in_lamports: number;
  question_mode?: string;
  custom_questions?: string[] | null;
  payout_mode?: string;
  num_questions?: number | null;
  game_pda?: string | null;
}): Promise<GameRow> {
  const dbData = { ...data };
  if (dbData.question_mode) dbData.question_mode = modeToDb(dbData.question_mode);
  const { data: game, error } = await supabase
    .from('games')
    .insert(dbData)
    .select()
    .single();
  if (error) throw error;
  if (game.question_mode) game.question_mode = modeFromDb(game.question_mode) as any;
  return game;
}

export async function getGameByRoomCode(roomCode: string): Promise<GameRow | null> {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('room_code', roomCode)
    .single();
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
  if (data?.question_mode) data.question_mode = modeFromDb(data.question_mode) as any;
  return data ?? null;
}

/** Columns the escrow-hardening migration protects at the DB level — anon
 *  clients cannot write them directly; changes must go through the
 *  advance-phase Edge Function, which verifies a wallet signature. */
const PROTECTED_GAME_COLUMNS = new Set([
  'status',
  'game_phase',
  'current_round',
  'current_question_index',
  'current_hot_seat_player',
  'storyteller_choice',
]);

export async function updateGameStatus(
  gameId: string,
  updates: Partial<GameRow>
) {
  const touchesProtected = Object.keys(updates).some((k) => PROTECTED_GAME_COLUMNS.has(k));
  if (USE_EDGE_GAME_AUTH && touchesProtected) {
    await advancePhaseViaEdge(gameId, updates as Record<string, unknown>);
    return;
  }
  const { error } = await supabase.from('games').update(updates).eq('id', gameId);
  if (error) throw error;
}

export async function addPlayerToDB(data: {
  game_id: string;
  wallet_address: string;
  display_name: string;
  has_paid: boolean;
}): Promise<PlayerRow> {
  const { data: player, error } = await supabase
    .from('players')
    .upsert(data, { onConflict: 'game_id,wallet_address', ignoreDuplicates: false })
    .select()
    .single();
  if (error) throw error;
  return player;
}

export async function readyUpPlayer(gameId: string, walletAddress: string): Promise<void> {
  const { error } = await supabase
    .from('players')
    .update({ is_ready: true })
    .eq('game_id', gameId)
    .eq('wallet_address', walletAddress);
  if (error) throw error;
}

export async function getPlayersForGame(gameId: string): Promise<PlayerRow[]> {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function insertVote(data: {
  game_id: string;
  round: number;
  voter_wallet: string;
  vote: 'transparent' | 'fake';
}): Promise<VoteRow> {
  const { data: vote, error } = await supabase
    .from('votes')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return vote;
}

export async function getVotesForRound(gameId: string, round: number): Promise<VoteRow[]> {
  const { data, error } = await supabase
    .from('votes')
    .select('*')
    .eq('game_id', gameId)
    .eq('round', round);
  if (error) throw error;
  return data ?? [];
}

// ── Question Submission Helpers (Hot-Take Mode) ─────────────

export async function submitQuestionToDB(data: {
  game_id: string;
  round: number;
  submitter_wallet: string;
  question_text: string;
}): Promise<QuestionSubmissionRow> {
  const { data: question, error } = await supabase
    .from('question_submissions')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return question;
}

export async function voteForQuestionInDB(questionId: string): Promise<void> {
  // Atomic increment via Supabase RPC to avoid race conditions
  const { error } = await supabase.rpc('increment_question_votes', { question_id: questionId });
  if (error) {
    // Fallback: non-atomic increment if RPC not yet deployed
    const { data: current, error: fetchErr } = await supabase
      .from('question_submissions')
      .select('votes')
      .eq('id', questionId)
      .single();
    if (fetchErr) throw fetchErr;
    const { error: updateErr } = await supabase
      .from('question_submissions')
      .update({ votes: (current?.votes ?? 0) + 1 })
      .eq('id', questionId);
    if (updateErr) throw updateErr;
  }
}

export async function getQuestionsForRound(
  gameId: string,
  round: number,
): Promise<QuestionSubmissionRow[]> {
  const { data, error } = await supabase
    .from('question_submissions')
    .select('*')
    .eq('game_id', gameId)
    .eq('round', round)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ── Prediction Market Helpers ───────────────────────────────

export async function placePrediction(data: {
  game_id: string;
  bettor_wallet: string;
  bettor_name: string;
  predicted_winner_wallet: string;
  amount_lamports: number;
}): Promise<PredictionRow> {
  const { data: row, error } = await supabase
    .from('predictions')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return row;
}

export async function getPredictionsForGame(gameId: string): Promise<PredictionRow[]> {
  const { data, error } = await supabase
    .from('predictions')
    .select('*')
    .eq('game_id', gameId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function settlePredictions(gameId: string): Promise<void> {
  if (USE_EDGE_GAME_AUTH) {
    // Hardened mode: anon cannot update predictions — the settle-game
    // function verifies the host's signature and marks them settled.
    await settleGameViaEdge({ gameId, action: 'settle_predictions' });
    return;
  }
  const { error } = await supabase
    .from('predictions')
    .update({ settled: true })
    .eq('game_id', gameId);
  if (error) throw error;
}

// ── Player Stats ───────────────────────────────────────────

export interface PlayerStatsRow {
  wallet_address: string;
  display_name: string;
  games_played: number;
  sol_won: number;
  sol_lost: number;
  total_transparent_votes: number;
  total_fake_votes: number;
  updated_at: string;
}

export async function getPlayerStats(walletAddress: string): Promise<PlayerStatsRow | null> {
  try {
    const { data, error } = await supabase
      .from('player_stats')
      .select('*')
      .eq('wallet_address', walletAddress)
      .single();
    if (error) return null;
    return data ?? null;
  } catch {
    return null;
  }
}

export async function upsertPlayerStats(
  walletAddress: string,
  displayName: string,
  delta: { games: number; solWon: number; solLost: number; transparentVotes: number; fakeVotes: number },
): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('player_stats')
      .select('*')
      .eq('wallet_address', walletAddress)
      .single();

    const c = existing ?? { games_played: 0, sol_won: 0, sol_lost: 0, total_transparent_votes: 0, total_fake_votes: 0 };

    await supabase.from('player_stats').upsert({
      wallet_address: walletAddress,
      display_name: displayName,
      games_played: c.games_played + delta.games,
      sol_won: c.sol_won + delta.solWon,
      sol_lost: c.sol_lost + delta.solLost,
      total_transparent_votes: c.total_transparent_votes + delta.transparentVotes,
      total_fake_votes: c.total_fake_votes + delta.fakeVotes,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'wallet_address' });
  } catch (err) {
    console.warn('[stats] upsertPlayerStats failed:', err);
  }
}

// ── Real-Time Subscriptions ─────────────────────────────────

export function subscribeToGame(
  gameId: string,
  onGameChange: (game: GameRow) => void,
  onPlayersChange: (players: PlayerRow[]) => void,
  onVotesChange: (votes: VoteRow[]) => void,
  onQuestionsChange?: (questions: QuestionSubmissionRow[]) => void,
  onPredictionsChange?: (predictions: PredictionRow[]) => void,
): RealtimeChannel {
  const channel = supabase
    .channel(`game-${gameId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
      (payload) => {
        if (payload.new && typeof payload.new === 'object' && 'id' in payload.new) {
          onGameChange(payload.new as GameRow);
        }
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` },
      async () => {
        // Re-fetch all players on any change for consistency
        const players = await getPlayersForGame(gameId);
        onPlayersChange(players);
      },
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'votes', filter: `game_id=eq.${gameId}` },
      async (payload) => {
        // Re-fetch votes for the current round
        const vote = payload.new as VoteRow;
        const votes = await getVotesForRound(gameId, vote.round);
        onVotesChange(votes);
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'question_submissions', filter: `game_id=eq.${gameId}` },
      async (payload) => {
        if (!onQuestionsChange) return;
        const q = payload.new as QuestionSubmissionRow;
        const questions = await getQuestionsForRound(gameId, q.round);
        onQuestionsChange(questions);
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'predictions', filter: `game_id=eq.${gameId}` },
      async () => {
        if (!onPredictionsChange) return;
        const predictions = await getPredictionsForGame(gameId);
        onPredictionsChange(predictions);
      },
    )
    .subscribe(() => {
    });

  return channel;
}

export function unsubscribeFromGame(channel: RealtimeChannel) {
  supabase.removeChannel(channel);
}
