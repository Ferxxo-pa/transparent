# Escrow Migration Guide

## Overview

Move from host-holds-pot (current) to PDA-escrow (trustless).

**Before:** Player → SOL → Host wallet → Host distributes manually
**After:** Player → SOL → Escrow PDA → Program distributes based on rules

## Step 1: Deploy the Anchor Program

```bash
# Install Anchor if needed
cargo install --git https://github.com/coral-xyz/anchor anchor-cli

# Build
cd programs/transparent
anchor build

# Get the program ID
solana-keygen pubkey target/deploy/transparent-keypair.json

# Update the program ID in:
# - programs/transparent/src/lib.rs (declare_id!)
# - Anchor.toml ([programs.devnet])
# - src/lib/anchor-escrow.ts (PROGRAM_ID)

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

## Step 2: Generate Real Discriminators

After building, the IDL is at `target/idl/transparent.json`.

Compute discriminators:
```bash
# Each discriminator = sha256("global:<instruction_name>")[0..8]
# Use the IDL or compute manually:
node -e "
const crypto = require('crypto');
const names = ['create_game','join_game','start_game','distribute','end_game','refund_player','cancel_game','refund_all_expired'];
names.forEach(n => {
  const hash = crypto.createHash('sha256').update('global:' + n).digest();
  console.log(n + ':', JSON.stringify(Array.from(hash.slice(0, 8))));
});
"
```

Update `DISCRIMINATORS` in `src/lib/anchor-escrow.ts`.

## Step 3: Update GameContext.tsx

Replace the current transfer calls with escrow equivalents:

### Game Creation
```typescript
// Before (GameContext.tsx ~line 320)
await createGameOnChain(wallet, roomName || 'Game Room', buyInLamports);

// After
import { createGameEscrow } from './anchor-escrow';
const { gamePDA, escrowPDA } = await createGameEscrow(
  wallet, roomCode, buyInLamports, 10, 3600
);
// Store gamePDA in Supabase game row for later reference
```

### Player Join (ready up / buy-in)
```typescript
// Before (GameContext.tsx ~line 1080)
await joinGameOnChainWithAmount(wallet, hostPubkey, buyInLamports);

// After
import { joinGameEscrow, deriveGamePDA } from './anchor-escrow';
const [gamePDA] = deriveGamePDA(hostPubkey, roomCode);
await joinGameEscrow(wallet, gamePDA);
// Buy-in goes to escrow PDA, not host
```

### Distribution (game over)
```typescript
// Before (GameContext.tsx ~line 845)
await distributeOnChain(wallet, gamePDA, winnerPubkey, lamports);

// After
import { distributeEscrow } from './anchor-escrow';
await distributeEscrow(wallet, gamePDA, winnerPubkey, lamports);
// Program sends from escrow to winner
```

### Refund (player leave request)
```typescript
// Before (GameContext.tsx ~line 1198)
await joinGameOnChainWithAmount(wallet, playerPubkey, lamports);

// After
import { refundPlayerEscrow } from './anchor-escrow';
await refundPlayerEscrow(wallet, gamePDA, playerPubkey);
// Program sends buy-in from escrow back to player
```

### Host Leave (cancel + refund all)
```typescript
// Before: host sends SOL back to each player individually
// After
import { cancelGameEscrow, refundPlayerEscrow } from './anchor-escrow';
await cancelGameEscrow(wallet, gamePDA);
// Then refund each readied player:
for (const player of readiedPlayers) {
  await refundPlayerEscrow(wallet, gamePDA, new PublicKey(player.id));
}
```

### Auto-refund (trustless guarantee)
```typescript
// NEW — anyone can call after game expires
import { refundExpired } from './anchor-escrow';
await refundExpired(anyWallet, gamePDA, playerPubkey);
// No host needed — the clock constraint allows it
```

## Step 4: Add gamePDA to Supabase

Add a `game_pda` column to the `games` table:
```sql
ALTER TABLE games ADD COLUMN game_pda text;
```

Store it during game creation, use it for all subsequent instructions.

## Step 5: Test

1. Create game → verify escrow PDA has 0 SOL
2. Player joins → verify escrow PDA balance = buy-in
3. Second player joins → escrow = 2x buy-in
4. Host distributes → winner gets SOL from escrow
5. Cancel game → verify refunds work
6. Let game expire → verify anyone can call refund

## Architecture

```
┌─────────┐      ┌──────────┐      ┌─────────┐
│ Player 1 │─SOL─→│  Escrow  │─SOL─→│ Winner  │
│ Player 2 │─SOL─→│   PDA    │      │         │
│ Player 3 │─SOL─→│ (program │      │         │
└─────────┘      │  owned)  │      └─────────┘
                 └──────────┘
                      │
                 ┌────┴────┐
                 │ Program │
                 │ Rules:  │
                 │ • Host  │
                 │   distro│
                 │ • Auto  │
                 │   refund│
                 │   @expiry│
                 └─────────┘
```

## Key Benefits

1. **No one holds the pot** — funds are in a PDA only the program controls
2. **Auto-refund** — if host ghosts, anyone can refund after expiry
3. **Verifiable** — all rules are on-chain, auditable
4. **No rug risk** — host can only distribute, not steal
