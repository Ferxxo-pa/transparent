// Supabase Edge Function: validated game settlement
//
// Settlement lifecycle:
//   1. Verify ed25519 HOST wallet signature (trust root)
//   2. Atomic claim: UPDATE ... WHERE settlement_status='none' RETURNING id
//      — exactly one caller proceeds; 0-row match = 409
//   3. For each recipient:
//      a. Build + sign tx
//      b. Persist sig as {sig, status:'submitted'} BEFORE broadcast
//      c. sendRawTransaction
//      d. confirmTransaction → update to 'confirmed'/'failed'/'unknown'
//      e. Persist after each recipient (crash-safe progress)
//   4. Final state: 'settled' or 'failed' with all sig records
//
// Signature statuses:
//   submitted — tx identity persisted, broadcast may or may not have happened
//   confirmed — on-chain confirmation received, no errors
//   failed    — on-chain confirmation shows value.err (program error, etc.)
//   unknown   — sendRawTransaction returned but confirmTransaction timed out
//
// DEVNET ONLY: refuses to run against any mainnet RPC.

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
import { verifyGameAuth, corsHeaders, jsonResponse, GameAuthToken } from '../_shared/gameAuth.ts';

const DEFAULT_PROGRAM_ID = '2zPLNqsyqXNxaMkzWUMh1ZcbJBR3Jr2bTky1FFaZVuF9';
// sha256("global:distribute")[0..8] — matches target/idl/transparent.json
const DISTRIBUTE_DISCRIMINATOR = new Uint8Array([191, 44, 223, 207, 164, 236, 126, 61]);

interface RequestBody {
  gameId: string;
  action: 'distribute' | 'settle_predictions';
  payouts?: Record<string, number>; // lamports per recipient wallet
  auth: GameAuthToken;
}

interface SigRecord {
  sig: string;
  status: 'submitted' | 'confirmed' | 'failed' | 'unknown';
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

function normalizeSigRecords(raw: unknown): Record<string, SigRecord> {
  const out: Record<string, SigRecord> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [wallet, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof val === 'string') {
      out[wallet] = { sig: val, status: 'unknown' };
    } else if (val && typeof val === 'object' && 'sig' in val) {
      out[wallet] = val as SigRecord;
    }
  }
  return out;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { gameId, action, payouts, auth } = (await req.json()) as RequestBody;
    if (!gameId || !action) return jsonResponse({ error: 'gameId and action required' }, 400);

