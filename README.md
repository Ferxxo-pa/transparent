# Transparent

**The party game where honesty pays.** Stake SOL. Answer honestly. The most transparent player takes the pot.

**Live:** [transparent-five.vercel.app](https://transparent-five.vercel.app)

---

## What is Transparent?

Transparent is a real-stakes social game on Solana. Players buy in with SOL, take turns in the hot seat answering questions, and the group votes on who's being honest. Dishonesty costs you. Honesty pays.

Every transaction is on-chain. No trust required.

### How It Works

1. **Host creates a room** — sets buy-in amount, question mode, and payout rules
2. **Players join and stake SOL** — buy-ins held in escrow PDA (trustless) or routed through MagicBlock Ephemeral Rollups (~400ms confirmations)
3. **Hot seat rounds** — one player answers, everyone else votes: transparent or fake?
4. **Prediction market** — optional side bets on who'll be most honest
5. **Payout** — winner-takes-all or split-pot based on honesty scores, distributed on-chain

### Payout Modes

- **Winner Takes All** — most honest player gets the entire pot
- **Split Pot** — each "fake" vote costs a slice of your buy-in. If everyone's honest, everyone keeps their money

### Game Modes

- **Classic** — curated question bank
- **Custom** — host writes the questions
- **Hot Take** — players submit questions, group votes on which one the hot seat player has to answer
- **Storyteller** — hot seat player tells a story, claims truth or fake, group guesses

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                    Frontend                       │
│         React 18 + TypeScript + Vite              │
│         Framer Motion animations                  │
│         Mobile-first responsive design            │
├─────────────────────────────────────────────────┤
│                  Auth & Wallets                   │
│    Privy embedded Solana wallets (email login)    │
│    No browser extension required                  │
├──────────────┬──────────────┬───────────────────┤
│   Realtime   │  Blockchain  │     Escrow        │
│   Supabase   │   Solana     │   Anchor PDA      │
│   Postgres + │   MagicBlock │   Trustless pot    │
│   Broadcast  │   Ephemeral  │   Auto-refund on  │
│   Channels   │   Rollups    │   expiry          │
└──────────────┴──────────────┴───────────────────┘
```

### Key Technical Decisions

**MagicBlock Ephemeral Rollups** — Game transactions route through MagicBlock's Magic Router for ~400ms confirmations instead of standard Solana latency. Falls back to base layer automatically if the router is unavailable.

**Trustless Escrow (PDA)** — An Anchor program manages the pot via a Program Derived Address. Buy-ins go to the escrow, not the host wallet. The program enforces distribution rules. If the host ghosts, anyone can trigger refunds after expiry. Toggle via `VITE_USE_ESCROW=true`.

**Privy Embedded Wallets** — Players log in with email. Privy creates and manages a Solana wallet behind the scenes. Zero crypto knowledge required to play.

**Supabase Realtime** — Game state syncs across all players via Postgres changes + broadcast channels. No WebSocket server to manage.

**Row Level Security** — Scoped RLS policies per table and operation. Players can read game state and insert their own votes/submissions. No client-side deletes on votes.

**Error Boundary** — App-level crash recovery with styled reload UI instead of white screen.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Custom CSS + Framer Motion |
| Auth | Privy (embedded Solana wallets, email login) |
| Blockchain | Solana + MagicBlock Ephemeral Rollups |
| Smart Contract | Anchor (escrow PDA) |
| Backend | Supabase (Postgres + Realtime) |
| Hosting | Vercel |

---

## Project Structure

```
src/
├── components/
│   ├── ErrorBoundary.tsx      # App-level crash recovery
│   ├── StorytellerPhase.tsx   # Storyteller game mode UI
│   ├── PlayerQuestionVote.tsx # Hot Take question voting
│   ├── AIVibeCheck.tsx        # AI-generated game commentary
│   ├── RaisePot.tsx           # Mid-game pot raises
│   └── WalletSetupGate.tsx    # Wallet readiness guard
├── contexts/
│   ├── GameContext.tsx         # Game state machine, tx routing, realtime
│   └── PrivyContext.tsx        # Wallet adapter + BUG-001 warmup fix
├── lib/
│   ├── anchor.ts              # Direct Solana transfers
│   ├── anchor-escrow.ts       # PDA escrow (create, join, distribute, refund)
│   ├── magicblock.ts          # MagicBlock Ephemeral Rollups integration
│   ├── supabase.ts            # DB queries + Realtime subscriptions
│   ├── config.ts              # Network-aware config (devnet/mainnet)
│   └── schema.sql             # Database schema + RLS policies
├── pages/
│   ├── HomePage.tsx            # Landing (mobile + desktop variants)
│   ├── CreateGamePage.tsx      # Room creation
│   ├── JoinGamePage.tsx        # Join via code or /join/:code link
│   ├── WaitingRoomPage.tsx     # Lobby, predictions, ready up
│   ├── GamePlayPage.tsx        # Hot seat + voting
│   └── GameOverPage.tsx        # Results + on-chain distribution
├── types/
│   └── game.ts                 # Types + split-pot payout math
└── App.tsx                     # Routes + providers + error boundary
```

---

## Quick Start

```bash
git clone https://github.com/Ferxxo-pa/transparent.git
cd transparent
npm install
cp .env.example .env
# Fill in your keys (see .env.example for all options)
npm run dev
```

### Environment Variables

See `.env.example` for the full list:
- `VITE_PRIVY_APP_ID` — Privy app ID for wallet auth
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — Supabase project
- `VITE_SOLANA_NETWORK` — `devnet` or `mainnet-beta`
- `VITE_SOLANA_RPC` — Helius or other RPC endpoint
- `VITE_MAGICBLOCK_ROUTER` / `VITE_MAGICBLOCK_WS` — MagicBlock endpoints
- `VITE_USE_ESCROW` — `true` to enable PDA escrow mode

### Database Setup

Run `src/lib/schema.sql` in Supabase SQL Editor. Enable Realtime on all tables.

---

## Features

- **Real SOL stakes** — buy-ins, payouts, and predictions are on-chain transfers
- **Trustless escrow** — PDA holds the pot, not the host. Auto-refund on expiry
- **~400ms transactions** — MagicBlock Ephemeral Rollups with automatic fallback
- **Embedded wallets** — email login, no extension needed
- **Real-time multiplayer** — Supabase Realtime + broadcast channels
- **Prediction market** — side bets on who'll win
- **4 game modes** — Classic, Custom, Hot Take, Storyteller
- **Split pot math** — dishonesty costs proportional to votes against you
- **Leave protection** — host leaving auto-refunds all players
- **Join by link** — shareable `/join/:code` URLs
- **Mobile-first** — responsive design, works on any device

---

## Roadmap

- [x] Core hot seat gameplay with real SOL stakes
- [x] Prediction market side bets
- [x] Split pot + winner-takes-all payout modes
- [x] Embedded Solana wallets (email login)
- [x] MagicBlock Ephemeral Rollups integration
- [x] Trustless escrow via Anchor PDA
- [x] Storyteller game mode
- [x] Hot Take question voting
- [ ] $TRANSPARENT token economy
- [ ] Community game packs marketplace
- [ ] NFC tap-to-join for IRL events
- [ ] Native mobile apps

---

## Built For

**Colosseum Frontier Hackathon 2026**

Built by [Ezven](https://github.com/Ferxxo-pa)

---

## License

MIT
