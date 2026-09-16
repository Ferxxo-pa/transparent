// Edge Function: retry-settlement
// Backend-authoritative retry for failed game settlement.
//
// Signature reconciliation: before re-sending, unknown/submitted sigs are
// checked on-chain via getSignatureStatuses. Recipients with a confirmed
// sig are dropped entirely (already paid). Recipients whose sig is still
// unknown/submitted after the on-chain check are left un-sent for this
// run (never resent — status unresolved means we can't rule out that the
// prior attempt already landed) but do NOT block other recipients who
// have a definite 'failed' sig or no sig at all from being retried.
//
// Setup code (keypair, PDA derivation) runs inside try/catch AFTER the
// atomic claim. If setup throws, status reverts to 'failed' so the game
// is never permanently stuck in 'retrying'.
//
// Crash-lease reclaim: the atomic claim below flips 'failed' -> 'retrying'
// and only reverts on a thrown error. If the process is instead killed
// (terminated, not thrown) mid-run, the row stays at 'retrying' forever —
// the client can never re-trigger retry since it requires 'failed'. Before
// rejecting a non-'failed' status, we check for a 'retrying' row whose
// `updated_at` is older than LEASE_TIMEOUT_MS and reclaim it back to
// 'failed'. The reclaim UPDATE only ever touches settlement_status +
// lease_reclaimed_at, so any signatures a crashed run already persisted
// are never overwritten.

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

// A live retry run persists a sig update (pre-broadcast, per-recipient) at
// least every few seconds; 5 minutes of silence means the process holding
// the lease is dead, not just slow.
const LEASE_TIMEOUT_MS = 5 * 60 * 1000;

interface RetryRequest {
  gameId: string;
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

    // ── Auth BEFORE mutation: reject unauthorized callers without touching DB ──
    const { data: game, error: lookupErr } = await supabase
      .from('games')
      .select('host_wallet, settlement_status, updated_at')
      .eq('id', gameId)
      .single();

    if (lookupErr || !game) {
      return jsonResponse({ error: 'game not found' }, 404);
    }
    if (wallet !== game.host_wallet) {
      return jsonResponse({ error: 'only the host may retry settlement' }, 403);
    }

    // ── Stale crash-lease reclaim ──────────────────────────────────
    // A 'retrying' row past LEASE_TIMEOUT_MS means the process that
    // claimed it is dead. Reclaim it to 'failed' so the normal retry
    // flow below can run. This UPDATE only sets settlement_status +
    // lease_reclaimed_at — paid_tx_signatures and pending_payouts are
    // never touched, so signatures already persisted by the dead run
    // are preserved exactly as-is.
    let effectiveStatus = game.settlement_status;
    if (effectiveStatus === 'retrying') {
      const leaseAgeMs = Date.now() - new Date(game.updated_at).getTime();
      if (leaseAgeMs > LEASE_TIMEOUT_MS) {
        const staleThreshold = new Date(Date.now() - LEASE_TIMEOUT_MS).toISOString();
        const { data: reclaimed, error: reclaimErr } = await supabase
          .from('games')
          .update({ settlement_status: 'failed', lease_reclaimed_at: new Date().toISOString() })
          .eq('id', gameId)
          .eq('settlement_status', 'retrying')
          .lt('updated_at', staleThreshold)
          .select('id')
          .single();
        // 0-row match means either the lease was already reclaimed/claimed
        // by a concurrent caller, or a live process just touched it —
        // either way, fall through to the normal 409 below.
        if (!reclaimErr && reclaimed) {
          effectiveStatus = 'failed';
        }
      }
    }

    if (effectiveStatus !== 'failed') {
      return jsonResponse({ error: 'retry claim failed — game is not in failed state or another retry is in progress' }, 409);
    }

    // ── Atomic claim: .select().single() — 0-row match = 409 ──
    const { data: claimed, error: claimErr } = await supabase
      .from('games')
      .update({ settlement_status: 'retrying' })
      .eq('id', gameId)
      .eq('settlement_status', 'failed')
      .select('id, host_wallet, pending_payouts, paid_tx_signatures, room_code, game_pda')
      .single();

