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
  // Receipts — real confessions the room can judge
  "What's the worst thing you've done to an ex that you never told anyone?",
  "What's the most expensive impulse purchase you regret? How much?",
  "Have you ever snitched on someone? What happened?",
  "What's the shadiest thing you've done for money?",
  "Have you ever hooked up with a friend's ex? Who?",
  "What's the biggest secret you're keeping from your best friend right now?",
  "Have you ever lied on your resume? What did you make up?",
  "What's the worst thing you've said behind someone's back in this room?",
  "Have you ever ghosted someone who genuinely liked you? Why?",
  "What's a promise you made to someone and completely broke?",

  // Body count & dating — spicy but judgeable
  "What's your real body count? No rounding down.",
  "Who's the most questionable person you've hooked up with and why was it questionable?",
  "What's the most desperate thing you've ever done to get someone's attention?",
  "Have you ever been the side piece? Did the other person find out?",
  "What's the fastest you've caught feelings and how badly did it end?",
  "Have you ever gone through someone's phone? What did you find?",
  "What's the biggest ick you've overlooked because the person was attractive?",
  "Have you ever faked an emotion to manipulate someone? What was the situation?",

  // Money & hustle — numbers don't lie
  "What's the most money you've lost on a bad decision? Be specific.",
  "Have you ever scammed someone, even a little? What happened?",
  "What's the brokest you've ever been and what did you do about it?",
  "Have you ever lied about how much money you make? By how much?",
  "What's something you spend money on that you'd be embarrassed for people to know?",
  "Have you ever taken credit for someone else's work? What was it?",

  // Loyalty tests — the room WILL know
  "Who in this room do you trust the least and why?",
  "If you had to cut one person in this room out of your life, who and why?",
  "What's something you actually think about someone in this room but would never say?",
  "Who here do you think is putting on the biggest act right now?",
  "Have you ever talked shit about someone in this room? What did you say?",
  "Who in this room would you never go into business with?",

  // Unhinged confessions — the ones that haunt you at 3AM
  "What's the most illegal thing you've gotten away with?",
  "What's something you did as a teenager that would ruin you if it came out today?",
  "Have you ever cried in a public bathroom? What broke you?",
  "What's a lie you've been telling so long it basically became your truth?",
  "What's the pettiest reason you've ended a friendship?",
  "Have you ever pretended to like someone's cooking/art/music to their face? Whose?",
  "What's the worst thing you've done that you genuinely feel no guilt about?",
  "Have you ever sabotaged someone's opportunity? Why?",
  "What's something you've never told anyone in this room until right now?",
  "What's the most two-faced thing you've ever done?",
];

export const FAKE_PLAYER_NAMES = [
  'Player1', 'Player2', 'Player3', 'Player4', 'Player5',
  'CryptoKing', 'DiamondHands', 'MoonShot', 'ToTheMars', 'HODLER',
];
