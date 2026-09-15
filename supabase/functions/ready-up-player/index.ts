// Edge Function: ready-up-player
// Sets is_ready=true for the verified caller's own player row via the
// ready_up_player RPC, which performs the status guard, the payment guard
// (has_paid must be true for paid games), and the flip INSIDE one transaction
// (SELECT ... FOR UPDATE). Only the server can flip is_ready — anon UPDATE is
// blocked by RLS. has_paid is set only by verify-payment; it is never trusted
// from the client.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyGameAuth, corsHeaders, jsonResponse, type GameAuthToken } from '../_shared/gameAuth.ts';

interface ReadyUpRequest {
  gameId: string;
  auth: GameAuthToken;
}

function statusForPgError(code?: string): number {
  switch (code) {
    case 'P0002': return 404; // not found
    case 'P0001': return 409; // wrong game state
    case 'P0003': return 402; // payment required
    default: return 500;
  }
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

    const { data: player, error } = await supabase
      .rpc('ready_up_player', {
        p_game_id: gameId,
        p_wallet: caller.wallet,
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
