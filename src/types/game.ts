export interface Player {
  id: string;
  name: string;
  balance: number;
  isHost?: boolean;
  walletAddress?: string;
}

export type QuestionMode = 'classic' | 'custom' | 'hot-take';

export type PayoutMode = 'winner-takes-all' | 'honest-talkers';

export type GamePhase =
  | 'submitting-questions'
  | 'voting-question'
  | 'answering'
  | 'voting-honesty';

export interface SubmittedQuestion {
  id: string;
  text: string;
  submitterId: string;
  votes: number;
}

export interface PlayerScore {
  transparent: number;
  fake: number;
  rounds: number;
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
  /** Supabase game UUID — set when using real backend */
  gameId?: string;
  /** Host wallet address */
  hostWallet?: string;
  /** Question mode for this game */
  questionMode: QuestionMode;
  /** Payout mode */
  payoutMode: PayoutMode;
  /** Number of questions/rounds (0 = one per player) */
  numQuestions: number;
  /** Custom questions (for custom mode, set by host at creation) */
  customQuestions?: string[];
  /** Questions submitted by players (hot-take mode) */
  submittedQuestions?: SubmittedQuestion[];
  /** Hot-take mode: playerId -> questionId they voted for */
  questionVotes?: Record<string, string>;
  /** Current game phase (hot-take mode sub-phases) */
  gamePhase?: GamePhase;
  /** Current round number */
  currentRound?: number;
  /** Per-player scores across all rounds (wallet -> score) */
  scores?: Record<string, PlayerScore>;
}

// ── 30+ Party Questions ─────────────────────────────────────
// Edgy, fun, college-appropriate — designed to make people laugh and squirm

export const QUESTIONS: string[] = [
  // Classic confessions
  "What's the most embarrassing thing you've done while drunk?",
  "Have you ever stolen something from a friend?",
  "What's the biggest lie you've ever told your parents?",
  "Have you ever cheated on a test or exam?",
  "What's your most embarrassing dating app story?",
  "Have you ever been kicked out of somewhere? Where and why?",
  "What's the pettiest thing you've ever done for revenge?",
  "Have you ever pretended to be sick to skip something important?",

  // Spicy hypotheticals
  "If you had to delete one app from your phone forever, which would it be?",
  "If everyone in this room could read your last 10 texts, how screwed are you?",
  "If you had to marry someone in this room, who would it be?",
  "You get $10,000 but your search history gets posted on your Instagram story. Deal?",
  "If you had to give up showering for a week or give up your phone for a week, which one?",
  "Would you rather have your parents read every DM you've ever sent or your boss?",
  "If you could swap lives with someone in this room for a week, who and why?",

  // Would-you-rather dilemmas
  "Would you rather accidentally 'like' your ex's photo from 3 years ago or send a screenshot of their profile to them?",
  "Would you rather have everyone know your body count or your bank balance?",
  "Would you rather give up coffee forever or give up alcohol forever?",
  "Would you rather be caught singing in the mirror or talking to yourself?",

  // Truth-bomb confessions
  "What's the most unhinged thing on your camera roll right now?",
  "What's the worst text you've sent to the wrong person?",
  "What's the most money you've wasted on something stupid?",
  "What's the biggest red flag you've ignored in a relationship?",
  "What's something you've done that would get you cancelled?",
  "What's your most embarrassing music guilty pleasure?",
  "Have you ever lied about your age? For what?",
  "What's the longest you've gone without showering and why?",

  // Social chaos
  "If someone in this room was a secret agent, who would it be and why?",
  "Who in this room would survive the longest in a zombie apocalypse?",
  "Who here has the worst taste in music? Defend yourself.",
  "If this room was a reality TV show, who would be the villain?",
  "Who in this room is most likely to become famous? For what?",
  "If you had to pick someone in this room to be your lawyer, who would you trust?",

  // Deep cuts
  "What's your most controversial food opinion?",
  "What's a hill you'll die on that most people disagree with?",
  "What's the most embarrassing thing your parents have caught you doing?",
  "What's the weirdest thing you've done when you thought nobody was watching?",
  "If your Spotify Wrapped was projected on a screen right now, what's the most embarrassing thing on it?",
  "What's the worst excuse you've given to get out of plans?",
  "What's something everyone else loves that you secretly think is overrated?",
];

export const FAKE_PLAYER_NAMES = [
  'Player1', 'Player2', 'Player3', 'Player4', 'Player5',
  'CryptoKing', 'DiamondHands', 'MoonShot', 'ToTheMars', 'HODLER',
];