    if (claimErr || !claimed) {
      return jsonResponse({ error: 'retry claim failed — concurrent retry or state changed' }, 409);
    }

    // ── Setup inside try/catch: revert to 'failed' if anything throws ──
    let connection: Connection;
    let settlementKeypair: Keypair;
    let gamePDA: PublicKey;
    let escrowPDA: PublicKey;
    let programId: PublicKey;

    try {
      const rpcUrl = Deno.env.get('SOLANA_RPC') || 'https://api.devnet.solana.com';
      if (rpcUrl.includes('mainnet')) {
        await supabase.from('games').update({ settlement_status: 'failed' }).eq('id', gameId);
        return jsonResponse({ error: 'settlement is devnet-only' }, 500);
      }

      programId = new PublicKey(Deno.env.get('ESCROW_PROGRAM_ID') || DEFAULT_PROGRAM_ID);
      connection = new Connection(rpcUrl, 'confirmed');
      settlementKeypair = loadSettlementKeypair();

      const hostPubkey = new PublicKey(claimed.host_wallet);
      gamePDA = claimed.game_pda
        ? new PublicKey(claimed.game_pda)
        : PublicKey.findProgramAddressSync(
            [new TextEncoder().encode('game'), hostPubkey.toBytes(), new TextEncoder().encode(claimed.room_code)],
            programId,
          )[0];
      [escrowPDA] = PublicKey.findProgramAddressSync(
        [new TextEncoder().encode('escrow'), gamePDA.toBytes()],
        programId,
      );
    } catch (setupErr) {
      console.error('[retry-settlement] Setup failed after claiming retrying:', setupErr);
      await supabase.from('games').update({ settlement_status: 'failed' }).eq('id', gameId);
      return jsonResponse({ error: `Setup failed: ${(setupErr as Error).message}` }, 500);
    }

    const pendingPayouts: Record<string, number> = (claimed.pending_payouts as Record<string, number>) ?? {};
    const sigRecords = normalizeSigRecords(claimed.paid_tx_signatures);

    // ── Reconcile unknown/submitted sigs on-chain before deciding who to skip ──
    // Never-resend-unknown rule: a recipient whose sig is still unresolved
    // after this check may already have been paid by a prior run — treat
    // it as potentially sent and never resend, but do NOT let it block
    // OTHER recipients (definite 'failed' sig, or no sig at all) from
    // being retried in this same call.
    const unresolvedEntries = Object.entries(sigRecords).filter(
      ([_, r]) => r.status === 'unknown' || r.status === 'submitted',
    );
    const doNotResend = new Set<string>();
    if (unresolvedEntries.length > 0) {
      try {
        const sigStrings = unresolvedEntries.map(([_, r]) => r.sig);
        const statuses = await connection.getSignatureStatuses(sigStrings);

        unresolvedEntries.forEach(([w, record], i) => {
          const status = statuses.value[i];
          if (status && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) {
            record.status = status.err ? 'failed' : 'confirmed';
          } else {
            // Still unknown after the on-chain check — may have landed.
            doNotResend.add(w);
          }
        });

        // Persist reconciled sig statuses
        await supabase.from('games').update({ paid_tx_signatures: sigRecords }).eq('id', gameId);
      } catch (reconcileErr) {
        console.error('[retry-settlement] On-chain reconciliation failed:', reconcileErr);
        // Could not verify any of these — never resend any of them this run.
        for (const [w] of unresolvedEntries) doNotResend.add(w);
      }
    }

    // Confirmed recipients are fully paid — drop from owed entirely.
    for (const [w, record] of Object.entries(sigRecords)) {
      if (record.status === 'confirmed') {
        delete pendingPayouts[w];
      }
    }
    // NOTE: doNotResend wallets are deliberately left IN pendingPayouts —
    // they stay "owed" for bookkeeping (so the game is never marked
    // 'settled' while their outcome is unknown) even though the send loop
    // below skips them.

