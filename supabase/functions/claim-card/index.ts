// Claim one NFC card for the signed-in Privy user.
// Deploy only after supabase/migrations/20261015_cards_and_credits.sql.
// Secrets: CARD_SIGNING_SECRET, PRIVY_APP_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// ALLOWED_ORIGINS (optional) locks browser CORS. Never '*'.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { jsonResponse, corsHeadersForRequest } from '../_shared/gameAuth.ts';
import { verifyPrivyAccessToken } from '../_shared/privyAuth.ts';
import {
  parseCardToken,
  verifyCardSignature,
  decideClaim,
  STARTER_CREDITS,
  CardRole,
} from '../_shared/cards.ts';

const USER_LIMIT = 8;
const IP_LIMIT = 30;

interface CardRow {
  id: string;
  serial: string;
  role: CardRole;
  claimed_at: string | null;
  claimed_by: string | null;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd || 'unknown';
}

async function bumpRate(
  supabase: SupabaseClient,
  bucketKey: string,
  minuteBucket: number,
): Promise<number | null> {
  const { data, error } = await supabase.rpc('increment_card_claim_rate', {
    p_bucket_key: bucketKey,
    p_minute_bucket: minuteBucket,
  });
  if (error) return null;
  return typeof data === 'number' ? data : Number(data);
}

async function balanceFor(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase.rpc('credits_balance_for', { p_user: userId });
  if (error) throw new Error('balance lookup failed');
  return typeof data === 'number' ? data : Number(data ?? 0);
}

async function ensureGrant(supabase: SupabaseClient, userId: string, cardId: string, credits: number) {
  if (credits <= 0) return;
  const { error } = await supabase.from('credits_ledger').insert({
    user_id: userId,
    delta: credits,
    reason: 'card_claim',
    card_id: cardId,
    idempotency_key: `card_claim:${cardId}`,
  });
  if (error && !/duplicate|unique/i.test(error.message)) {
    throw new Error('credit grant failed');
  }
}

serve(async (req) => {
  const cors = corsHeadersForRequest(req);
  const respond = (body: unknown, status = 200) => jsonResponse(body, status, cors);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return respond({ error: 'method not allowed' }, 405);

  try {
    const secret = Deno.env.get('CARD_SIGNING_SECRET') ?? '';
    const appId = Deno.env.get('PRIVY_APP_ID') ?? '';
    if (!secret || !appId) return respond({ error: 'card claim is not configured' }, 503);

    const privyToken = req.headers.get('x-privy-token') ?? '';
    if (!privyToken) return respond({ error: 'log in to claim this card' }, 401);

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

    const minuteBucket = Math.floor(Date.now() / 60000);
    const userCount = await bumpRate(supabase, `user:${userId}`, minuteBucket);
    const ipCount = await bumpRate(supabase, `ip:${clientIp(req)}`, minuteBucket);
    if (userCount === null || ipCount === null) {
      return respond({ error: 'card claim storage is not ready' }, 503);
    }
    if (userCount > USER_LIMIT || ipCount > IP_LIMIT) {
      return respond({ error: 'too many claim attempts — try again in a minute' }, 429);
    }

    const body = (await req.json().catch(() => ({}))) as { cardToken?: string };
    const parsed = parseCardToken(body.cardToken ?? '');
    if (!parsed) return respond({ error: 'this card link is not valid' }, 400);

    const { data: card, error: cardErr } = await supabase
      .from('cards')
      .select('id, serial, role, claimed_at, claimed_by')
      .eq('id', parsed.id)
      .maybeSingle();
    if (cardErr) return respond({ error: 'card claim storage is not ready' }, 503);
    if (!card) return respond({ error: 'this card link is not valid' }, 400);

    const row = card as CardRow;
    const signatureOk = await verifyCardSignature(
      { id: row.id, serial: row.serial, role: row.role },
      parsed.signature,
      secret,
    );
    if (!signatureOk) return respond({ error: 'this card link is not valid' }, 400);

    const decision = decideClaim(row, userId);
    if (decision.action === 'conflict') {
      return respond({ error: 'this card has already been claimed' }, 409);
    }

    let granted = 0;
    if (decision.action === 'grant') {
      const { data: updated, error: updateErr } = await supabase
        .from('cards')
        .update({ claimed_by: userId, claimed_at: new Date().toISOString() })
        .eq('id', row.id)
        .is('claimed_at', null)
        .select('id, role')
        .maybeSingle();
      if (updateErr) return respond({ error: 'could not claim this card' }, 500);
      if (!updated) {
        const { data: latest } = await supabase
          .from('cards')
          .select('claimed_by')
          .eq('id', row.id)
          .maybeSingle();
        if (latest?.claimed_by === userId) {
          granted = 0;
        } else {
          return respond({ error: 'this card has already been claimed' }, 409);
        }
      } else {
        granted = decision.credits;
        await ensureGrant(supabase, userId, row.id, granted);
      }
    } else if (row.role === 'player') {
      // Replay after a crash between the claim update and the ledger insert.
      const { count } = await supabase
        .from('credits_ledger')
        .select('id', { count: 'exact', head: true })
        .eq('idempotency_key', `card_claim:${row.id}`);
      if (!count) await ensureGrant(supabase, userId, row.id, STARTER_CREDITS);
    }

    const balance = await balanceFor(supabase, userId);
    return respond({
      ok: true,
      alreadyClaimed: decision.action === 'replay',
      granted,
      balance,
      card: { id: row.id, serial: row.serial, role: row.role },
    });
  } catch (err) {
    console.error('claim-card', (err as Error).message);
    return respond({ error: 'could not claim this card' }, 500);
  }
});
