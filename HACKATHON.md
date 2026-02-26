# Transparent — Graveyard Hack 2026

**"Resurrect dead categories. Crypto party games died in 2021. We brought them back."**

---

## One-Liner
The party game with real stakes. Stake SOL. Answer honestly. Most transparent player takes the pot.

## What It Is
Transparent is a real-time multiplayer party game built on Solana where players put real money on the line and their honesty is judged by the crowd. Like Jackbox meets Truth-or-Dare meets crypto — with a built-in prediction market.

## How It Works
1. **Host** creates a room, sets a SOL buy-in and payout mode
2. **Players** join with email (Privy creates an embedded Solana wallet)
3. **Predict the winner** — optional side bets on who'll be most honest
4. One player lands in the **hot seat** — answers a personal question
5. Everyone votes: **Transparent** or **Fake**
6. Most honest player wins — pot distributed on-chain automatically

### Payout Modes
- 🏆 **Winner Takes All** — most honest player gets the entire pot
- 🤝 **Split Pot** — each "fake" vote costs you. Honest players profit from dishonest ones. Formula: `penaltyPerRound = buyIn / totalRounds`. Penalty pool redistributed proportionally to transparent votes.

### Prediction Market
Optional side bets during the lobby. Pick who you think will win, wager SOL. Correct predictors split the entire prediction pot proportionally to their bet size.

### Game Modes
- **Classic** — curated spicy questions from the vault
- **Hot-Take** — players submit questions for each other, crowd votes on the best
- **Custom** — host writes every question

---

## Why This Is Dead & How We Resurrected It

Crypto party games had a moment in 2021-22 (FLUF World, Party Bears, etc.) — then died. Why? Janky UX, no actual gameplay, speculation-only. We killed all three problems:

- **Real gameplay loop** — hot seat, voting, scoring, prediction market, multi-round
- **Dead simple UX** — email login, no extensions, no seed phrases. Privy embedded wallets handle everything.
- **Actual stakes** — real SOL transfers, verifiable on Solana Explorer
- **Trust mechanics** — host disconnect protection, leave request refunds, auto-refund on game cancellation

---

## Tech Stack
| Layer | Tech |
|-------|------|
| Frontend | React + Vite + TypeScript + Framer Motion |
| Styling | Custom CSS (glass morphism) + responsive (mobile-first) |
| Auth & Wallets | Privy (embedded Solana wallets, email login) |
| Blockchain | Solana Devnet (SystemProgram.transfer) |
| Realtime | Supabase Postgres + WebSockets + Broadcast |
| Hosting | Vercel |

---

## Track Pitches

### 🎮 MagicBlock Gaming ($5k)
Transparent is the first party game on Solana that actually works. No NFT gates, no token economies — just pure gameplay with crypto rails. The on-chain buy-in is verified on Solana Explorer. Every game session leaves a transaction trail. Built-in prediction market adds a DeFi mechanic to a social game. This is what gaming on Solana looks like when you ship the game first.

### 🔗 Tapestry Onchain Social ($5k)
Transparent is a social trust game at its core. Every round generates a crowd-sourced honesty signal. The prediction market lets players put money behind their social reads. Every vote, every bet, every payout is an onchain social action. Future: aggregate honesty scores as onchain identity/reputation primitives.

### 🏆 Overall Pool ($15k)
- **Working**: Full game loop, prediction market, refund system, mobile + desktop
- **Narrative**: Dead category resurrected. Not a whitepaper — a product you can play tonight.
- **On-chain**: Every buy-in, prediction, and payout is a real Solana transaction.

---

## What's Live
- ✅ Full game loop (create → join → predict → play → vote → distribute)
- ✅ Two payout modes (Winner Takes All + Split Pot with honesty math)
- ✅ Prediction market with custom bet amounts and USD conversion
- ✅ Real-time multiplayer (Supabase Realtime + Broadcast)
- ✅ On-chain SOL transfers (Solana Devnet via Privy embedded wallets)
- ✅ Email-only login (no wallet extension required)
- ✅ 3 game modes (Classic, Hot-Take, Custom)
- ✅ Host disconnect → auto-refund all readied players
- ✅ Player leave request system (host approves refund)
- ✅ Host controls (force round, end game, select winner)
- ✅ Framer Motion animations + glassmorphism UI
- ✅ Mobile-first responsive design
- ✅ Vercel + Supabase — fully deployed

## Roadmap (Post-Hackathon)
- **Trustless escrow** — PDA-based pot (no host holds funds, auto-refund on timeout)
- **NFC integration** — Tap to join games with physical cards
- **Tournament mode** — Multi-round brackets with elimination
- **On-chain reputation** — Aggregate honesty scores as soulbound identity
- **Mainnet launch** — Real money, real stakes

---

## Demo Script

### Setup (30 seconds)
1. Open app on phone + laptop
2. Login with email on both (Privy creates wallets)
3. Laptop: Create Game → set buy-in → share room code
4. Phone: Join Game → enter code → ready up

### Demo Flow (3 minutes)
1. Both players in lobby → show prediction market → place a bet
2. Host starts game → hot seat question appears
3. Player answers → others vote Transparent/Fake
4. Scores update → round auto-advances
5. Game over → show per-player honesty breakdown
6. Host distributes pot → SOL sent on-chain
7. Show prediction results → correct bettors get paid
8. Pull up Solana Explorer → show the transactions

### Money Shot
The payout transaction on Solana Explorer. Real SOL, real stakes, real game.

---

## Team
- **Ezven** (@Ferxxo-pa) — strategy, product, design
- **Clawdez** — AI development partner

---

## Links
- **Live:** https://transparent-five.vercel.app
- **Repo:** https://github.com/Ferxxo-pa/transparent
- **Explorer:** https://explorer.solana.com/?cluster=devnet

---

*Built for Graveyard Hack 2026. Shipped Feb 27.*
