# Transparent 🎮

**The crypto party game.** Stake SOL. Answer honestly. Winner takes the pot.

Built on Solana devnet. Real-time multiplayer. Glass morphism UI.

---

## Quick Start

```bash
git clone https://github.com/Ferxxo-pa/transparent.git
cd transparent
npm install
cp .env.example .env
# Fill in your Supabase URL + anon key
npm run dev
```

## Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor → New Query**, paste `supabase/schema.sql`, hit **Run**
3. Copy your project URL + anon key into `.env`

## Deploy to Vercel

```bash
npx vercel
```

Set these env vars in your Vercel project settings:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

---

## How to Play

1. **Host** connects wallet → Create Game → set buy-in → share room code
2. **Players** connect wallet → Join Game → enter room code
3. Host clicks **Start Game**
4. Hot seat player answers the question out loud
5. Everyone votes: **Honest** or **Lying**
6. Most honest player wins the SOL pot

### Game Modes
- **Classic** — curated questions from the pool
- **Custom** — host writes their own questions  
- **Hot-Take** — players submit questions, vote on the best one

---

## Tech Stack

- **Frontend**: React + Vite + TypeScript + Framer Motion
- **Realtime**: Supabase Postgres + WebSockets
- **Wallet**: `@solana/wallet-adapter-react` (Phantom, Solflare)
- **Chain**: Solana Devnet — buy-ins via SystemProgram.transfer
- **Styling**: Custom CSS + glassmorphism design system

---

## Devnet SOL

Need SOL to test buy-ins? Get some free:
- [solfaucet.com](https://solfaucet.com)
- `solana airdrop 2 YOUR_WALLET --url devnet`

---

Built for **Graveyard Hack 2026** — resurrect dead categories.
Crypto party games died in 2021. We brought them back.
