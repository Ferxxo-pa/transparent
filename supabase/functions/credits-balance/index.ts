// Read the signed-in user's off-chain credit balance. No transfer, no cash-out.
// Deploy after supabase/migrations/20261015_cards_and_credits.sql.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { jsonResponse, corsHeadersForRequest } from '../_shared/gameAuth.ts';
import { verifyPrivyAccessToken } from '../_shared/privyAuth.ts';

serve(async (req) => {
  const cors = corsHeadersForRequest(req);
  const respond = (body: unknown, status = 200) => jsonResponse(body, status, cors);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return respond({ error: 'method not allowed' }, 405);

  try {
    const appId = Deno.env.get('PRIVY_APP_ID') ?? '';
    const privyToken = req.headers.get('x-privy-token') ?? '';
    if (!appId || !privyToken) return respond({ error: 'log in to see credits' }, 401);

    let userId: string;
    try {
      userId = (await verifyPrivyAccessToken(privyToken, appId)).userId;
    } catch (e) {
      return respond({ error: `auth failed: ${(e as Error).message}` }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data, error } = await supabase.rpc('credits_balance_for', { p_user: userId });
    if (error) return respond({ error: 'credits storage is not ready' }, 503);
    return respond({
      balance: typeof data === 'number' ? data : Number(data ?? 0),
      transferable: false,
      cashOut: false,
    });
  } catch (err) {
    return respond({ error: (err as Error).message }, 500);
  }
});
