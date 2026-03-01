export interface Player {
  id: string;
  name: string;
  balance: number;
  isHost?: boolean;
  walletAddress?: string;
  isReady?: boolean;
}

export type QuestionMode = 'classic' | 'custom' | 'hot-take' | 'ai';

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
  | 'host-picking'
  | 'player-voting'
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
  /** Track used question indices to prevent repeats */
  usedQuestionIndices?: number[];
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
  // NSFW — these hit different
  "What's the freakiest thing you've ever done in bed that you've never told anyone?",
  "Who in this room would you hook up with tonight if nobody ever found out?",
  "What's the most embarrassing thing that's happened to you during sex?",
  "Have you ever faked it? How many times and with who?",
  "What's the wildest sext you've ever sent? Read it word for word.",
  "Who's someone you've hooked up with that you'd deny to anyone in this room?",
  "What's the shortest time you've known someone before hooking up? What happened after?",
  "Have you ever hooked up with two people in the same friend group? Did they find out?",
  "What's something you're into that you've never told a partner because you thought they'd judge you?",
  "Who in this room do you think is the freakiest and why?",

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

  // MORE SPICY
  "What's the biggest lie you've ever told your parents and do they still believe it?",
  "Have you ever pretended to be someone's friend just to get something from them?",
  "What's the most embarrassing thing you've been caught doing?",
  "Who was your most toxic ex and what made them toxic? Or were you the toxic one?",
  "Have you ever cheated on a test or an assignment? How and did you get caught?",
  "What's a red flag you have that you know about but refuse to fix?",
  "Who in this room do you think is the biggest player and why?",
  "What's the most embarrassing thing in your camera roll right now?",
  "Have you ever pretended to be drunker than you were to get out of something?",
  "What's a secret you know about someone in this room that they don't know you know?",

  // MORE UNHINGED
  "If you had to date someone in this room for a month who and why?",
  "What's the weirdest place you've ever hooked up?",
  "Have you ever sent a risky text to the wrong person? What happened?",
  "What's something you've done that if it was recorded would go viral for the wrong reasons?",
  "Who in this room gives off the most main character energy and who gives NPC energy?",
  "What's the most embarrassing thing you've cried about?",
  "If someone offered you $10,000 to never talk to one person in this room again who would you pick?",
  "What's the worst date you've ever been on and what made it so bad?",
  "Have you ever stalked someone's social media so deep you accidentally liked an old photo?",
  "What's a hill you'll die on that everyone else thinks is insane?",

  // CHAOS MODE — no coming back from these
  "Rate everyone in this room 1-10 out loud. No ties allowed.",
  "What's the most sus thing on your screen time report right now?",
  "Who in this room do you think secretly hates you and why?",
  "If you could read one person in this room's mind for a day who and what do you think you'd find?",
  "What's the most manipulative thing you've done in a relationship that actually worked?",
  "Who in this room would be the worst to be stuck on a deserted island with and why?",
  "What's the biggest lie you've told THIS WEEK?",
  "If everyone in this room had a leaked notes app whose would be the most unhinged?",
  "Have you ever made someone cry on purpose? What did you do?",
  "What's something about yourself that if people really knew they'd look at you different?",
  "Who in this room are you lowkey jealous of and what specifically makes you jealous?",
  "What's the worst thing someone in this room has done to you that they think you're over but you're not?",
  "Describe your type and then point to the person in this room who fits it the most.",
  "What's the most delusional thing you currently believe about yourself?",
  "If you had to pick one person in this room to be your ride or die forever and cut everyone else off who?",
  "What's something you've done that you'll take to the grave? Actually no say it right now.",
  "Who in this room would you trust with your unlocked phone for 5 minutes and who absolutely not?",
  "Have you ever ruined something good because you got bored? What was it?",
  "What's the most toxic trait you look for in a partner that you know is a red flag but you love it?",
  "If this room had a group chat without you in it what do you think they'd say about you?",

  // ── NEW: HUMILIATION TIER — curated 2026-02-28 ──────────
  "When's the last time you shit yourself as an adult? Full story.",
  "When's the last time you peed yourself? Where were you?",
  "Have you ever woken up next to someone and had no idea how you got there?",
  "Have you ever hooked up with someone and genuinely couldn't remember it the next day?",
  "When's the last time you completely blacked out? What did people tell you happened?",
  "Have you ever caught feelings for a friend's partner and never told anyone?",
  "Have you ever been caught watching something you'd die if anyone knew about?",
  "What's the longest you've gone without showering and what finally made you?",
  "Have you ever cried during sex? What happened?",
  "What's the most embarrassing thing in your search history RIGHT NOW?",
  "What's your most embarrassing bathroom emergency story? Don't spare details.",
  "Have you ever sent a text to the wrong person that changed everything?",
  "Have you ever snooped through someone's phone? What did you actually find?",
  "What's the worst thing you've ever said about your best friend behind their back?",
  "Have you ever thrown up on someone during a hookup?",
  "What's the most desperate thing you've done when you were lonely at 2am?",
  "What's the most embarrassing medical situation you've ever had to explain to a doctor?",
  "Have you ever been walked in on at the worst possible moment? By who?",
  "What's something you did in high school that could still ruin your reputation today?",
  "Have you ever clogged someone else's toilet and just left without saying anything?",
  "Have you ever lied about being single when you weren't? What happened?",
  "What's the most humiliating rejection you've ever experienced? Public or private?",
  "Have you ever been so drunk you lost something you STILL haven't found?",
  "What's the most embarrassing reason you've been to the ER?",
  "Have you ever cried in public and couldn't stop? What caused it?",
  "Have you ever walked in on someone else doing something they didn't want you to see?",
  "Have you ever had a crush on a teacher or boss? Did you act on it?",
  "What happened to you that you'll literally never tell your parents about?",
  "Have you ever been caught in a lie that completely blew up in your face?",
  "Have you ever accidentally liked a photo from YEARS deep in someone's page? Did they notice?",
  "What's the worst first date you've ever been on? What made it so bad?",
  "Have you ever ghosted someone who genuinely cared about you? Do you regret it?",
  "Have you ever stalked an ex's new partner online? How deep did you go?",
  "What secret would end a friendship if it came out right now?",
  "What's something you've done that you'd literally pay money for people to forget?",
];

export const FAKE_PLAYER_NAMES = [
  'Player1', 'Player2', 'Player3', 'Player4', 'Player5',
  'CryptoKing', 'DiamondHands', 'MoonShot', 'ToTheMars', 'HODLER',
];
