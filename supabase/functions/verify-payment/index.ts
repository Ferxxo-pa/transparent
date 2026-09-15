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
// escrow PDA, that the caller signed AND funded it (per-player deposit
// attribution), and that the signature has not already been credited. Dedup and
// credit happen atomically via claim_payment_and_credit RPC — a transient
// credit failure never permanently consumes the payment signature.
//
// DEVNET ONLY: verified by genesis hash, not URL substring.
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
    const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
    const rpcUrl = Deno.env.get('SOLANA_RPC') || 'https://api.devnet.solana.com';
    const programId = new PublicKey(Deno.env.get('ESCROW_PROGRAM_ID') || DEFAULT_PROGRAM_ID);
    const connection = new Connection(rpcUrl, 'confirmed');

    const genesisHash = await connection.getGenesisHash();
    if (genesisHash !== DEVNET_GENESIS) {
      return jsonResponse(
        { error: `verify-payment is devnet-only: connected network genesis ${genesisHash} is not devnet` },
        500,
      );
    }

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

    // Per-player deposit attribution via program instruction validation.
    // Aggregate balance-decrease is not authoritative: an unrelated outgoing
    // transfer can coincide with someone else funding escrow. Instead, verify
    // the transaction contains an instruction to the escrow program where the
    // caller is a signer account (depositor) and the escrow PDA is a writable
    // destination. This proves the caller routed funds through the escrow
    // program for this specific game.
    const programIdStr = programId.toBase58();
    const escrowStr = escrowPDA.toBase58();
    const callerStr = caller.wallet;

    const compiledIxs = tx.transaction.message.compiledInstructions
      ?? (tx.transaction.message as any).instructions
      ?? [];

    let callerDepositInstruction = false;
    for (const ix of compiledIxs) {
      const ixProgramIdx = ix.programIdIndex;
      if (accountKeys[ixProgramIdx] !== programIdStr) continue;

      const ixAccountIndices: number[] = ix.accountKeyIndexes ?? ix.accounts ?? [];
      const ixAccounts = ixAccountIndices.map((i: number) => accountKeys[i]);

      const hasCallerAsSigner = ixAccounts.includes(callerStr)
        && tx.transaction.message.isAccountSigner(
          ixAccountIndices[ixAccounts.indexOf(callerStr)],
        );
      const hasEscrow = ixAccounts.includes(escrowStr);

      if (hasCallerAsSigner && hasEscrow) {
        callerDepositInstruction = true;
        break;
      }
    }

    if (!callerDepositInstruction) {
      return jsonResponse(
        { error: 'no escrow program instruction with caller as signer and escrow as destination' },
        402,
      );
    }

    // ── Atomic dedup + credit: one DB transaction, no lost payments ──
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`payment:${gameId}:${txSignature}`),
    );
    const tokenHash = bs58.encode(new Uint8Array(digest));

    const { data: player, error } = await supabase
      .rpc('claim_payment_and_credit', {
        p_game_id: gameId,
        p_wallet: caller.wallet,
        p_token_hash: tokenHash,
      })
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
