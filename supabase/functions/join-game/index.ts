// Edge Function: join-game
// Signed player join — verifies wallet ownership via ed25519, inserts player
// with has_paid=false, is_ready=false (server-only state). Prevents forged
// paid/ready state and arbitrary-wallet impersonation.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyGameAuth, corsHeaders, jsonResponse, type GameAuthToken } from '../_shared/gameAuth.ts';

interface JoinRequest {
  gameId: string;
  displayName?: string;
  auth: GameAuthToken;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: JoinRequest = await req.json();
    const { gameId, displayName, auth } = body;

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
      .select('id, status')
      .eq('id', gameId)
      .single();

    if (gameErr || !game) {
      return jsonResponse({ error: 'game not found' }, 404);
    }
    if (game.status !== 'waiting') {
      return jsonResponse({ error: 'game already started' }, 409);
    }

    const walletShort = `${caller.wallet.slice(0, 4)}...${caller.wallet.slice(-4)}`;
    const name = displayName?.trim() || walletShort;

    const { data: player, error: insertErr } = await supabase
      .from('players')
      .upsert(
        {
          game_id: gameId,
          wallet_address: caller.wallet,
          display_name: name,
          has_paid: false,
          is_ready: false,
        },
        { onConflict: 'game_id,wallet_address', ignoreDuplicates: false },
      )
      .select()
      .single();

    if (insertErr) {
      return jsonResponse({ error: insertErr.message }, 500);
    }

    return jsonResponse({ ok: true, player });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'internal error';
    const status = msg.includes('expired') || msg.includes('signature') || msg.includes('mismatch') ? 401 : 500;
    return jsonResponse({ error: msg }, status);
  }
});
