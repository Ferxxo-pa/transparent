// Supabase Edge Function: host-gated game phase advance
//
// After the escrow-hardening migration, anon clients cannot write
// game-critical columns (status / game_phase / current_round / …) directly.
// This function is the only write path. It verifies an ed25519 wallet
// signature and enforces WHO may perform WHICH transition:
//
//   • host wallet            → any whitelisted update
//   • current hot-seat player → storyteller transitions only
//   • any player in the game  → round-advance / gameover, but ONLY if the
//     server-side vote count for the current round is actually complete
//     (the client's claim is never trusted)
//
// Deploy: supabase functions deploy advance-phase

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyGameAuth, jsonResponse, corsHeadersForRequest, GameAuthToken } from '../_shared/gameAuth.ts';

// Columns a request may update at all (superset; per-caller rules below).
const UPDATABLE_COLUMNS = new Set([
  'status',
  'game_phase',
  'current_round',
  'current_question_index',
  'current_hot_seat_player',
  'storyteller_choice',
  'current_pot',
  'question_options',
  'question_pick_votes',
]);

const STORYTELLER_PHASES = new Set([
  'storyteller-prep',
  'storyteller-telling',
  'storyteller-voting',
  'storyteller-reveal',
]);

interface RequestBody {
  gameId: string;
  updates: Record<string, unknown>;
  auth: GameAuthToken;
}

serve(async (req) => {
  const cors = corsHeadersForRequest(req);
  const respond = (body: unknown, status = 200) => jsonResponse(body, status, cors);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { gameId, updates, auth } = (await req.json()) as RequestBody;
    if (!gameId || !updates || typeof updates !== 'object') {
      return respond({ error: 'gameId and updates required' }, 400);
    }

    const keys = Object.keys(updates);
    if (keys.length === 0) return respond({ error: 'empty update' }, 400);
    for (const k of keys) {
      if (!UPDATABLE_COLUMNS.has(k)) {
        return respond({ error: `column not updatable: ${k}` }, 403);
      }
    }

    let wallet: string;
    try {
      wallet = verifyGameAuth(auth, gameId).wallet;
    } catch (e) {
      return respond({ error: `auth failed: ${(e as Error).message}` }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: game, error: gameErr } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();
    if (gameErr || !game) return respond({ error: 'game not found' }, 404);

    const isHost = wallet === game.host_wallet;

    if (!isHost) {
      // Non-host callers must be players in this game.
      const { data: players, error: playersErr } = await supabase
        .from('players')
        .select('wallet_address')
        .eq('game_id', gameId);
      if (playersErr) return respond({ error: 'failed to load players' }, 500);
      const playerWallets = (players ?? []).map((p) => p.wallet_address);
      if (!playerWallets.includes(wallet)) {
        return respond({ error: 'not a player in this game' }, 403);
      }

      const isHotSeat = wallet === game.current_hot_seat_player;
      const touched = new Set(keys);

      const isStorytellerUpdate =
        [...touched].every((k) => k === 'game_phase' || k === 'storyteller_choice') &&
        (!touched.has('game_phase') || STORYTELLER_PHASES.has(String(updates.game_phase)));

      if (isStorytellerUpdate) {
        if (!isHotSeat) {
          return respond({ error: 'only the hot-seat player may advance storyteller phases' }, 403);
        }
      } else {
        // Vote-completion advance: gameover, or next-round rollover. Verify the
        // round's votes are actually complete before allowing it.
        const isGameover = touched.has('status') && updates.status === 'gameover';
        const isRoundAdvance =
          touched.has('current_round') &&
          Number(updates.current_round) === Number(game.current_round) + 1;

        if (!isGameover && !isRoundAdvance) {
          return respond({ error: 'transition not permitted for players' }, 403);
        }

        const { data: votes, error: votesErr } = await supabase
          .from('votes')
          .select('voter_wallet')
          .eq('game_id', gameId)
          .eq('round', game.current_round);
        if (votesErr) return respond({ error: 'failed to load votes' }, 500);

        const eligible = playerWallets.filter((w) => w !== game.current_hot_seat_player).length;
        const votesNeeded = eligible > 0 ? eligible : playerWallets.length;
        if ((votes ?? []).length < votesNeeded) {
          return respond({ error: 'round votes not complete' }, 403);
        }
      }
    }

    const { error: updateErr } = await supabase.from('games').update(updates).eq('id', gameId);
    if (updateErr) return respond({ error: updateErr.message }, 500);

    return respond({ ok: true });
  } catch (e) {
    return respond({ error: (e as Error).message ?? 'internal error' }, 500);
  }
});
