# Transparent — Graveyard Hack 2026

**"Resurrect dead categories. Crypto party games died in 2021. We brought them back."**

---

## One-Liner
The crypto party game. Stake SOL. Answer honestly. Winner takes the pot.

## What It Is
Transparent is a real-time multiplayer party game built on Solana where players put real money on the line and their honesty is judged by the crowd. Like Jackbox meets Truth-or-Dare meets crypto.

## How It Works
1. **Host** creates a room, sets a SOL buy-in (or plays for free)
2. **Players** join with their wallet, pay into the pot
3. One player lands in the **hot seat** — answers a personal question out loud
4. Everyone votes: **Honest** or **Lying**
5. Most transparent player wins the pot

### Game Modes
- **Classic** — curated spicy questions from the vault
- **Hot-Take** — players write questions for each other, crowd votes on the best
- **Custom** — host writes every question

---

## Why This Is Dead & How We Resurrected It

Crypto party games had a moment in 2021-22 (FLUF World, Party Bears, etc.) — then died. Why? Janky UX, no actual gameplay, speculation-only. We killed all three problems:

- **Real gameplay loop** — hot seat, voting, score tracking, multi-round
- **Dead simple UX** — no Anchor program, no token BS. Just a wallet, a room code, and a question
- **Actual stakes** — real SOL via SystemProgram.transfer, verifiable on Solana Explorer

---

## Tech Stack
- **Frontend**: React + Vite + TypeScript + Framer Motion
- **Realtime**: Supabase Postgres + WebSockets (all clients sync instantly)
- **Chain**: Solana Devnet — on-chain via SystemProgram.transfer (no deployed program required)
- **Wallet**: Privy (embedded wallets + Phantom/Solflare)
- **Deploy**: Vercel

---

## Track Pitches

### 🎮 MagicBlock Gaming ($5k)
Transparent is the first party game on Solana that actually works. No NFT gates, no token economies — just pure gameplay with crypto rails. The on-chain buy-in is verified on Solana Explorer. Every game session leaves a transaction trail. This is what gaming on Solana looks like when you ship the game first.

### 🔗 Tapestry Onchain Social ($5k)
Transparent is a social trust game at its core. The entire mechanic is crowd-judging someone's honesty — a social reputation signal that happens every round. Every vote is an onchain social action. This is the social graph in motion: players signal trust, dishonesty, and judgment in real-time. Future extension: aggregate honesty scores as onchain identity primitives.

### 🏆 Overall Pool ($15k)
Three things matter for Overall: working product, compelling narrative, on-chain activity.
- **Working**: Full game loop tested end-to-end. Multi-device. Real-time sync.
- **Narrative**: Dead category. Real resurrection. Not a whitepaper — a product you can play tonight.
- **On-chain**: Every buy-in is a real Solana transaction. Every distribution is verifiable.

---

## What's Live
- ✅ Full game loop (create → join → play → vote → distribute winnings)
- ✅ Real-time multiplayer (Supabase WebSockets)
- ✅ On-chain SOL transfers (Solana Devnet)
- ✅ 3 game modes (Classic, Hot-Take, Custom)
- ✅ Single-player support
- ✅ Host controls (force next round, end game, crown winner)
- ✅ Framer Motion animations + glassmorphism UI
- ✅ Mobile-first design (works on any phone)
- ✅ Vercel + Supabase — fully deployed

## Known Limitations
- Devnet SOL only (testnet for hackathon)
- Scores in-memory (not persisted to DB — persists via localStorage)

---

## Demo Script

### Setup (30 seconds)
1. Open app on phone + laptop
2. Connect wallet on both (use Phantom devnet)
3. Laptop: Create Game → set buy-in 0.01 SOL → share code
4. Phone: Join Game → enter code

### Demo Flow (2 minutes)
1. Both players in lobby → host clicks Start Game
2. Hot seat question appears → player answers out loud
3. Other player votes (Honest/Lying)
4. Scores update → round auto-advances
5. Game over → leaderboard → host crowns winner → SOL sent on-chain
6. Pull up Solana Explorer → show the transaction

### Money shot
The SOL distribution transaction on Solana Explorer. That's what makes this crypto, not just a quiz game.

---

## Team
- **Ezven** — strategy, product, BD
- **Clawdez** — built overnight

---

## Links
- Repo: https://github.com/Ferxxo-pa/transparent
- Live: [deploy to Vercel — see README]
- Solana Explorer: https://explorer.solana.com/?cluster=devnet

---

*Built for Graveyard Hack 2026. Deadline: Feb 27.*