    if (Object.keys(pendingPayouts).length === 0) {
      const { error: finalErr } = await supabase.from('games').update({
        settlement_status: 'settled',
        pending_payouts: null,
        paid_tx_signatures: sigRecords,
      }).eq('id', gameId);
      if (finalErr) {
        console.error('[retry-settlement] Empty-pending final update failed:', finalErr);
        return jsonResponse({
          error: 'All payouts confirmed but DB update to settled failed. Manual reconciliation needed.',
          signatures: sigRecords,
        }, 500);
      }
      return jsonResponse({ ok: true, settled: true, signatures: sigRecords });
    }

    const stillOwed = { ...pendingPayouts };

    for (const [recipient, lamports] of Object.entries(pendingPayouts)) {
      if (doNotResend.has(recipient)) {
        // Never resend — prior outcome is still unknown after on-chain
        // reconciliation. Leave it in stillOwed for manual review.
        continue;
      }
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

        // ── Pre-broadcast persist ──
        const txSig = bs58.encode(tx.signature!);
        sigRecords[recipient] = { sig: txSig, status: 'submitted' };
        const { error: preErr } = await supabase.from('games').update({
          paid_tx_signatures: sigRecords,
        }).eq('id', gameId);
        if (preErr) {
          console.error(`[retry-settlement] Failed to persist pre-broadcast sig for ${recipient}:`, preErr);
          delete sigRecords[recipient];
          continue;
        }

        await connection.sendRawTransaction(tx.serialize());

        const confirmation = await connection.confirmTransaction(
          { signature: txSig, blockhash, lastValidBlockHeight }, 'confirmed',
        );

        if (confirmation.value.err) {
          console.warn(`[retry-settlement] On-chain tx to ${recipient} failed:`, confirmation.value.err, `sig=${txSig}`);
          sigRecords[recipient] = { sig: txSig, status: 'failed' };
          await supabase.from('games').update({ paid_tx_signatures: sigRecords }).eq('id', gameId);
          continue;
        }

        sigRecords[recipient] = { sig: txSig, status: 'confirmed' };
        delete stillOwed[recipient];

        const { error: persistErr } = await supabase.from('games').update({
          settlement_status: 'retrying',
          pending_payouts: Object.keys(stillOwed).length > 0 ? stillOwed : null,
          paid_tx_signatures: sigRecords,
        }).eq('id', gameId);

        if (persistErr) {
          console.error(`[retry-settlement] CRITICAL: chain send to ${recipient} succeeded (sig=${txSig}) but DB persist failed:`, persistErr);
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
        console.warn(`[retry-settlement] Failed to send to ${recipient}:`, sendErr);
        if (sigRecords[recipient]) {
          sigRecords[recipient].status = 'unknown';
          const { error: crashErr } = await supabase.from('games').update({
            settlement_status: 'failed',
            pending_payouts: stillOwed,
            paid_tx_signatures: sigRecords,
          }).eq('id', gameId);
          if (crashErr) {
            console.error(`[retry-settlement] CRITICAL: sig ${sigRecords[recipient].sig} for ${recipient} recorded but DB persist failed`);
          }
          return jsonResponse({
            error: `Transaction to ${recipient} sent but confirmation timed out (sig=${sigRecords[recipient].sig}). Verify on-chain before retrying.`,
            signatures: sigRecords,
            remaining: stillOwed,
          }, 500);
        }
      }
    }

    const settled = Object.keys(stillOwed).length === 0;
    const { error: finalErr } = await supabase.from('games').update({
      settlement_status: settled ? 'settled' : 'failed',
      pending_payouts: settled ? null : stillOwed,
      paid_tx_signatures: sigRecords,
    }).eq('id', gameId);

    if (finalErr) {
      console.error('[retry-settlement] Final DB update failed:', finalErr);
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
