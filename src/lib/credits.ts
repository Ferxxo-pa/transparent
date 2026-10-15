import { SUPABASE_ANON_KEY, SUPABASE_FUNCTIONS_URL } from './config';

export interface ClaimResult {
  ok: boolean;
  alreadyClaimed?: boolean;
  granted?: number;
  balance?: number;
  card?: { id: string; serial: string; role: 'host' | 'player' };
  error?: string;
}

async function postFunction<T>(name: string, accessToken: string, body: unknown): Promise<T> {
  if (!SUPABASE_FUNCTIONS_URL) throw new Error('Card claim is not configured on this build');
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
      'x-privy-token': accessToken,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export function claimCard(cardToken: string, accessToken: string): Promise<ClaimResult> {
  return postFunction<ClaimResult>('claim-card', accessToken, { cardToken });
}

export async function fetchCreditsBalance(accessToken: string): Promise<number | null> {
  if (!SUPABASE_FUNCTIONS_URL) return null;
  try {
    const json = await postFunction<{ balance: number }>('credits-balance', accessToken, {});
    return json.balance;
  } catch {
    return null;
  }
}
