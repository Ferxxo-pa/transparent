// Edge Function: retry-settlement
// Backend-authoritative retry for failed game settlement.
//
// The client CANNOT mutate settlement_status, pending_payouts, or
// paid_tx_signatures — RLS blocks all three. This function:
//   1. Verifies ed25519 signature from the HOST wallet
//   2. Atomically claims the retry (settlement_status 'failed' → 'retrying')
//   3. Skips already-paid recipients (by paid_tx_signatures)
//   4. Sends remaining payouts on-chain, recording each signature
//   5. Updates DB state after each successful send (crash-safe)
//   6. Returns final state with all signatures
//
// The client calls this instead of doing settlement writes directly.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from 'npm:@solana/web3.js@1.95.3';
import bs58 from 'npm:bs58@5.0.0';
import { verifyGameAuth, corsHeaders, jsonResponse, type GameAuthToken } from '../_shared/gameAuth.ts';

const DEFAULT_PROGRAM_ID = '2zPLNqsyqXNxaMkzWUMh1ZcbJBR3Jr2bTky1FFaZVuF9';
const DISTRIBUTE_DISCRIMINATOR = new Uint8Array([191, 44, 223, 207, 164, 236, 126, 61]);

interface RetryRequest {
  gameId: string;
  auth: GameAuthToken;
}

function loadSettlementKeypair(): Keypair {
  const raw = Deno.env.get('SETTLEMENT_SECRET_KEY');
  if (!raw) throw new Error('SETTLEMENT_SECRET_KEY not configured');
  const bytes = raw.trim().startsWith('[')
    ? Uint8Array.from(JSON.parse(raw) as number[])
    : bs58.decode(raw.trim());
  return Keypair.fromSecretKey(bytes);
}

function encodeU64LE(n: number): Uint8Array {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, BigInt(n), true);
  return buf;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { gameId, auth } = (await req.json()) as RetryRequest;
    if (!gameId || !auth) return jsonResponse({ error: 'gameId and auth required' }, 400);

    let wallet: string;
    try {
      wallet = verifyGameAuth(auth, gameId, { expectedAction: 'settle' }).wallet;
    } catch (e) {
      return jsonResponse({ error: `auth failed: ${(e as Error).message}` }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Atomically claim: only succeeds if settlement_status is currently 'failed'
    const { data: claimed, error: claimErr } = await supabase
      .from('games')
      .update({ settlement_status: 'retrying' })
      .eq('id', gameId)
      .eq('settlement_status', 'failed')
      .select('id, host_wallet, pending_payouts, paid_tx_signatures, room_code, game_pda')
      .single();

    if (claimErr || !claimed) {
      return jsonResponse({ error: 'retry claim failed — game is not in failed state or another retry is in progress' }, 409);
    }

    if (wallet !== claimed.host_wallet) {
      // Revert claim — wrong caller
      await supabase.from('games').update({ settlement_status: 'failed' }).eq('id', gameId);
      return jsonResponse({ error: 'only the host may retry settlement' }, 403);
    }

    const pendingPayouts: Record<string, number> = (claimed.pending_payouts as Record<string, number>) ?? {};
    const paidSignatures: Record<string, string> = (claimed.paid_tx_signatures as Record<string, string>) ?? {};

    // Remove already-paid recipients
    for (const paidWallet of Object.keys(paidSignatures)) {
      delete pendingPayouts[paidWallet];
    }

    if (Object.keys(pendingPayouts).length === 0) {
      await supabase.from('games').update({
        settlement_status: 'settled',
        pending_payouts: null,
      }).eq('id', gameId);
      return jsonResponse({ ok: true, settled: true, signatures: paidSignatures });
    }

    const rpcUrl = Deno.env.get('SOLANA_RPC') || 'https://api.devnet.solana.com';
    if (rpcUrl.includes('mainnet')) {
      await supabase.from('games').update({ settlement_status: 'failed' }).eq('id', gameId);
      return jsonResponse({ error: 'settlement is devnet-only' }, 500);
    }

    const programId = new PublicKey(Deno.env.get('ESCROW_PROGRAM_ID') || DEFAULT_PROGRAM_ID);
    const connection = new Connection(rpcUrl, 'confirmed');
    const settlementKeypair = loadSettlementKeypair();

    const hostPubkey = new PublicKey(claimed.host_wallet);
    const gamePDA = claimed.game_pda
      ? new PublicKey(claimed.game_pda)
      : PublicKey.findProgramAddressSync(
          [new TextEncoder().encode('game'), hostPubkey.toBytes(), new TextEncoder().encode(claimed.room_code)],
          programId,
        )[0];
    const [escrowPDA] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode('escrow'), gamePDA.toBytes()],
      programId,
    );

    const stillOwed = { ...pendingPayouts };

    for (const [recipient, lamports] of Object.entries(pendingPayouts)) {
      if (!Number.isInteger(lamports) || lamports <= 0) {
        delete stillOwed[recipient];
        continue;
      }

      try {
        const data = new Uint8Array(16);
        data.set(DISTRIBUTE_DISCRIMINATOR, 0);
        data.set(encodeU64LE(lamports), 8);

        const ix = new TransactionInstruction({
          programId,
          keys: [
            { pubkey: gamePDA, isSigner: false, isWritable: true },
            { pubkey: escrowPDA, isSigner: false, isWritable: true },
            { pubkey: new PublicKey(recipient), isSigner: false, isWritable: true },
            { pubkey: settlementKeypair.publicKey, isSigner: true, isWritable: false },
            { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
          ],
          data,
        });

        const tx = new Transaction().add(ix);
        tx.feePayer = settlementKeypair.publicKey;
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        tx.recentBlockhash = blockhash;
        tx.sign(settlementKeypair);

        const sig = await connection.sendRawTransaction(tx.serialize());
        await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

        delete stillOwed[recipient];
        paidSignatures[recipient] = sig;

        // Persist after EACH successful send — crash-safe progress
        await supabase.from('games').update({
          settlement_status: 'retrying',
          pending_payouts: Object.keys(stillOwed).length > 0 ? stillOwed : null,
          paid_tx_signatures: paidSignatures,
        }).eq('id', gameId);
      } catch (sendErr) {
        console.warn(`[retry-settlement] Failed to send to ${recipient}:`, sendErr);
      }
    }

    const settled = Object.keys(stillOwed).length === 0;
    await supabase.from('games').update({
      settlement_status: settled ? 'settled' : 'failed',
      pending_payouts: settled ? null : stillOwed,
      paid_tx_signatures: paidSignatures,
    }).eq('id', gameId);

    return jsonResponse({
      ok: true,
      settled,
      signatures: paidSignatures,
      ...(settled ? {} : { remaining: stillOwed }),
    });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message ?? 'internal error' }, 500);
  }
});
