// Edge Function: join-game
// Signed player join — verifies wallet ownership via ed25519, then calls the
// join_game_player RPC which inserts the player with has_paid=false,
// is_ready=false (server-only state) INSIDE the same transaction that checks
// game.status='waiting' (SELECT ... FOR UPDATE). On reconnect/replay the RPC
// returns the EXISTING row via ON CONFLICT DO NOTHING — it never resets a
// player's paid/ready state back to false.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyGameAuth, corsHeaders, jsonResponse, type GameAuthToken } from '../_shared/gameAuth.ts';

interface JoinRequest {
  gameId: string;
  displayName?: string;
  auth: GameAuthToken;
}

// Map RPC-raised SQLSTATE codes to HTTP statuses.
function statusForPgError(code?: string): number {
  switch (code) {
    case 'P0002': return 404; // not found
    case 'P0001': return 409; // wrong game state
    default: return 500;
  }
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

    const walletShort = `${caller.wallet.slice(0, 4)}...${caller.wallet.slice(-4)}`;
    const name = displayName?.trim() || walletShort;

    const { data: player, error } = await supabase
      .rpc('join_game_player', {
        p_game_id: gameId,
        p_wallet: caller.wallet,
        p_display_name: name,
      })
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, statusForPgError(error.code));
    }

    return jsonResponse({ ok: true, player });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'internal error';
    const status =
      msg.includes('expired') || msg.includes('signature') || msg.includes('mismatch') ||
      msg.includes('lifetime') || msg.includes('action') || msg.includes('future')
        ? 401
        : 500;
    return jsonResponse({ error: msg }, status);
  }
});
