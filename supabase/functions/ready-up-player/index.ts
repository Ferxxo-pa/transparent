// Edge Function: ready-up-player
// Sets is_ready=true for the verified caller's own player row.
// Only the server (this function) can flip is_ready — anon UPDATE is blocked.
// Payment verification: the caller must already have has_paid=true (set by
// the payment confirmation flow) before they can ready up. For free games
// (buy_in_lamports=0), has_paid is irrelevant and skipped.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyGameAuth, corsHeaders, jsonResponse, type GameAuthToken } from '../_shared/gameAuth.ts';

interface ReadyUpRequest {
  gameId: string;
  auth: GameAuthToken;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: ReadyUpRequest = await req.json();
    const { gameId, auth } = body;

    if (!gameId || !auth) {
      return jsonResponse({ error: 'missing gameId or auth' }, 400);
    }

    const caller = verifyGameAuth(auth, gameId);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: game, error: gameErr } = await supabase
      .from('games')
      .select('id, status, buy_in_lamports')
      .eq('id', gameId)
      .single();

    if (gameErr || !game) {
      return jsonResponse({ error: 'game not found' }, 404);
    }
    if (game.status !== 'waiting') {
      return jsonResponse({ error: 'game already started' }, 409);
    }

    const { data: player, error: playerErr } = await supabase
      .from('players')
      .select('id, wallet_address, has_paid, is_ready')
      .eq('game_id', gameId)
      .eq('wallet_address', caller.wallet)
      .single();

    if (playerErr || !player) {
      return jsonResponse({ error: 'player not found in this game' }, 404);
    }

    if (player.is_ready) {
      return jsonResponse({ ok: true, already: true });
    }

    // For paid games, require payment confirmation before ready-up.
    // has_paid is set by the payment confirmation flow (separate from this EF).
    if ((game.buy_in_lamports ?? 0) > 0 && !player.has_paid) {
      return jsonResponse({ error: 'payment required before ready-up' }, 402);
    }

    const { error: updateErr } = await supabase
      .from('players')
      .update({ is_ready: true })
      .eq('game_id', gameId)
      .eq('wallet_address', caller.wallet);

    if (updateErr) {
      return jsonResponse({ error: updateErr.message }, 500);
    }

    return jsonResponse({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'internal error';
    const status = msg.includes('expired') || msg.includes('signature') || msg.includes('mismatch') ? 401 : 500;
    return jsonResponse({ error: msg }, status);
  }
});
