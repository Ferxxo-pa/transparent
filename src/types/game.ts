export interface Player {
  id: string;
  name: string;
  balance: number;
  isHost?: boolean;
}

export interface GameState {
  roomCode: string;
  roomName: string;
  buyInAmount: number;
  players: Player[];
  currentPot: number;
  gameStatus: 'waiting' | 'playing' | 'voting' | 'gameover';
  currentQuestion: string;
  currentPlayerInHotSeat: string | null;
  votes: Record<string, 'transparent' | 'fake'>;
  voteCount: number;
  totalVotes: number;
  winner: string | null;
}

export const QUESTIONS = [
  "What is the most embarrassing thing you've done while drunk?",
  "Have you ever stolen something from a friend?",
  "What's the biggest lie you've ever told?",
  "Have you ever cheated on a test or exam?",
  "What's your most embarrassing dating story?",
  "Have you ever been fired from a job?",
  "What's the worst thing you've done to get revenge?",
  "Have you ever pretended to be sick to get out of something?",
];

export const FAKE_PLAYER_NAMES = [
  'Player1', 'Player2', 'Player3', 'Player4', 'Player5',
  'CryptoKing', 'DiamondHands', 'MoonShot', 'ToTheMars', 'HODLER'
];
