// Edge Function: leave-game
// Verified player leave — only the wallet owner can remove their own row; the
// host can remove another player (approve-leave / kick flow). Destructive, so:
//   - requires an action-scoped ('leave') v2 auth token (action binding)
//   - the token is single-use (replay guard via used_game_tokens)
//   - the delete AND the host-cancellation happen atomically in the
//     leave_game_player RPC. If cancellation fails, the delete rolls back and
//     this function never reports a partial "host left" success.
// Anon DELETE is fully blocked by RLS after the lockdown migration.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  verifyGameAuth,
  consumeAuthToken,
  corsHeaders,
  jsonResponse,
  type GameAuthToken,
} from '../_shared/gameAuth.ts';

interface LeaveRequest {
  gameId: string;
  auth: GameAuthToken;
  targetWallet?: string; // host can remove another player (approve-leave flow)
}

function statusForPgError(code?: string): number {
  switch (code) {
    case 'P0002': return 404; // not found
    case 'P0001': return 409; // wrong game state
    case 'P0004': return 403; // not authorized to remove another player
    default: return 500;
  }
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

    // Destructive action: require an action-bound token.
    const caller = verifyGameAuth(auth, gameId, { expectedAction: 'leave' });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Single-use: reject a replayed leave token before mutating anything.
    await consumeAuthToken(supabase, caller, gameId, 'leave');

    const { data: hostLeft, error } = await supabase.rpc('leave_game_player', {
      p_game_id: gameId,
      p_caller: caller.wallet,
      p_target: targetWallet ?? null,
    });

    if (error) {
      return jsonResponse({ error: error.message }, statusForPgError(error.code));
    }

    return jsonResponse({ ok: true, hostLeft: hostLeft === true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'internal error';
    const status =
      msg.includes('expired') || msg.includes('signature') || msg.includes('mismatch') ||
      msg.includes('lifetime') || msg.includes('action') || msg.includes('future') ||
      msg.includes('replay')
        ? 401
        : 500;
    return jsonResponse({ error: msg }, status);
  }
});
