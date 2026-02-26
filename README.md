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

### Phase 1 — Foundation (Current)
- [x] Core hot seat gameplay with real SOL stakes
- [x] Prediction market side bets
- [x] Split pot + winner-takes-all payout modes
- [x] Email login with embedded Solana wallets
- [ ] **Trustless escrow** — PDA-based pot via Anchor (no host holds funds)
- [ ] **Mainnet launch** — Real money, real stakes

### Phase 2 — Game Modes & Community Packs
- [ ] **Trivia Mode** — Host picks a category, players answer under pressure, wrong answers cost you from the pot
- [ ] **Truth or Dare** — Players choose truth or dare, group votes if they actually followed through
- [ ] **Quiz Mode** — Custom quizzes where real stakes make every question hit different
- [ ] **Community Packs** — User-created game mode packs sold in the Transparent marketplace. Creators earn a cut of every purchase. Think Steam Workshop meets party games — anyone can design, publish, and monetize new game modes within the ecosystem

### Phase 3 — $TRANSPARENT Token & The Flywheel

Inspired by the [Rekt Brands](https://rekt.com) "cultural flywheel" model — where physical product sales fuel token demand, token perks drive engagement, and community ownership creates a self-reinforcing growth loop — Transparent applies the same thesis to gaming:

**The $TRANSPARENT Token**

A Solana SPL token that powers the entire Transparent economy:

- **Earned through play** — Airdropped to players as rewards for participating in games
- **In-game currency** — Use $TRANSPARENT to buy into games, purchase community packs, and place prediction bets
- **Creator payouts** — Community pack creators earn $TRANSPARENT from sales

**The Flywheel**

```
Player buys a game pack in the store (e.g. $40)
        ↓
20 $TRANSPARENT tokens airdropped to that game session
        ↓
Tokens used as in-game currency (buy-ins, bets, tips)
        ↓
More players → more pack purchases → more token demand
        ↓
Revenue funds token buybacks from the open market
        ↓
Buybacks reduce supply → token value increases
        ↓
Increased token value → stronger player incentives
        ↓
Stronger incentives → more players join
        ↓
Cycle repeats 🔄
```

**Why this works:**

Real revenue (game pack sales) creates real demand. Unlike most gaming tokens that rely purely on speculation, $TRANSPARENT has a direct revenue-to-buyback pipeline. Every pack sold puts buy pressure on the token. Every game played increases engagement. The token isn't a side bet on the platform — it IS the platform's economy.

**Revenue → Buybacks → Scarcity → Value → More Players → More Revenue**

This is the Rekt thesis applied to gaming: bridge real-world commerce (game sales) with on-chain tokenomics, creating a flywheel where each side reinforces the other.

### Phase 4 — IRL & Distribution
- [ ] **NFC Tap-to-Join** — Host's phone acts as an NFC tag. Players tap their phone against the host's to instantly join the lobby — no room codes, no friction. Think Apple Pay but for joining a game. Built for IRL parties, bars, and events
- [ ] **Event mode** — Large-scale games for meetups, conferences, and watch parties
- [ ] **Mobile apps** — Native iOS + Android for push notifications and smoother UX

---

## The Vision

Transparent isn't just a party game — it's a social gaming platform where honesty has real financial consequences. The combination of real stakes, prediction markets, community-created content, and token economics creates a flywheel that grows stronger with every game played.

**Short term:** The most fun party game on Solana.
**Long term:** A community-owned gaming ecosystem powered by $TRANSPARENT.

---

## Built For

🏆 **Solana Graveyard Hack 2026**

Built by [Ezven](https://github.com/Ferxxo-pa)

---

## License

MIT