    let wallet: string;
    try {
      wallet = verifyGameAuth(auth, gameId).wallet;
    } catch (e) {
      return jsonResponse({ error: `auth failed: ${(e as Error).message}` }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: game, error: gameErr } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();
    if (gameErr || !game) return jsonResponse({ error: 'game not found' }, 404);

    if (wallet !== game.host_wallet) {
      return jsonResponse({ error: 'only the host may settle the game' }, 403);
    }

    if (action === 'settle_predictions') {
      const { error } = await supabase
        .from('predictions')
        .update({ settled: true })
        .eq('game_id', gameId);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true });
    }

    // ── action === 'distribute' ──────────────────────────────

    if (game.status === 'gameover') {
      return jsonResponse({ error: 'game already settled' }, 409);
    }
    if (game.status === 'waiting') {
      return jsonResponse({ error: 'game has not started' }, 409);
    }
    if (!payouts || Object.keys(payouts).length === 0) {
      return jsonResponse({ error: 'payouts required' }, 400);
    }

    const { data: players, error: playersErr } = await supabase
      .from('players')
      .select('wallet_address')
      .eq('game_id', gameId);
    if (playersErr) return jsonResponse({ error: 'failed to load players' }, 500);
    const playerWallets = new Set((players ?? []).map((p) => p.wallet_address));
    for (const recipient of Object.keys(payouts)) {
      if (!playerWallets.has(recipient)) {
        return jsonResponse({ error: `payout recipient is not a player: ${recipient}` }, 403);
      }
    }

    const rpcUrl = Deno.env.get('SOLANA_RPC') || 'https://api.devnet.solana.com';
    if (rpcUrl.includes('mainnet')) {
      return jsonResponse({ error: 'settlement function is devnet-only' }, 500);
    }

    const programId = new PublicKey(Deno.env.get('ESCROW_PROGRAM_ID') || DEFAULT_PROGRAM_ID);
    const connection = new Connection(rpcUrl, 'confirmed');
    const settlementKeypair = loadSettlementKeypair();

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

    const validPayouts: Record<string, number> = {};
    for (const [recipient, lamports] of Object.entries(payouts)) {
      if (Number.isInteger(lamports) && lamports > 0) validPayouts[recipient] = lamports;
    }
    if (Object.keys(validPayouts).length === 0) {
      return jsonResponse({ error: 'no valid payouts' }, 400);
    }

    // ── ATOMIC CLAIM: .select().single() ensures exactly one caller proceeds ──
    // Do NOT reset paid_tx_signatures here — a manual status reset to 'none'
    // after a partial crash would lose already-sent sigs.
    const { data: claimData, error: claimErr } = await supabase.from('games').update({
      settlement_status: 'pending',
      pending_payouts: validPayouts,
    }).eq('id', gameId).eq('settlement_status', 'none').select('id').single();

    if (claimErr || !claimData) {
      return jsonResponse({ error: 'settlement already in progress or claimed' }, 409);
    }

    // Read any existing sigs (in case of a previous partial run that left state)
    const existingSigs = normalizeSigRecords(game.paid_tx_signatures);
    const sigRecords: Record<string, SigRecord> = { ...existingSigs };
    const stillOwed = { ...validPayouts };

    // Skip recipients already confirmed from a prior run
    for (const [wallet, record] of Object.entries(sigRecords)) {
      if (record.status === 'confirmed' && wallet in stillOwed) {
        delete stillOwed[wallet];
      }
    }

    for (const [recipient, lamports] of Object.entries(stillOwed)) {
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

        // ── PRE-BROADCAST PERSIST: write sig identity BEFORE sendRawTransaction ──
        const txSig = bs58.encode(tx.signature!);
        sigRecords[recipient] = { sig: txSig, status: 'submitted' };
        const { error: preErr } = await supabase.from('games').update({
          paid_tx_signatures: sigRecords,
        }).eq('id', gameId);
        if (preErr) {
          console.error(`[settle-game] Failed to persist pre-broadcast sig for ${recipient}:`, preErr);
          delete sigRecords[recipient];
          continue;
        }

        await connection.sendRawTransaction(tx.serialize());

        const confirmation = await connection.confirmTransaction(
          { signature: txSig, blockhash, lastValidBlockHeight }, 'confirmed',
        );

        if (confirmation.value.err) {
          console.warn(`[settle-game] On-chain tx to ${recipient} failed:`, confirmation.value.err, `sig=${txSig}`);
          sigRecords[recipient] = { sig: txSig, status: 'failed' };
          // Per-recipient persist so retry knows this sig failed
          await supabase.from('games').update({
            paid_tx_signatures: sigRecords,
          }).eq('id', gameId);
          continue;
        }

        sigRecords[recipient] = { sig: txSig, status: 'confirmed' };
        delete stillOwed[recipient];

        const { error: persistErr } = await supabase.from('games').update({
          settlement_status: 'pending',
          pending_payouts: Object.keys(stillOwed).length > 0 ? stillOwed : null,
          paid_tx_signatures: sigRecords,
        }).eq('id', gameId);

        if (persistErr) {
          console.error(`[settle-game] CRITICAL: chain send to ${recipient} succeeded (sig=${txSig}) but DB persist failed:`, persistErr);
          await supabase.from('games').update({
            settlement_status: 'failed',
            paid_tx_signatures: sigRecords,
          }).eq('id', gameId).catch(() => {});
          return jsonResponse({
            error: `Payout to ${recipient} confirmed on-chain (${txSig}) but DB update failed. Manual reconciliation needed.`,
            signatures: sigRecords,
            remaining: stillOwed,
          }, 500);
        }
      } catch (sendErr) {
        console.warn(`[settle-game] Failed to send to ${recipient}:`, sendErr);
        if (sigRecords[recipient]) {
          sigRecords[recipient].status = 'unknown';
          const { error: haltErr } = await supabase.from('games').update({
            settlement_status: 'failed',
            pending_payouts: stillOwed,
            paid_tx_signatures: sigRecords,
          }).eq('id', gameId);
          if (haltErr) {
            console.error(`[settle-game] CRITICAL: sig ${sigRecords[recipient].sig} for ${recipient} not persisted to DB`);
          }
          return jsonResponse({
            error: `Transaction to ${recipient} sent but confirmation timed out (sig=${sigRecords[recipient].sig}). Verify on-chain before retrying.`,
            signatures: sigRecords,
            remaining: stillOwed,
            dbPersisted: !haltErr,
          }, 500);
        }
      }
    }

    const settled = Object.keys(stillOwed).length === 0;
    const { error: finalErr } = await supabase.from('games').update({
      status: settled ? 'gameover' : game.status,
      settlement_status: settled ? 'settled' : 'failed',
      pending_payouts: settled ? null : stillOwed,
      paid_tx_signatures: sigRecords,
    }).eq('id', gameId);

    if (finalErr) {
      console.error('[settle-game] Final DB update failed:', finalErr);
      return jsonResponse({
        error: 'Settlement payouts sent but final DB update failed. Manual reconciliation needed.',
        signatures: sigRecords,
        remaining: settled ? undefined : stillOwed,
      }, 500);
    }

    return jsonResponse({
      ok: true,
      settled,
      signatures: sigRecords,
      ...(settled ? {} : { remaining: stillOwed }),
    });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message ?? 'internal error' }, 500);
  }
});
