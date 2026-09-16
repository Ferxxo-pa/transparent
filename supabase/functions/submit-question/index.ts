import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyGameAuth, corsHeaders, jsonResponse, type GameAuthToken } from '../_shared/gameAuth.ts';

interface SubmitQuestionRequest {
  gameId: string;
  round: number;
  questionText: string;
  auth: GameAuthToken;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: SubmitQuestionRequest = await req.json();
    const { gameId, round, questionText, auth } = body;

    if (!gameId || round == null || !questionText?.trim() || !auth) {
      return jsonResponse({ error: 'missing gameId, round, questionText, or auth' }, 400);
    }

    const caller = verifyGameAuth(auth, gameId);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify caller is actually a player in this game
    const { data: player, error: playerErr } = await supabase
      .from('players')
      .select('id')
      .eq('game_id', gameId)
      .eq('wallet_address', caller.wallet)
      .single();

    if (playerErr || !player) {
      return jsonResponse({ error: 'not a player in this game' }, 403);
    }

    // Verify game is in a state that accepts questions
    const { data: game, error: gameErr } = await supabase
      .from('games')
      .select('status')
      .eq('id', gameId)
      .single();

    if (gameErr || !game) {
      return jsonResponse({ error: 'game not found' }, 404);
    }
    if (game.status !== 'waiting' && game.status !== 'playing') {
      return jsonResponse({ error: 'game is not accepting questions' }, 409);
    }

    const { data: question, error: insertErr } = await supabase
      .from('question_submissions')
      .insert({
        game_id: gameId,
        round,
        submitter_wallet: caller.wallet,
        question_text: questionText.trim(),
      })
      .select()
      .single();

    if (insertErr) {
      return jsonResponse({ error: insertErr.message }, 500);
    }

    return jsonResponse({ question });
  } catch (err: any) {
    const status = err.message?.includes('expired') || err.message?.includes('invalid signature')
      ? 401 : 500;
    return jsonResponse({ error: err.message }, status);
  }
});
