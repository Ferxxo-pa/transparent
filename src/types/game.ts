export interface Player {
  id: string;
  name: string;
  balance: number;
  isHost?: boolean;
  walletAddress?: string;
  isReady?: boolean;
}

export type QuestionMode = 'classic' | 'custom' | 'hot-take';

export type PayoutMode = 'winner-takes-all' | 'split-pot';

/**
 * Split-pot payout calculation.
 *
 * Each round a player is in the hot seat, voters decide "transparent" or "fake".
 * If majority votes "fake", the hot-seat player loses a penalty slice of their buy-in.
 *
 * penaltyPerRound = buyIn / totalRounds
 * playerKeeps = buyIn - (timesVotedFake × penaltyPerRound)
 * penaltyPool = sum of all deductions
 * bonusPerPlayer = penaltyPool × (playerTransparentVotes / totalTransparentVotes)
 * finalPayout = playerKeeps + bonus
 *
 * If everyone is honest: everyone gets their buy-in back.
 * If everyone is fake: penalty pool split evenly (edge case).
 */
export function calculateSplitPayouts(
  scores: Record<string, PlayerScore>,
  buyIn: number,
  totalRounds: number,
): Record<string, number> {
  const wallets = Object.keys(scores);
  if (wallets.length === 0 || totalRounds === 0) return {};

  const penaltyPerRound = buyIn / totalRounds;
  let penaltyPool = 0;
  const keeps: Record<string, number> = {};

  // Calculate what each player keeps and build penalty pool
  for (const wallet of wallets) {
    const s = scores[wallet];
    const timesVotedFake = s.fake; // number of rounds majority voted them fake
    const deduction = Math.min(timesVotedFake * penaltyPerRound, buyIn); // can't lose more than buy-in
    keeps[wallet] = buyIn - deduction;
    penaltyPool += deduction;
  }

  // Distribute penalty pool proportionally to transparent votes
  const totalTransparent = wallets.reduce((sum, w) => sum + scores[w].transparent, 0);
  const payouts: Record<string, number> = {};

  for (const wallet of wallets) {
    let bonus = 0;
    if (totalTransparent > 0) {
      bonus = penaltyPool * (scores[wallet].transparent / totalTransparent);
    } else {
      // Edge case: everyone voted fake on everyone — split evenly
      bonus = penaltyPool / wallets.length;
    }
    payouts[wallet] = Math.max(keeps[wallet] + bonus, 0);
  }

  return payouts;
}

export type GamePhase =
  | 'submitting-questions'
  | 'voting-question'
  | 'picking-question'
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
  /** 4 question options for picking-question phase */
  questionOptions?: string[];
  /** Votes for question options: playerId -> questionIndex */
  questionPickVotes?: Record<string, number>;
  /** Current round number */
  currentRound?: number;
  /** Per-player scores across all rounds (wallet -> score) */
  scores?: Record<string, PlayerScore>;
}

// ── 30+ Party Questions ─────────────────────────────────────
// Edgy, fun, college-appropriate — designed to make people laugh and squirm

export const QUESTIONS: string[] = [
  // SPICY — real confessions, the room judges
  "What's your actual body count? No rounding down. The room will know if you're lying.",
  "Who in this room have you talked the most shit about? What did you say?",
  "What's the shadiest thing you've ever done for money and how much was it?",
  "Have you ever hooked up with a friend's ex? Did they find out?",
  "What's the biggest secret you're keeping from your best friend right now?",
  "Who's the most questionable person you've hooked up with? Why was it questionable?",
  "What's the worst thing you've done to an ex that you never told anyone?",
  "Have you ever gone through someone's phone? What did you find?",
  "What's the most money you've lost being stupid? Be specific.",
  "Have you ever lied about how much money you make? By how much?",
  "What's a promise you made to someone and completely broke without feeling bad?",
  "Have you ever taken credit for someone else's work? What happened after?",
  "Who in this room do you trust the least and why?",
  "What's the pettiest reason you've ever ended a friendship?",
  "Have you ever faked an emotion to manipulate someone into doing what you wanted?",

  // UNHINGED — room goes silent, friendships tested
  "Who in this room have you had a sex dream about? Describe the vibe.",
  "What's the most illegal thing you've done that you'd go to jail for if caught?",
  "If you had to hook up with one person in this room who would it be and why?",
  "What's something you did drunk that you've never told a single soul?",
  "Have you ever caught feelings for someone in a relationship and tried to make a move?",
  "What's the most unhinged thing you've done after a breakup?",
  "Who in this room would you absolutely never date and why? Be honest.",
  "What's something on your phone right now that would ruin you if everyone saw it?",
  "Have you ever lied to someone in this room about something serious? What was it?",
  "What's the worst thing you've done that you genuinely feel zero guilt about?",
  "If everyone in this room's search history got leaked whose would be the most embarrassing?",
  "Have you ever used someone just because they were useful to you? Who?",
  "What's a fantasy you have that you'd never say out loud? Say it now.",
  "Who in this room is the worst liar and what's the biggest lie you've caught them in?",
  "If you had to rank everyone in this room by attractiveness out loud right now do it.",
];

export const FAKE_PLAYER_NAMES = [
  'Player1', 'Player2', 'Player3', 'Player4', 'Player5',
  'CryptoKing', 'DiamondHands', 'MoonShot', 'ToTheMars', 'HODLER',
];
