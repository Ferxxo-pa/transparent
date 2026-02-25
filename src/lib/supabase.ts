import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

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
  question_mode: 'classic' | 'custom' | 'hot-take';
  custom_questions: string[] | null;
  game_phase: string | null;
  current_round: number;
  payout_mode: string | null;
  created_at: string;
}

export interface PlayerRow {
  id: string;
  game_id: string;
  wallet_address: string;
  display_name: string;
  has_paid: boolean;
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

// ── CRUD Helpers ────────────────────────────────────────────

export async function createGameInDB(data: {
  room_code: string;
  room_name: string;
  host_wallet: string;
  buy_in_lamports: number;
  question_mode?: string;
  custom_questions?: string[] | null;
  payout_mode?: string;
}): Promise<GameRow> {
  const { data: game, error } = await supabase
    .from('games')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return game;
}

export async function getGameByRoomCode(roomCode: string): Promise<GameRow | null> {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('room_code', roomCode)
    .single();
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
  return data ?? null;
}

export async function updateGameStatus(
  gameId: string,
  updates: Partial<Pick<GameRow, 'status' | 'current_question_index' | 'current_hot_seat_player' | 'game_phase' | 'current_round'>>
) {
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
  const { error } = await supabase
    .from('predictions')
    .update({ settled: true })
    .eq('game_id', gameId);
  if (error) throw error;
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
      async (payload) => {
        console.log('[Realtime] players change:', payload.eventType, payload.new);
        // Re-fetch all players on any change for consistency
        const players = await getPlayersForGame(gameId);
        console.log('[Realtime] re-fetched players:', players.length);
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
      { event: 'INSERT', schema: 'public', table: 'predictions', filter: `game_id=eq.${gameId}` },
      async () => {
        if (!onPredictionsChange) return;
        const predictions = await getPredictionsForGame(gameId);
        onPredictionsChange(predictions);
      },
    )
    .subscribe((status, err) => {
      console.log(`[Realtime] game-${gameId} status: ${status}`, err ?? '');
    });

  return channel;
}

export function unsubscribeFromGame(channel: RealtimeChannel) {
  supabase.removeChannel(channel);
}
