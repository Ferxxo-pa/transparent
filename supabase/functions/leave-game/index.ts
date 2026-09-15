// Edge Function: leave-game
// Verified player leave — only the wallet owner can remove their own row.
// Only allowed during 'waiting' status. Host leave cancels the game.
// Anon DELETE is fully blocked by RLS after the lockdown migration.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyGameAuth, corsHeaders, jsonResponse, type GameAuthToken } from '../_shared/gameAuth.ts';

interface LeaveRequest {
  gameId: string;
  auth: GameAuthToken;
  targetWallet?: string; // host can remove another player (approve-leave flow)
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: LeaveRequest = await req.json();
    const { gameId, auth, targetWallet } = body;

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
      .select('id, status, host_wallet')
      .eq('id', gameId)
      .single();

    if (gameErr || !game) {
      return jsonResponse({ error: 'game not found' }, 404);
    }
    if (game.status !== 'waiting') {
      return jsonResponse({ error: 'can only leave a game that is still waiting' }, 409);
    }

    // Determine who is being removed
    const walletToRemove = targetWallet || caller.wallet;

    // If removing someone else, caller must be the host (approve-leave flow)
    if (targetWallet && targetWallet !== caller.wallet) {
      if (caller.wallet !== game.host_wallet) {
        return jsonResponse({ error: 'only the host can remove other players' }, 403);
      }
    }

    const { data: player, error: playerErr } = await supabase
      .from('players')
      .select('id, wallet_address')
      .eq('game_id', gameId)
      .eq('wallet_address', walletToRemove)
      .single();

    if (playerErr || !player) {
      return jsonResponse({ error: 'player not found in this game' }, 404);
    }

    const { error: deleteErr } = await supabase
      .from('players')
      .delete()
      .eq('game_id', gameId)
      .eq('wallet_address', walletToRemove);

    if (deleteErr) {
      return jsonResponse({ error: deleteErr.message }, 500);
    }

    // If the caller (not target) is the host AND they're leaving themselves, cancel
    const isHost = caller.wallet === game.host_wallet && walletToRemove === caller.wallet;
    if (isHost) {
      await supabase
        .from('games')
        .update({ status: 'cancelled' })
        .eq('id', gameId);
    }

    return jsonResponse({ ok: true, hostLeft: isHost });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'internal error';
    const status = msg.includes('expired') || msg.includes('signature') || msg.includes('mismatch') ? 401 : 500;
    return jsonResponse({ error: msg }, status);
  }
});
