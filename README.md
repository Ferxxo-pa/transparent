# Transparent

Transparent is a college party game built on Solana that combines edgy dares with real stakes. It's designed to make crypto onboarding fun, social, and frictionless.

## 🎮 About the Game

Transparent is a social deduction game where players answer provocative questions and vote on whether others are being honest or fake. Players buy into rounds with crypto, and winners take the pot. It's perfect for parties, icebreakers, or any social gathering where you want to add some spice.

### How It Works

1. **Host creates a game** with a custom room name and buy-in amount
2. **Players join** using a 6-digit room code
3. **Take turns in the hot seat** answering edgy questions
4. **Other players vote** if the answer is "transparent" (honest) or "fake"
5. **Winner takes the pot** based on voting results

## 🛠️ How to Run

```bash
npm install
npm run dev
```

The app will be available at `http://localhost:5173`

## 🏗️ Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development and building
- **React Router** for navigation
- **Tailwind CSS** for styling
- **Lucide React** for icons

### Backend & Infrastructure
- **Supabase** for real-time database and backend services
- **Solana** blockchain integration (coming soon)

## 📁 Project Structure

```
transparent/
├── src/
│   ├── components/       # Reusable UI components
│   │   ├── Background.tsx
│   │   ├── GlassCard.tsx
│   │   ├── GlowButton.tsx
│   │   └── TransparentLogo.tsx
│   ├── contexts/         # React context providers
│   │   └── GameContext.tsx
│   ├── pages/           # Page components
│   │   ├── HomePage.tsx
│   │   ├── JoinGamePage.tsx
│   │   ├── CreateGamePage.tsx
│   │   ├── GameCreatedPage.tsx
│   │   ├── WaitingRoomPage.tsx
│   │   ├── GamePlayPage.tsx
│   │   └── GameOverPage.tsx
│   ├── types/           # TypeScript type definitions
│   │   └── game.ts
│   └── assets/          # Images and static files
├── public/              # Public assets
└── package.json
```

## 🎯 Key Features

- Real-time multiplayer gameplay
- Dynamic room creation with custom buy-ins
- Voting system with live results
- Glass-morphism UI design
- Mobile-responsive interface
- Integration-ready for Solana blockchain

## 🚀 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking

## 🔮 Roadmap

- [ ] Full Solana blockchain integration
- [ ] Wallet connection (Phantom, Solflare)
- [ ] Real crypto transactions for buy-ins
- [ ] NFT rewards for winners
- [ ] Tournament mode
- [ ] Custom question packs
- [ ] Leaderboards

## 🤝 Contributing

This is a demo project showcasing the potential of crypto-powered social gaming. Contributions, issues, and feature requests are welcome!

## 📝 License

This project is for demonstration purposes.

---

Built with ❤️ for the Solana ecosystem
