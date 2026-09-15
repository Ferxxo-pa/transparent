// Edge Function: verify-payment
//
// The ONLY legitimate path that transitions a player's has_paid from false to
// true. join-game always inserts has_paid=false, ready-up-player refuses to
// ready a player who has not paid, and anon UPDATE of has_paid is blocked by
// RLS. Without this function nothing could ever mark a player paid.
//
// Payment is NEVER client-trusted: the caller submits the transaction
// signature of their buy-in, and this function independently confirms on-chain
// that a settled transaction moved at least buy_in_lamports into the game's
// escrow PDA, that the caller signed it, and that the signature has not already
// been credited. Only then does it call the mark_player_paid RPC (service_role).
//
// DEVNET ONLY: refuses to run against any mainnet RPC.
//
// Secrets (supabase secrets set):
//   SOLANA_RPC        — optional, defaults to devnet public RPC
//   ESCROW_PROGRAM_ID — optional, defaults to the deployed devnet program

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.95.3';
import bs58 from 'npm:bs58@5.0.0';
import {
  verifyGameAuth,
  corsHeaders,
  jsonResponse,
  type GameAuthToken,
} from '../_shared/gameAuth.ts';

const DEFAULT_PROGRAM_ID = '2zPLNqsyqXNxaMkzWUMh1ZcbJBR3Jr2bTky1FFaZVuF9';

interface VerifyPaymentRequest {
  gameId: string;
  auth: GameAuthToken;
  txSignature: string;
}

function statusForPgError(code?: string): number {
  switch (code) {
    case 'P0002': return 404;
    case 'P0001': return 409;
    default: return 500;
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: VerifyPaymentRequest = await req.json();
    const { gameId, auth, txSignature } = body;

    if (!gameId || !auth) {
      return jsonResponse({ error: 'missing gameId or auth' }, 400);
    }

    // Action-bound token so a general game token can't be repurposed here.
    const caller = verifyGameAuth(auth, gameId, { expectedAction: 'pay' });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: game, error: gameErr } = await supabase
      .from('games')
      .select('id, status, host_wallet, room_code, game_pda, buy_in_lamports')
      .eq('id', gameId)
      .single();

    if (gameErr || !game) {
      return jsonResponse({ error: 'game not found' }, 404);
    }
    if (game.status !== 'waiting') {
      return jsonResponse({ error: 'game already started' }, 409);
    }

    const buyIn = Number(game.buy_in_lamports ?? 0);

    // Free game: no payment to verify. Mark paid idempotently for consistency.
    if (buyIn <= 0) {
      const { data: player, error } = await supabase
        .rpc('mark_player_paid', { p_game_id: gameId, p_wallet: caller.wallet })
        .single();
      if (error) return jsonResponse({ error: error.message }, statusForPgError(error.code));
      return jsonResponse({ ok: true, player, free: true });
    }

    if (!txSignature || typeof txSignature !== 'string') {
      return jsonResponse({ error: 'txSignature required for paid games' }, 400);
    }

    // ── On-chain verification ──────────────────────────────────
    const rpcUrl = Deno.env.get('SOLANA_RPC') || 'https://api.devnet.solana.com';
    if (rpcUrl.includes('mainnet')) {
      return jsonResponse({ error: 'verify-payment is devnet-only' }, 500);
    }
    const programId = new PublicKey(Deno.env.get('ESCROW_PROGRAM_ID') || DEFAULT_PROGRAM_ID);
    const connection = new Connection(rpcUrl, 'confirmed');

    const hostPubkey = new PublicKey(game.host_wallet);
    const gamePDA = game.game_pda
      ? new PublicKey(game.game_pda)
      : PublicKey.findProgramAddressSync(
          [new TextEncoder().encode('game'), hostPubkey.toBytes(), new TextEncoder().encode(game.room_code)],
          programId,
        )[0];
    const [escrowPDA] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode('escrow'), gamePDA.toBytes()],
      programId,
    );

    const tx = await connection.getTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || !tx.meta) {
      return jsonResponse({ error: 'transaction not found or not yet confirmed' }, 404);
    }
    if (tx.meta.err) {
      return jsonResponse({ error: 'payment transaction failed on-chain' }, 402);
    }

    const accountKeys = tx.transaction.message
      .getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses })
      .staticAccountKeys.map((k) => k.toBase58())
      .concat(
        (tx.meta.loadedAddresses?.writable ?? []).map((k) => k.toBase58()),
        (tx.meta.loadedAddresses?.readonly ?? []).map((k) => k.toBase58()),
      );

    const callerIdx = accountKeys.indexOf(caller.wallet);
    const escrowIdx = accountKeys.indexOf(escrowPDA.toBase58());

    if (callerIdx === -1) {
      return jsonResponse({ error: 'caller wallet is not part of this transaction' }, 403);
    }
    // Caller must have signed (be a writable signer paying the buy-in).
    if (!tx.transaction.message.isAccountSigner(callerIdx)) {
      return jsonResponse({ error: 'caller did not sign the payment transaction' }, 403);
    }
    if (escrowIdx === -1) {
      return jsonResponse({ error: 'payment did not touch the game escrow' }, 402);
    }

    const escrowDelta =
      Number(tx.meta.postBalances[escrowIdx]) - Number(tx.meta.preBalances[escrowIdx]);
    if (escrowDelta < buyIn) {
      return jsonResponse(
        { error: `insufficient payment: escrow received ${escrowDelta}, need ${buyIn}` },
        402,
      );
    }

    // ── Dedup: a given payment tx can credit exactly one player once ──
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`payment:${gameId}:${txSignature}`),
    );
    const tokenHash = bs58.encode(new Uint8Array(digest));
    const { error: dedupErr } = await supabase
      .from('used_game_tokens')
      .insert({ token_hash: tokenHash, game_id: gameId, action: 'pay' });
    if (dedupErr) {
      if ((dedupErr as { code?: string }).code === '23505') {
        return jsonResponse({ error: 'payment already credited' }, 409);
      }
      return jsonResponse({ error: dedupErr.message }, 500);
    }

    const { data: player, error } = await supabase
      .rpc('mark_player_paid', { p_game_id: gameId, p_wallet: caller.wallet })
      .single();
    if (error) return jsonResponse({ error: error.message }, statusForPgError(error.code));

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
