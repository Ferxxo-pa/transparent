// Supabase Edge Function: validated game settlement
//
// The client never settles by itself in hardened mode. The host requests
// settlement here; this function:
//   1. verifies an ed25519 signature from the HOST wallet (trust root)
//   2. validates game state (exists, active, payout recipients are players)
//   3. triggers on-chain `distribute` from the escrow PDA, signed by the
//      SETTLEMENT keypair (which the program accepts as the game's
//      settlement_authority — it can only pay out, never mutate the game)
//   4. marks the game settled in the DB with the service role
//
// DEVNET ONLY: refuses to run against any mainnet RPC.
//
// Secrets (supabase secrets set):
//   SETTLEMENT_SECRET_KEY — base58 or JSON-array ed25519 secret key (devnet!)
//   SOLANA_RPC            — optional, defaults to devnet public RPC
//   ESCROW_PROGRAM_ID     — optional, defaults to the deployed devnet program
//
// Deploy: supabase functions deploy settle-game

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

    // Settlement is HOST-only. This is the core authority check.
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

    // Every recipient must be a player in this game.
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

    // Game PDA: stored at creation, or derived from host + room_code.
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

    // The escrow program independently enforces: game status, settlement
    // authority match, and total_pot limits. This function cannot overdraw.
    const signatures: string[] = [];
    for (const [recipient, lamports] of Object.entries(payouts)) {
      if (!Number.isInteger(lamports) || lamports <= 0) continue;

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
      signatures.push(sig);
    }

    if (signatures.length === 0) {
      return jsonResponse({ error: 'no valid payouts' }, 400);
    }

    const { error: updateErr } = await supabase
      .from('games')
      .update({ status: 'gameover' })
      .eq('id', gameId);
    if (updateErr) return jsonResponse({ error: updateErr.message }, 500);

    return jsonResponse({ ok: true, signatures });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message ?? 'internal error' }, 500);
  }
});
