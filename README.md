# Transparent 🎮

**The party game with real stakes.** Everyone puts in money. Answer honestly. Most transparent player takes the pot.

Built on Solana • Real-time multiplayer • Prediction market • Glass morphism UI

🔗 **Live:** [transparent-five.vercel.app](https://transparent-five.vercel.app)

---

## What is Transparent?

Transparent is a social party game where players stake SOL, answer questions in the hot seat, and the group votes on who's being honest. The most transparent player wins the pot — or in Split Pot mode, dishonesty costs you.

### How It Works

1. **Host creates a room** — Set the entry fee and game mode
2. **Everyone buys in** — SOL goes into the pot via Privy embedded wallets
3. **Predict the winner** *(optional)* — Side bets on who'll be most honest
4. **Hot seat answers** — One player faces the questions each round
5. **Group votes** — Transparent or fake?
6. **Most honest player wins** — Pot distributed on-chain

### Two Payout Modes

- 🏆 **Winner Takes All** — Most honest player gets the entire pot
- 🤝 **Split Pot** — Each "fake" vote costs a slice of your buy-in. Honest players profit from dishonest ones. If everyone's honest, everyone keeps their money.

### Prediction Market

Optional side bets on who will win. Correct predictors split the prediction pot proportionally to their bet size.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React + TypeScript + Vite |
| Styling | Custom CSS (glass morphism) + Framer Motion |
| Auth & Wallets | Privy (embedded Solana wallets, email login) |
| Blockchain | Solana (devnet) |
| Backend | Supabase (Postgres + Realtime subscriptions) |
| Hosting | Vercel |

---

## Features

- **Real-time multiplayer** — Supabase Realtime + broadcast for instant updates
- **Embedded wallets** — No extension needed, email login creates a Solana wallet
- **On-chain transactions** — Buy-ins, payouts, and predictions are real SOL transfers
- **Prediction market** — Bet on who'll win with custom amounts
- **Leave request system** — Readied players can request refunds from the host
- **Host disconnect protection** — Host leaving auto-refunds all players
- **Mobile-first** — Responsive design, works on any device
- **3 question modes** — Classic (built-in), Custom (host writes), Hot Take (players submit)

---

## Quick Start

```bash
git clone https://github.com/Ferxxo-pa/transparent.git
cd transparent
npm install
cp .env.example .env
# Fill in your Supabase URL + anon key + Privy App ID
npm run dev
```

### Environment Variables

```
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_PRIVY_APP_ID=your-privy-app-id
```

### Supabase Setup

Run the SQL in `src/lib/schema.sql` to create the required tables:
- `games` — Game rooms with status, buy-in, payout mode
- `players` — Players in each game with ready state
- `votes` — Honesty votes per round
- `predictions` — Prediction market bets

Enable Realtime on all tables for live updates.

---

## Project Structure

```
src/
├── contexts/
│   ├── GameContext.tsx    # Game state, transactions, realtime
│   └── PrivyContext.tsx   # Wallet adapter for Privy
├── pages/
│   ├── HomePage.tsx       # Landing page (mobile + desktop)
│   ├── CreateGamePage.tsx # Host creates a game
│   ├── JoinGamePage.tsx   # Players join via room code
│   ├── WaitingRoomPage.tsx# Lobby, predictions, ready up
│   ├── GamePlayPage.tsx   # Hot seat, voting
│   └── GameOverPage.tsx   # Results, distribution
├── hooks/
│   ├── useSolPrice.ts     # Live SOL/USD price
│   └── useWalletBalance.ts# Wallet balance
├── lib/
│   ├── anchor.ts          # Solana transaction helpers
│   ├── supabase.ts        # DB queries + Realtime subscriptions
│   └── config.ts          # App configuration
├── types/
│   └── game.ts            # TypeScript types + split pot math
└── App.tsx                # Routes + layout
```

---

## Roadmap

- [ ] **Trustless escrow** — PDA-based pot (no host holds funds)
- [ ] **NFC integration** — Tap to join games
- [ ] **Tournament mode** — Multi-round brackets
- [ ] **Mainnet launch** — Real money, real stakes

---

## Built For

🏆 **Solana Graveyard Hack 2026**

Built by [Ezven](https://github.com/Ferxxo-pa)

---

## License

MIT
