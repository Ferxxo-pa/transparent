import React, { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { PublicKey } from '@solana/web3.js';
import { RealtimeChannel } from '@supabase/supabase-js';
import { GameState, Player, QUESTIONS, QuestionMode, GamePhase, SubmittedQuestion, PayoutMode, ClassicSubMode, calculateSplitPayouts, calculateStorytellerRoundPayout } from '../types/game';
import {
  createGameInDB,
  getGameByRoomCode,
  updateGameStatus,
  addPlayerToDB,
  getPlayersForGame,
  insertVote,
  getVotesForRound,
  submitQuestionToDB,
  voteForQuestionInDB,
  readyUpPlayer,
  placePrediction as placePredictionInDB,
  getPredictionsForGame,
  settlePredictions,
  subscribeToGame,
  unsubscribeFromGame,
  upsertPlayerStats,
  GameRow,
  PlayerRow,
  VoteRow,
  QuestionSubmissionRow,
  PredictionRow,
  supabase,
} from '../lib/supabase';
import {
  createGameOnChain,
  joinGameOnChainWithAmount,
  distributeOnChain,
  deriveGamePDA,
  WalletAdapter,
} from '../lib/anchor';
import {
  buyInViaMagicBlock,
  distributeViaMagicBlock,
} from '../lib/magicblock';
import {
  joinGameEscrow,
  distributeEscrow,
  refundPlayerEscrow,
  deriveGamePDA as deriveEscrowGamePDA,
} from '../lib/anchor-escrow';
import { USE_ESCROW } from '../lib/config';

// ============================================================
// Game Context — Real multiplayer via Supabase + Solana
// ============================================================

interface GameContextType {
  gameState: GameState | null;
  loading: boolean;
  error: string | null;
  predictions: PredictionRow[];
  predictionPot: number; // total lamports in prediction pot
  createGame: (buyIn: number, roomName: string, questionMode?: QuestionMode, customQuestions?: string[], playerName?: string, payoutMode?: PayoutMode, numQuestions?: number, classicSubMode?: ClassicSubMode) => Promise<boolean>;
  skipQuestion: () => Promise<void>;
  bidOnQuestion: (questionId: string, amount: number) => Promise<void>;
  castStakeVote: (vote: 'transparent' | 'fake', stakeAmount: number) => Promise<void>;
  joinGame: (roomCode: string, playerName?: string) => Promise<boolean>;
  startGame: () => Promise<void>;
  castVote: (vote: 'transparent' | 'fake') => Promise<void>;
  submitQuestion: (text: string) => Promise<void>;
  voteForQuestion: (questionId: string) => Promise<void>;
  advanceHotTakePhase: () => Promise<void>;
  selectWinner: (playerId: string) => void;
  distributeWinnings: (winnerWallet: string) => Promise<void>;
  distributePredictions: (winnerWallet: string) => Promise<void>;
  forceAdvanceRound: () => Promise<void>;
  hostPickQuestion: (question: string, index: number) => Promise<void>;
  voteForQuestionOption: (optionIndex: number) => Promise<void>;
  raisePot: (amount: number) => Promise<void>;
  sendQuestionsToVote: (questions: string[], indices: number[]) => Promise<void>;
  endGameNow: () => Promise<void>;
  readyUp: () => Promise<void>;
  leaveGame: () => Promise<void>;
  requestLeave: () => void;
  storytellerChoose: (choice: 'truth' | 'fake') => Promise<void>;
  storytellerAdvance: () => Promise<void>;
  leaveRequests: string[];
  approveLeave: (playerWallet: string) => Promise<void>;
  refreshPlayers: () => Promise<void>;
  pollGameState: () => Promise<void>;
  resetGame: () => void;
  simulateAutoPlay: () => void;
  setWalletAdapter: (adapter: WalletAdapter | null) => void;
  placePrediction: (predictedWallet: string, amountSol: number, bettorName: string) => Promise<boolean>;
  createTestGame: (questionMode?: QuestionMode, classicSubMode?: ClassicSubMode) => void;
  testAutoVote: () => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

// ── Helpers ─────────────────────────────────────────────────

/** Pick a random question index that hasn't been used yet */
const pickUniqueQuestionIndex = (poolSize: number, used: number[]): number => {
  if (used.length >= poolSize) {
    return Math.floor(Math.random() * poolSize);
  }
  const available = [];
  for (let i = 0; i < poolSize; i++) {
    if (!used.includes(i)) available.push(i);
  }
  return available[Math.floor(Math.random() * available.length)];
};

const generateRoomCode = (): string => {
  const part1 = Math.floor(100 + Math.random() * 900);
  const part2 = Math.floor(100 + Math.random() * 900);
  return `${part1}-${part2}`;
};

const LAMPORTS_PER_SOL = 1_000_000_000;

function playerRowsToPlayers(rows: PlayerRow[], hostWallet: string): Player[] {
  return rows.map((r) => ({
    id: r.wallet_address,
    name: r.display_name,
    balance: 0,
    isHost: r.wallet_address === hostWallet,
    walletAddress: r.wallet_address,
    isReady: r.is_ready ?? false,
  }));
}

function derivePotAmount(
  players: Player[],
  buyInAmount: number,
  currentPot?: number | null,
  previousPot = 0,
): number {
  if (typeof currentPot === 'number' && Number.isFinite(currentPot)) {
    return currentPot;
  }

  const readyPot = players.filter((player) => player.isReady).length * buyInAmount;
  return Math.max(readyPot, previousPot);
}

// ── Provider ────────────────────────────────────────────────

const STORAGE_KEY = 'transparent_game_state';

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [gameState, setGameState] = useState<GameState | null>(() => {
    // Restore from localStorage on mount
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<PredictionRow[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<string[]>([]);

  const walletRef = useRef<WalletAdapter | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const gameIdRef = useRef<string | null>(null);
  const gameStateRef = useRef<GameState | null>(null);

  const setWalletAdapter = useCallback((adapter: WalletAdapter | null) => {
    walletRef.current = adapter;
  }, []);

  // Keep ref in sync
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // ── Persist gameState to localStorage ──────────────────
  useEffect(() => {
    if (gameState) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [gameState]);

  // ── Subscribe to real-time updates ─────────────────────

  const setupSubscription = useCallback(
    (gameId: string, hostWallet: string) => {
      // Unsubscribe from any previous game
      if (channelRef.current) {
        unsubscribeFromGame(channelRef.current);
      }

      gameIdRef.current = gameId;

      const channel = subscribeToGame(
        gameId,
        // onGameChange
        (game: GameRow) => {
          setGameState((prev) => {
            if (!prev) return prev;
            const questionMode = prev.questionMode;
            let currentQuestion = prev.currentQuestion;

            if (questionMode === 'classic' || questionMode === 'free-for-all') {
              currentQuestion = QUESTIONS[game.current_question_index] || QUESTIONS[0];
            }

            // Reset votes whenever the round advances (syncs all clients)
            const roundChanged = (game.current_round ?? 0) !== (prev.currentRound ?? 0);
            const playerChanged = game.current_hot_seat_player !== prev.currentPlayerInHotSeat;

            return {
              ...prev,
              gameStatus: game.status,
              currentQuestion,
              currentPlayerInHotSeat: game.current_hot_seat_player,
              gamePhase: (game.game_phase as GamePhase) || prev.gamePhase,
              currentRound: game.current_round ?? prev.currentRound,
              currentPot: derivePotAmount(prev.players, prev.buyInAmount, game.current_pot, prev.currentPot),
              questionOptions: game.question_options ?? prev.questionOptions,
              questionPickVotes: game.question_pick_votes ?? prev.questionPickVotes,
              // Clear votes for all clients when round or player changes
              ...(roundChanged || playerChanged ? { votes: {}, voteCount: 0 } : {}),
              // Restore storyteller choice from DB so hot-seat player can't cheat by refreshing
              ...(game.storyteller_choice ? { storytellerChoice: game.storyteller_choice } : {}),
            };
          });
        },
        // onPlayersChange
        (players: PlayerRow[]) => {
          setGameState((prev) => {
            if (!prev) return prev;
            const mapped = playerRowsToPlayers(players, hostWallet);
            return {
              ...prev,
              players: mapped,
              currentPot: derivePotAmount(mapped, prev.buyInAmount, undefined, prev.currentPot),
              totalVotes: mapped.length,
            };
          });
        },
        // onVotesChange — runs on ALL clients, calculates scores when all votes in
        (votes: VoteRow[]) => {
          setGameState((prev) => {
            if (!prev) return prev;
            const voteMap: Record<string, 'transparent' | 'fake'> = {};
            votes.forEach((v) => { voteMap[v.voter_wallet] = v.vote; });

            // Guard: only apply scores if votes belong to the CURRENT round
            // Prevents stale realtime events from corrupting state after round advances
            const voteRound = votes[0]?.round ?? -1;
            const isCurrentRound = voteRound === (prev.currentRound ?? 0);

            const hotSeatWallet = prev.currentPlayerInHotSeat;
            const eligibleVoters = prev.players.filter(p => p.id !== hotSeatWallet).length;
            const votesNeeded = Math.max(eligibleVoters, 1);
            let newScores = prev.scores ?? {};

            if (isCurrentRound && votes.length >= votesNeeded && hotSeatWallet) {
              const transparentVotes = votes.filter(v => v.vote === 'transparent').length;
              const fakeVotes = votes.filter(v => v.vote === 'fake').length;
              const existing = newScores[hotSeatWallet] ?? { transparent: 0, fake: 0, rounds: 0 };
              newScores = {
                ...newScores,
                [hotSeatWallet]: {
                  transparent: existing.transparent + transparentVotes,
                  fake: existing.fake + fakeVotes,
                  rounds: (existing.rounds ?? 0) + 1,
                },
              };
            }

            // If votes are stale (old round), just update the voteMap without overwriting
            if (!isCurrentRound) return { ...prev };

            return { ...prev, votes: voteMap, voteCount: votes.length, scores: newScores };
          });
        },
        // onQuestionsChange (hot-take mode)
        (questions: QuestionSubmissionRow[]) => {
          setGameState((prev) => {
            if (!prev) return prev;
            const mapped: SubmittedQuestion[] = questions.map((q) => ({
              id: q.id,
              text: q.question_text,
              submitterId: q.submitter_wallet,
              votes: q.votes,
            }));
            return {
              ...prev,
              submittedQuestions: mapped,
            };
          });
        },
        // onPredictionsChange — live update prediction bets
        (newPredictions: PredictionRow[]) => {
          setPredictions(newPredictions);
        },
      );

      // Listen for payout distribution (players receive this)
      channel.on('broadcast', { event: 'payout_distributed' }, (payload: any) => {
        const myWallet = walletRef.current?.publicKey?.toBase58();
        if (myWallet && payload?.payload?.payouts) {
          const myPayout = payload.payload.payouts[myWallet];
          if (myPayout && myPayout > 0) {
            setGameState(prev => prev ? {
              ...prev,
              myPayout: myPayout,
              potDistributed: true,
            } : null);
          }
        }
      });

      // Listen for leave requests via broadcast (host receives these)
      channel.on('broadcast', { event: 'leave_request' }, (payload: Record<string, unknown>) => {
        const inner = payload?.payload as Record<string, unknown> | undefined;
        const wallet = inner?.wallet as string | undefined;
        if (wallet) {
          setLeaveRequests(prev => prev.includes(wallet) ? prev : [...prev, wallet]);
        }
      });

      // Listen for host leaving (all players receive this)
      channel.on('broadcast', { event: 'host_leaving' }, () => {
        setGameState(prev => prev ? { ...prev, gameStatus: 'cancelled' as any } : null);
      });

      // Listen for leave approvals (player receives this)
      channel.on('broadcast', { event: 'leave_approved' }, (payload: any) => {
        const approvedWallet = payload?.payload?.wallet;
        const myWallet = walletRef.current?.publicKey?.toBase58();
        if (approvedWallet && approvedWallet === myWallet) {
          // Clean up local state (player will navigate away from WaitingRoomPage)
          if (channelRef.current) {
            unsubscribeFromGame(channelRef.current);
            channelRef.current = null;
          }
          gameIdRef.current = null;
          setGameState(null);
          setError(null);
          setLoading(false);
        }
      });

      channelRef.current = channel;
    },
    [],
  );

  // ── Re-subscribe after page refresh ───────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && !channelRef.current) {
      try {
        const gs = JSON.parse(saved) as GameState;
        if (gs.gameId && gs.gameStatus !== 'gameover') {
          setupSubscription(gs.gameId, gs.hostWallet ?? '');
        }
      } catch { /* ignore */ }
    }
  }, [setupSubscription]);

  // ── Create Game ────────────────────────────────────────

  const createGame = useCallback(
    async (buyIn: number, roomName: string, questionMode: QuestionMode = 'classic', customQuestions?: string[], playerName?: string, payoutMode: PayoutMode = 'winner-takes-all', numQuestions: number = 0, classicSubMode?: ClassicSubMode) => {
      const wallet = walletRef.current;
      if (!wallet) {
        setError('Please connect your wallet first');
        return false;
      }

      setLoading(true);
      setError(null);

      try {
        const roomCode = generateRoomCode();
        const buyInLamports = Math.round(buyIn * LAMPORTS_PER_SOL);

        // 1. Create on-chain
        try {
          await createGameOnChain(wallet, roomName || 'Game Room', buyInLamports);
        } catch (chainErr) {
          console.warn('On-chain creation failed (may already exist or devnet issue):', chainErr);
          // Continue with Supabase — on-chain is optional during dev
        }

        // 2. Create in Supabase
        const game = await createGameInDB({
          room_code: roomCode,
          room_name: roomName || 'Game Room',
          host_wallet: wallet.publicKey.toBase58(),
          buy_in_lamports: buyInLamports,
          question_mode: questionMode,
          custom_questions: questionMode === 'free-for-all' ? (customQuestions ?? null) : null,
          payout_mode: payoutMode,
          num_questions: numQuestions > 0 ? numQuestions : null,
        });

        // 3. Host does NOT join as a player (Kahoot model: host = screen/controller)
        // Players join separately via room code

        // 4. Fetch initial players (will be empty)
        const players = await getPlayersForGame(game.id);

        // 5. Determine first question
        const firstQuestion =
          questionMode === 'exposer'
            ? '' // Will be set during exposer flow
            : QUESTIONS[0];

        // 6. Set state
        setGameState({
          roomCode,
          roomName: roomName || 'Game Room',
          buyInAmount: buyIn,
          players: playerRowsToPlayers(players, wallet.publicKey.toBase58()),
          currentPot: 0,
          gameStatus: 'waiting',
          currentQuestion: firstQuestion,
          currentPlayerInHotSeat: null,
          votes: {},
          voteCount: 0,
          totalVotes: 0,
          winner: null,
          gameId: game.id,
          hostWallet: wallet.publicKey.toBase58(),
          questionMode,
          payoutMode,
          numQuestions: numQuestions > 0 ? numQuestions : 0,
          submittedQuestions: [],
          questionVotes: {},
          gamePhase: undefined,
          currentRound: 0,
          scores: {},
          classicSubMode: questionMode === 'classic' ? (classicSubMode ?? 'all-or-nothing') : undefined,
          stakeVotes: {},
          questionBids: {},
        });

        // 7. Subscribe to real-time updates
        setupSubscription(game.id, wallet.publicKey.toBase58());
        return true;
      } catch (err: any) {
        console.error('Create game error:', err);
        setError(err.message || 'Failed to create game');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [setupSubscription],
  );

  // ── Join Game ──────────────────────────────────────────

  const joinGame = useCallback(
    async (roomCode: string, playerName?: string) => {
      const wallet = walletRef.current;
      if (!wallet) {
        setError('Please connect your wallet first');
        return false;
      }

      setLoading(true);
      setError(null);

      try {
        // 1. Look up game by room code
        const game = await getGameByRoomCode(roomCode);
        if (!game) {
          setError('Game not found');
          setLoading(false);
          return false;
        }

        if (game.status !== 'waiting') {
          setError('Game already started');
          setLoading(false);
          return false;
        }

        // 2. Add player to Supabase (buy-in happens when game starts)
        const walletAddr = wallet.publicKey.toBase58();
        const joinerDisplayName = playerName?.trim() || `${walletAddr.slice(0, 4)}...${walletAddr.slice(-4)}`;
        await addPlayerToDB({
          game_id: game.id,
          wallet_address: walletAddr,
          display_name: joinerDisplayName,
          has_paid: true,
        });

        // 4. Fetch players
        const players = await getPlayersForGame(game.id);
        const buyIn = game.buy_in_lamports / LAMPORTS_PER_SOL;

        // 5. Determine question mode from DB
        const qMode = (game.question_mode as QuestionMode) || 'classic';
        const currentQuestion =
          qMode === 'exposer'
            ? ''
            : QUESTIONS[game.current_question_index] || QUESTIONS[0];

        // 6. Set state
        setGameState({
          roomCode: game.room_code,
          roomName: game.room_name,
          buyInAmount: buyIn,
          players: playerRowsToPlayers(players, game.host_wallet),
          currentPot: players.length * buyIn,
          gameStatus: game.status,
          currentQuestion,
          currentPlayerInHotSeat: game.current_hot_seat_player,
          votes: {},
          voteCount: 0,
          totalVotes: players.length,
          winner: null,
          gameId: game.id,
          hostWallet: game.host_wallet,
          questionMode: qMode,
          payoutMode: (game.payout_mode as PayoutMode) || 'winner-takes-all',
          numQuestions: game.num_questions ?? 0,
          submittedQuestions: [],
          questionVotes: {},
          gamePhase: (game.game_phase as GamePhase) || undefined,
          currentRound: game.current_round ?? 0,
          scores: {},
        });

        // 6. Subscribe
        setupSubscription(game.id, game.host_wallet);
        return true;
      } catch (err: any) {
        console.error('Join game error:', err);
        setError(err.message || 'Failed to join game');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [setupSubscription],
  );

  // ── Start Game (Host only) ─────────────────────────────

  const startGame = useCallback(async () => {
    if (!gameState) return;

    if (gameState.players.length < 2) {
      setError('Need at least 2 players to start');
      return;
    }

    const gid = gameState.gameId;
    if (!gid) {
      setGameState((prev) => (prev ? { ...prev, gameStatus: 'playing', currentPlayerInHotSeat: prev.players[0]?.id ?? null } : null));
      return;
    }

    setLoading(true);
    try {
      const firstPlayer = gameState.players[0]?.id ?? null;
      const questionMode = gameState.questionMode;

      if (questionMode === 'storyteller') {
        // Storyteller mode: hot-seat player gets a prompt, chooses truth/fake
        const { STORYTELLER_PROMPTS } = await import('../types/game');
        const prompt = STORYTELLER_PROMPTS[Math.floor(Math.random() * STORYTELLER_PROMPTS.length)];
        
        await updateGameStatus(gid, {
          status: 'playing',
          current_hot_seat_player: firstPlayer,
          current_question_index: 0,
          game_phase: 'storyteller-prep',
          current_round: 0,
        });

        setGameState((prev) =>
          prev
            ? {
                ...prev,
                gameStatus: 'playing',
                currentPlayerInHotSeat: firstPlayer,
                currentQuestion: prompt,
                gamePhase: 'storyteller-prep',
                currentRound: 0,
                storytellerChoice: null,
                storytellerPrompt: prompt,
              }
            : null,
        );
      } else if (questionMode === 'exposer') {
        // Exposer: start in submitting-questions phase
        await updateGameStatus(gid, {
          status: 'playing',
          current_hot_seat_player: firstPlayer,
          current_question_index: 0,
          game_phase: 'submitting-questions',
          current_round: 0,
        });

        setGameState((prev) =>
          prev
            ? {
                ...prev,
                gameStatus: 'playing',
                currentPlayerInHotSeat: firstPlayer,
                currentQuestion: '',
                gamePhase: 'submitting-questions',
                currentRound: 0,
                submittedQuestions: [],
                questionVotes: {},
                questionBids: {},
              }
            : null,
        );
      } else if (questionMode === 'free-for-all') {
        // Free-for-all: randomly pick a mode for round 1
        const roundModes: ('classic' | 'exposer' | 'storyteller')[] = ['classic', 'exposer', 'storyteller'];
        const firstMode = roundModes[Math.floor(Math.random() * roundModes.length)];

        if (firstMode === 'storyteller') {
          const { STORYTELLER_PROMPTS } = await import('../types/game');
          const prompt = STORYTELLER_PROMPTS[Math.floor(Math.random() * STORYTELLER_PROMPTS.length)];
          await updateGameStatus(gid, {
            status: 'playing',
            current_hot_seat_player: firstPlayer,
            current_question_index: 0,
            game_phase: 'storyteller-prep',
            current_round: 0,
          });
          setGameState((prev) =>
            prev ? {
              ...prev, gameStatus: 'playing', currentPlayerInHotSeat: firstPlayer,
              currentQuestion: prompt, gamePhase: 'storyteller-prep', currentRound: 0,
              storytellerChoice: null, storytellerPrompt: prompt,
              currentRoundMode: 'storyteller',
            } : null,
          );
        } else if (firstMode === 'exposer') {
          await updateGameStatus(gid, {
            status: 'playing',
            current_hot_seat_player: firstPlayer,
            current_question_index: 0,
            game_phase: 'submitting-questions',
            current_round: 0,
          });
          setGameState((prev) =>
            prev ? {
              ...prev, gameStatus: 'playing', currentPlayerInHotSeat: firstPlayer,
              currentQuestion: '', gamePhase: 'submitting-questions', currentRound: 0,
              submittedQuestions: [], questionVotes: {}, questionBids: {},
              currentRoundMode: 'exposer',
            } : null,
          );
        } else {
          // classic — auto-pick question
          const qIdx = pickUniqueQuestionIndex(QUESTIONS.length, []);
          await updateGameStatus(gid, {
            status: 'playing',
            current_hot_seat_player: firstPlayer,
            current_question_index: qIdx,
            game_phase: 'answering',
            current_round: 0,
          });
          setGameState((prev) =>
            prev ? {
              ...prev, gameStatus: 'playing', currentPlayerInHotSeat: firstPlayer,
              currentQuestion: QUESTIONS[qIdx], gamePhase: 'answering', currentRound: 0,
              usedQuestionIndices: [qIdx],
              currentRoundMode: 'classic',
            } : null,
          );
        }
      } else {
        // Classic — auto-pick a random question and go straight to answering
        const qIdx = pickUniqueQuestionIndex(QUESTIONS.length, []);
        await updateGameStatus(gid, {
          status: 'playing',
          current_hot_seat_player: firstPlayer,
          current_question_index: qIdx,
          game_phase: 'answering',
          current_round: 0,
        });

        setGameState((prev) =>
          prev
            ? {
                ...prev,
                gameStatus: 'playing',
                currentPlayerInHotSeat: firstPlayer,
                currentQuestion: QUESTIONS[qIdx],
                gamePhase: 'answering',
                currentRound: 0,
                usedQuestionIndices: [qIdx],
              }
            : null,
        );
      }
    } catch (err: any) {
      console.error('Start game error:', err);
      setError(err.message || 'Failed to start game');
    } finally {
      setLoading(false);
    }
  }, [gameState]);

  // ── Cast Vote ──────────────────────────────────────────

  const castVote = useCallback(
    async (vote: 'transparent' | 'fake') => {
      if (!gameState) return;
      const wallet = walletRef.current;
      const isTestMode = gameState.roomCode === '000-000';
      const myWalletId = isTestMode ? 'test-host' : wallet?.publicKey?.toBase58();
      if (!myWalletId) return;

      const gid = gameState.gameId;
      if (!gid) {
        // Fallback for offline/test mode
        setGameState((prev) => {
          if (!prev) return null;
          const newVotes = { ...prev.votes, [myWalletId]: vote };
          const count = Object.keys(newVotes).length;
          return { ...prev, votes: newVotes, voteCount: count };
        });
        return;
      }

      try {
        // Use currentRound for accurate round tracking across all question modes
        const round = gameState.currentRound ?? 0;

        await insertVote({
          game_id: gid,
          round,
          voter_wallet: wallet.publicKey.toBase58(),
          vote,
        });

        // Update locally for immediate feedback
        setGameState((prev) => {
          if (!prev) return null;
          const newVotes = { ...prev.votes, [wallet.publicKey.toBase58()]: vote };
          return { ...prev, votes: newVotes, voteCount: Object.keys(newVotes).length };
        });

        // Check if all votes are in (exclude the hot seat player from voting on themselves)
        const hotSeatWallet = gameState.currentPlayerInHotSeat;
        const eligibleVoters = gameState.players.filter((p) => p.id !== hotSeatWallet).length;
        const allVotes = await getVotesForRound(gid, round);
        const votesNeeded = eligibleVoters > 0 ? eligibleVoters : gameState.players.length;

        if (allVotes.length >= votesNeeded) {
          // Scores are calculated in onVotesChange for all clients
          // Advance to next player or end game
          const currentIdx = gameState.players.findIndex((p) => p.id === hotSeatWallet);
          const totalRounds = gameState.numQuestions > 0 ? gameState.numQuestions : gameState.players.length;
          const nextRoundNum = round + 1;

          if (nextRoundNum >= totalRounds) {
            // All rounds done — game over
            await updateGameStatus(gid, { status: 'gameover' });
            setGameState((prev) => (prev ? { ...prev, gameStatus: 'gameover' } : null));
          } else {
            // Next player's turn (cycle through players)
            const nextPlayerIdx = (currentIdx + 1) % gameState.players.length;
            const nextPlayer = gameState.players[nextPlayerIdx];
            const nextRound = round + 1;
            // Auto-pick next question
            const usedIdxs = gameState.usedQuestionIndices || [];
            const nextQIdx = pickUniqueQuestionIndex(QUESTIONS.length, usedIdxs);
            await updateGameStatus(gid, {
              current_hot_seat_player: nextPlayer.id,
              current_question_index: nextQIdx,
              current_round: nextRound,
              game_phase: 'answering',
            });

            setGameState((prev) =>
              prev
                ? {
                    ...prev,
                    currentPlayerInHotSeat: nextPlayer.id,
                    currentQuestion: QUESTIONS[nextQIdx],
                    currentRound: nextRound,
                    votes: {},
                    voteCount: 0,
                    gamePhase: 'answering',
                    usedQuestionIndices: [...usedIdxs, nextQIdx],
                  }
                : null,
            );
          }
        }
      } catch (err: any) {
        console.error('Vote error:', err);
        setError(err.message || 'Failed to cast vote');
      }
    },
    [gameState],
  );

  // ── Submit Question (Hot-Take Mode) ─────────────────────

  const submitQuestion = useCallback(
    async (text: string) => {
      if (!gameState) return;
      const wallet = walletRef.current;
      const isTestMode = gameState.roomCode === '000-000';
      const myWalletId = isTestMode ? 'test-host' : wallet?.publicKey?.toBase58();
      if (!myWalletId) return;

      const gid = gameState.gameId;

      if (!gid) {
        // Local-only fallback for test mode
        setGameState(prev => {
          if (!prev) return null;
          const newQ: SubmittedQuestion = { id: `test-q-${Date.now()}`, text, submitter: myWalletId, votes: 0 };
          return { ...prev, submittedQuestions: [...(prev.submittedQuestions ?? []), newQ] };
        });
        return;
      }

      try {
        const round = gameState.currentRound ?? 0;
        await submitQuestionToDB({
          game_id: gid,
          round,
          submitter_wallet: myWalletId,
          question_text: text,
        });
      } catch (err: any) {
        console.error('Submit question error:', err);
        setError(err.message || 'Failed to submit question');
      }
    },
    [gameState],
  );

  // ── Vote for Question (Hot-Take Mode) ──────────────────

  const voteForQuestion = useCallback(
    async (questionId: string) => {
      if (!gameState) return;
      const wallet = walletRef.current;
      const isTestMode = gameState.roomCode === '000-000';
      const myWalletId = isTestMode ? 'test-host' : wallet?.publicKey?.toBase58();
      if (!myWalletId) return;

      const gid = gameState.gameId;

      if (gid) {
        try {
          await voteForQuestionInDB(questionId);
        } catch (err: any) {
          console.error('Vote for question error:', err);
          setError(err.message || 'Failed to vote for question');
          return;
        }
      }

      setGameState((prev) => {
        if (!prev) return null;
        // Also increment the question's vote count locally
        const updatedQuestions = (prev.submittedQuestions ?? []).map(q =>
          q.id === questionId ? { ...q, votes: q.votes + 1 } : q
        );
        return {
          ...prev,
          submittedQuestions: updatedQuestions,
          questionVotes: {
            ...(prev.questionVotes ?? {}),
            [myWalletId]: questionId,
          },
        };
      });
    },
    [gameState],
  );

  // ── Advance Hot-Take Phase ─────────────────────────────

  const advanceHotTakePhase = useCallback(async () => {
    if (!gameState) return;
    const gid = gameState.gameId;

    const currentPhase = gameState.gamePhase;

    try {
      if (currentPhase === 'submitting-questions') {
        // Move to voting-question
        if (gid) await updateGameStatus(gid, { game_phase: 'voting-question' });
        setGameState((prev) =>
          prev ? { ...prev, gamePhase: 'voting-question' } : null,
        );
      } else if (currentPhase === 'voting-question') {
        // Find the winning question (most votes)
        const questions = gameState.submittedQuestions ?? [];
        const winner = questions.reduce(
          (best, q) => (q.votes > best.votes ? q : best),
          questions[0],
        );
        const winningText = winner?.text || 'No question submitted';

        if (gid) await updateGameStatus(gid, { game_phase: 'answering' });
        setGameState((prev) =>
          prev
            ? { ...prev, gamePhase: 'answering', currentQuestion: winningText }
            : null,
        );
      } else if (currentPhase === 'answering') {
        // Move to honesty voting
        if (gid) await updateGameStatus(gid, { game_phase: 'voting-honesty' });
        setGameState((prev) =>
          prev ? { ...prev, gamePhase: 'voting-honesty' } : null,
        );
      } else if (currentPhase === 'voting-honesty') {
        // Move to next round / next player
        const currentIdx = gameState.players.findIndex(
          (p) => p.id === gameState.currentPlayerInHotSeat,
        );
        const nextPlayerIdx = (currentIdx + 1) % gameState.players.length;
        const nextPlayer = gameState.players[nextPlayerIdx]?.id ?? null;
        const nextRound = (gameState.currentRound ?? 0) + 1;
        const totalRounds = gameState.numQuestions > 0 ? gameState.numQuestions : gameState.players.length;

        if (nextRound >= totalRounds) {
          if (gid) await updateGameStatus(gid, { status: 'gameover' });
          setGameState((prev) => (prev ? { ...prev, gameStatus: 'gameover' } : null));
        } else if (gameState.questionMode === 'free-for-all') {
          // Free-for-all: pick random mode for next round
          const roundModes: ('classic' | 'exposer' | 'storyteller')[] = ['classic', 'exposer', 'storyteller'];
          const nextMode = roundModes[Math.floor(Math.random() * roundModes.length)];

          if (nextMode === 'storyteller') {
            const { STORYTELLER_PROMPTS } = await import('../types/game');
            const prompt = STORYTELLER_PROMPTS[Math.floor(Math.random() * STORYTELLER_PROMPTS.length)];
            if (gid) await updateGameStatus(gid, { current_round: nextRound, current_hot_seat_player: nextPlayer, game_phase: 'storyteller-prep', storyteller_choice: null });
            setGameState(prev => prev ? { ...prev, currentRound: nextRound, currentPlayerInHotSeat: nextPlayer, currentQuestion: prompt, storytellerPrompt: prompt, storytellerChoice: null, gamePhase: 'storyteller-prep', votes: {}, voteCount: 0, stakeVotes: {}, currentRoundMode: 'storyteller' } : null);
          } else if (nextMode === 'exposer') {
            if (gid) await updateGameStatus(gid, { game_phase: 'submitting-questions', current_hot_seat_player: nextPlayer, current_round: nextRound });
            setGameState(prev => prev ? { ...prev, gamePhase: 'submitting-questions', currentPlayerInHotSeat: nextPlayer, currentRound: nextRound, currentQuestion: '', submittedQuestions: [], questionVotes: {}, questionBids: {}, votes: {}, voteCount: 0, currentRoundMode: 'exposer' } : null);
          } else {
            const usedIdxs = gameState.usedQuestionIndices || [];
            const nextQIdx = pickUniqueQuestionIndex(QUESTIONS.length, usedIdxs);
            if (gid) await updateGameStatus(gid, { current_round: nextRound, current_hot_seat_player: nextPlayer, game_phase: 'answering', current_question_index: nextQIdx });
            setGameState(prev => prev ? { ...prev, currentRound: nextRound, currentPlayerInHotSeat: nextPlayer, currentQuestion: QUESTIONS[nextQIdx], gamePhase: 'answering', votes: {}, voteCount: 0, currentRoundMode: 'classic', usedQuestionIndices: [...usedIdxs, nextQIdx] } : null);
          }
        } else {
          // Pure exposer mode — next round is always exposer
          if (gid) {
            await updateGameStatus(gid, {
              game_phase: 'submitting-questions',
              current_hot_seat_player: nextPlayer,
              current_round: nextRound,
            });
          }
          setGameState((prev) =>
            prev
              ? {
                  ...prev,
                  gamePhase: 'submitting-questions',
                  currentPlayerInHotSeat: nextPlayer,
                  currentRound: nextRound,
                  currentQuestion: '',
                  submittedQuestions: [],
                  questionVotes: {},
                  questionBids: {},
                  votes: {},
                  voteCount: 0,
                }
              : null,
          );
        }
      }
    } catch (err: any) {
      console.error('Advance phase error:', err);
      setError(err.message || 'Failed to advance phase');
    }
  }, [gameState]);

  // ── Select Winner ──────────────────────────────────────

  const selectWinner = useCallback((playerId: string) => {
    setGameState((prev) => (prev ? { ...prev, winner: playerId } : null));
  }, []);

  // ── Distribute Winnings ────────────────────────────────

  const distributeWinnings = useCallback(
    async (winnerWallet: string) => {
      const wallet = walletRef.current;
      if (!wallet || !gameState) return;

      setLoading(true);
      try {
        const gid = (gameState as any).gameId;
        const hostWallet = (gameState as any).hostWallet;
        const isHost = wallet.publicKey.toBase58() === hostWallet;

        // Only attempt on-chain distribution if there's an actual buy-in and we're the host
        if (gameState.buyInAmount > 0 && isHost) {
          try {
            const hostPubkey = new PublicKey(hostWallet);
            const [gamePDA] = deriveGamePDA(hostPubkey, gameState.roomName);

            if (gameState.payoutMode === 'winner-takes-all') {
              // Winner gets entire pot
              const winnerPubkey = new PublicKey(winnerWallet);
              const potLamports = Math.round(gameState.currentPot * LAMPORTS_PER_SOL);
              if (USE_ESCROW) {
                // Trustless: distribute from escrow PDA
                await distributeEscrow(wallet, gamePDA, winnerPubkey, potLamports);
              } else {
                // Direct transfer via MagicBlock with fallback
                try {
                  await distributeViaMagicBlock(wallet, winnerPubkey, potLamports);
                } catch (mbErr) {
                  console.warn('[MagicBlock] ER distribute failed, falling back:', mbErr);
                  await distributeOnChain(wallet, gamePDA, winnerPubkey, potLamports);
                }
              }
            } else if (gameState.payoutMode === 'split-pot') {
              // Split pot: each player gets payout based on honesty scores
              // Host is pot holder only — exclude from payout calc
              const playerScores: Record<string, any> = {};
              const allScores = gameState.scores ?? {};
              for (const [w, s] of Object.entries(allScores)) {
                if (w !== hostWallet) playerScores[w] = s;
              }
              const totalRounds = gameState.numQuestions > 0 ? gameState.numQuestions : gameState.players.length;
              const payouts = calculateSplitPayouts(playerScores, gameState.buyInAmount, totalRounds);

              // Send each player their share — host sends ALL pot money out
              for (const [playerWallet, amountSol] of Object.entries(payouts)) {
                if (amountSol <= 0) continue;
                const lamports = Math.round(amountSol * LAMPORTS_PER_SOL);
                try {
                  const playerPubkey = new PublicKey(playerWallet);
                  if (USE_ESCROW) {
                    await distributeEscrow(wallet, gamePDA, playerPubkey, lamports);
                  } else {
                    try {
                      await distributeViaMagicBlock(wallet, playerPubkey, lamports);
                    } catch (mbErr) {
                      console.warn('[MagicBlock] ER split payout failed, falling back:', mbErr);
                      await distributeOnChain(wallet, gamePDA, playerPubkey, lamports);
                    }
                  }
                } catch (sendErr) {
                  console.warn(`[distribute] Failed to send to ${playerWallet}:`, sendErr);
                }
              }

              // Broadcast split results — computed once, used for broadcast
              if (channelRef.current) {
                channelRef.current.send({
                  type: 'broadcast',
                  event: 'payout_distributed',
                  payload: { mode: 'split-pot', payouts },
                });
              }
            }

            // Broadcast winner-takes-all payout
            if (gameState.payoutMode === 'winner-takes-all' && channelRef.current) {
              channelRef.current.send({
                type: 'broadcast',
                event: 'payout_distributed',
                payload: {
                  mode: 'winner-takes-all',
                  payouts: { [winnerWallet]: gameState.currentPot },
                },
              });
            }
          } catch (chainErr) {
            console.warn('On-chain distribution failed (non-fatal):', chainErr);
          }
        }

        if (gid) await updateGameStatus(gid, { status: 'gameover' });

        setGameState((prev) =>
          prev ? { ...prev, gameStatus: 'gameover', winner: winnerWallet } : null,
        );

        // Record persistent player stats (non-fatal)
        try {
          const allScores = gameState.scores ?? {};
          const hostW = (gameState as any).hostWallet ?? '';
          const isSplit = gameState.payoutMode === 'split-pot';
          const totalR = gameState.numQuestions > 0 ? gameState.numQuestions : gameState.players.length;
          const playerScoresForCalc: Record<string, any> = {};
          for (const [w, s] of Object.entries(allScores)) {
            if (w !== hostW) playerScoresForCalc[w] = s;
          }
          const payoutsMap = isSplit
            ? calculateSplitPayouts(playerScoresForCalc, gameState.buyInAmount, totalR)
            : { [winnerWallet]: gameState.currentPot };

          for (const player of gameState.players) {
            if (player.id === hostW) continue; // host isn't a player
            const score = allScores[player.id] ?? { transparent: 0, fake: 0, rounds: 0 };
            const payout = payoutsMap[player.id] ?? 0;
            const net = payout - gameState.buyInAmount;
            await upsertPlayerStats(player.id, player.name, {
              games: 1,
              solWon: Math.max(0, net),
              solLost: Math.max(0, -net),
              transparentVotes: score.transparent,
              fakeVotes: score.fake,
            });
          }
        } catch (statsErr) {
          console.warn('[stats] Failed to record game stats:', statsErr);
        }
      } catch (err: any) {
        console.error('Distribute error:', err);
        setError(err.message || 'Failed to distribute winnings');
      } finally {
        setLoading(false);
      }
    },
    [gameState],
  );

  // ── Host Pick Question ─────────────────────────────────

  const hostPickQuestion = useCallback(async (question: string, index: number) => {
    if (!gameState) return;
    const gid = gameState.gameId;

    if (gid) {
      await updateGameStatus(gid, {
        current_question_index: index >= 0 ? index : 0,
        game_phase: 'answering',
      });
    }

    setGameState((prev) =>
      prev
        ? {
            ...prev,
            currentQuestion: question,
            gamePhase: 'answering',
            usedQuestionIndices: index >= 0
              ? [...(prev.usedQuestionIndices || []), index]
              : prev.usedQuestionIndices || [],
          }
        : null,
    );
  }, [gameState]);

  // ── Send Questions to Player Vote ──────────────────────

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const sendQuestionsToVote = useCallback(async (questions: string[], _indices: number[]) => {
    if (!gameState) return;
    const gid = gameState.gameId;

    if (gid) {
      await updateGameStatus(gid, {
        game_phase: 'player-voting',
        question_options: questions,
      });
    }

    setGameState((prev) =>
      prev
        ? {
            ...prev,
            gamePhase: 'player-voting',
            questionOptions: questions,
            questionPickVotes: {},
          }
        : null,
    );
  }, [gameState]);

  // ── Vote for Question Option (player voting mode) ──────

  const voteForQuestionOption = useCallback(async (optionIndex: number) => {
    if (!gameState) return;
    const myWallet = walletRef.current?.publicKey?.toBase58() ?? '';
    if (!myWallet) return;

    setGameState((prev) =>
      prev
        ? {
            ...prev,
            questionPickVotes: {
              ...(prev.questionPickVotes || {}),
              [myWallet]: optionIndex,
            },
          }
        : null,
    );

    // If using Supabase, persist the vote
    const gid = gameState.gameId;
    if (gid) {
      try {
        await updateGameStatus(gid, {
          question_pick_votes: {
            ...(gameState.questionPickVotes || {}),
            [myWallet]: optionIndex,
          },
        });
      } catch (e) {
        console.error('Failed to persist question vote:', e);
      }
    }
  }, [gameState]);

  // ── Raise the Pot ─────────────────────────────────────

  const raisePot = useCallback(async (amount: number) => {
    if (!gameState || amount <= 0) return;

    const newPot = (gameState.currentPot || 0) + amount;

    setGameState((prev) =>
      prev
        ? {
            ...prev,
            currentPot: newPot,
          }
        : null,
    );

    // If using Supabase, persist the pot increase
    const gid = gameState.gameId;
    if (gid) {
      try {
        await updateGameStatus(gid, {
          current_pot: newPot,
        });
      } catch (e) {
        console.error('Failed to raise pot:', e);
      }
    }
  }, [gameState]);

  // ── Force Advance Round (host skip) ───────────────────

  const forceAdvanceRound = useCallback(async () => {
    if (!gameState) return;
    const gid = gameState.gameId;
    const hotSeatWallet = gameState.currentPlayerInHotSeat;
    const currentIdx = gameState.players.findIndex(p => p.id === hotSeatWallet);
    const nextRoundNum = (gameState.currentRound ?? 0) + 1;
    const totalRounds = gameState.numQuestions > 0 ? gameState.numQuestions : gameState.players.length;

    try {
      if (nextRoundNum >= totalRounds) {
        if (gid) await updateGameStatus(gid, { status: 'gameover' });
        setGameState(prev => prev ? { ...prev, gameStatus: 'gameover' } : null);
      } else {
        const nextPlayerIdx = (currentIdx + 1) % gameState.players.length;
        const nextPlayer = gameState.players[nextPlayerIdx];
        const nextRound = (gameState.currentRound ?? 0) + 1;
        const usedIdxs = gameState.usedQuestionIndices || [];
        const nextQIdx = pickUniqueQuestionIndex(QUESTIONS.length, usedIdxs);
        if (gid) {
          await updateGameStatus(gid, {
            current_hot_seat_player: nextPlayer.id,
            current_question_index: nextQIdx,
            current_round: nextRound,
            game_phase: 'answering',
          });
        }
        setGameState(prev => prev ? {
          ...prev,
          currentPlayerInHotSeat: nextPlayer.id,
          currentQuestion: QUESTIONS[nextQIdx],
          currentRound: nextRound,
          votes: {}, voteCount: 0,
          gamePhase: 'answering',
          usedQuestionIndices: [...usedIdxs, nextQIdx],
        } : null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to advance round');
    }
  }, [gameState]);

  // ── End Game Now ───────────────────────────────────────

    // ── Storyteller Mode ──────────────────────────────────

  const storytellerChoose = useCallback(async (choice: 'truth' | 'fake') => {
    if (!gameState) return;
    const gid = gameState.gameId;

    setGameState(prev => prev ? { ...prev, storytellerChoice: choice, gamePhase: 'storyteller-telling' } : null);

    if (gid) {
      try {
        await updateGameStatus(gid, { game_phase: 'storyteller-telling', storyteller_choice: choice });
      } catch {
        // Column may not exist in older deploys — just advance the phase
        await updateGameStatus(gid, { game_phase: 'storyteller-telling' });
      }
    }
  }, [gameState]);

  const storytellerAdvance = useCallback(async () => {
    if (!gameState) return;
    const gid = gameState.gameId;
    const currentPhase = gameState.gamePhase;

    if (currentPhase === 'storyteller-telling') {
      // Move to voting
      setGameState(prev => prev ? { ...prev, gamePhase: 'storyteller-voting', votes: {}, voteCount: 0 } : null);
      if (gid) await updateGameStatus(gid, { game_phase: 'storyteller-voting' });

    } else if (currentPhase === 'storyteller-voting') {
      // Move to reveal
      setGameState(prev => prev ? { ...prev, gamePhase: 'storyteller-reveal' } : null);
      if (gid) await updateGameStatus(gid, { game_phase: 'storyteller-reveal' });

    } else if (currentPhase === 'storyteller-reveal') {
      // Calculate storyteller stake payouts before advancing
      const storytellerWallet = gameState.currentPlayerInHotSeat;
      const choice = gameState.storytellerChoice;
      const stakes = gameState.stakeVotes ?? {};
      if (storytellerWallet && choice && Object.keys(stakes).length > 0) {
        const roundPayouts = calculateStorytellerRoundPayout(stakes, choice, storytellerWallet);
        // Apply payout adjustments to scores
        setGameState(prev => {
          if (!prev) return null;
          const newScores = { ...(prev.scores ?? {}) };
          for (const [wallet, payout] of Object.entries(roundPayouts)) {
            const existing = newScores[wallet] ?? { transparent: 0, fake: 0, rounds: 0 };
            if (payout > 0) {
              newScores[wallet] = { ...existing, transparent: existing.transparent + 1, rounds: existing.rounds + 1 };
            } else if (payout < 0) {
              newScores[wallet] = { ...existing, fake: existing.fake + 1, rounds: existing.rounds + 1 };
            }
          }
          return { ...prev, scores: newScores };
        });
      }

      // Score and advance to next round
      const { STORYTELLER_PROMPTS } = await import('../types/game');
      const nextRound = (gameState.currentRound ?? 0) + 1;
      const totalRounds = gameState.numQuestions > 0 ? gameState.numQuestions : gameState.players.length;

      if (nextRound >= totalRounds) {
        // Game over
        setGameState(prev => prev ? { ...prev, gameStatus: 'gameover' } : null);
        if (gid) await updateGameStatus(gid, { status: 'gameover' });
      } else {
        const nextPlayerIndex = nextRound % gameState.players.length;
        const nextPlayer = gameState.players[nextPlayerIndex]?.id ?? null;

        // If free-for-all, pick a random mode for the next round
        if (gameState.questionMode === 'free-for-all') {
          const roundModes: ('classic' | 'exposer' | 'storyteller')[] = ['classic', 'exposer', 'storyteller'];
          const nextMode = roundModes[Math.floor(Math.random() * roundModes.length)];

          if (nextMode === 'storyteller') {
            const nextPrompt = STORYTELLER_PROMPTS[Math.floor(Math.random() * STORYTELLER_PROMPTS.length)];
            setGameState(prev => prev ? {
              ...prev, currentRound: nextRound, currentPlayerInHotSeat: nextPlayer,
              currentQuestion: nextPrompt, storytellerPrompt: nextPrompt, storytellerChoice: null,
              gamePhase: 'storyteller-prep', votes: {}, voteCount: 0, stakeVotes: {},
              currentRoundMode: 'storyteller',
            } : null);
            if (gid) await updateGameStatus(gid, { current_round: nextRound, current_hot_seat_player: nextPlayer, game_phase: 'storyteller-prep', storyteller_choice: null });
          } else if (nextMode === 'exposer') {
            setGameState(prev => prev ? {
              ...prev, currentRound: nextRound, currentPlayerInHotSeat: nextPlayer,
              currentQuestion: '', gamePhase: 'submitting-questions', votes: {}, voteCount: 0,
              submittedQuestions: [], questionVotes: {}, questionBids: {},
              currentRoundMode: 'exposer',
            } : null);
            if (gid) await updateGameStatus(gid, { current_round: nextRound, current_hot_seat_player: nextPlayer, game_phase: 'submitting-questions' });
          } else {
            const usedIdxs = gameState.usedQuestionIndices || [];
            const nextQIdx = pickUniqueQuestionIndex(QUESTIONS.length, usedIdxs);
            setGameState(prev => prev ? {
              ...prev, currentRound: nextRound, currentPlayerInHotSeat: nextPlayer,
              currentQuestion: QUESTIONS[nextQIdx], gamePhase: 'answering', votes: {}, voteCount: 0,
              usedQuestionIndices: [...usedIdxs, nextQIdx],
              currentRoundMode: 'classic',
            } : null);
            if (gid) await updateGameStatus(gid, { current_round: nextRound, current_hot_seat_player: nextPlayer, game_phase: 'answering', current_question_index: nextQIdx });
          }
        } else {
          // Pure storyteller mode — next round is always storyteller
          const nextPrompt = STORYTELLER_PROMPTS[Math.floor(Math.random() * STORYTELLER_PROMPTS.length)];
          setGameState(prev => prev ? {
            ...prev, currentRound: nextRound, currentPlayerInHotSeat: nextPlayer,
            currentQuestion: nextPrompt, storytellerPrompt: nextPrompt, storytellerChoice: null,
            gamePhase: 'storyteller-prep', votes: {}, voteCount: 0, stakeVotes: {},
          } : null);
          if (gid) await updateGameStatus(gid, { current_round: nextRound, current_hot_seat_player: nextPlayer, game_phase: 'storyteller-prep', storyteller_choice: null });
        }
      }
    }
  }, [gameState]);

  // ── Skip Question (Classic Mode — hot seat player skips) ──

  const skipQuestion = useCallback(async () => {
    if (!gameState) return;
    const gid = gameState.gameId;

    const hotSeatWallet = gameState.currentPlayerInHotSeat;
    if (!hotSeatWallet) return;

    const subMode = gameState.classicSubMode ?? 'all-or-nothing';
    const buyIn = gameState.buyInAmount;
    let penalty = 0;

    if (subMode === 'all-or-nothing') {
      penalty = buyIn; // lose entire buy-in
    } else {
      penalty = buyIn * 0.15; // chip-away: lose 15% per skip
    }

    // Update scores to reflect the skip penalty
    const newScores = { ...(gameState.scores ?? {}) };
    const existing = newScores[hotSeatWallet] ?? { transparent: 0, fake: 0, rounds: 0 };
    newScores[hotSeatWallet] = {
      transparent: existing.transparent,
      fake: existing.fake + 1, // count skip as a "fake" vote against them
      rounds: existing.rounds + 1,
    };

    // Advance to next round
    const currentIdx = gameState.players.findIndex(p => p.id === hotSeatWallet);
    const nextRound = (gameState.currentRound ?? 0) + 1;
    const totalRounds = gameState.numQuestions > 0 ? gameState.numQuestions : gameState.players.length;

    // Penalty goes into the pot
    const newPot = (gameState.currentPot || 0) + penalty;

    if (nextRound >= totalRounds) {
      if (gid) await updateGameStatus(gid, { status: 'gameover', current_pot: newPot });
      setGameState(prev => prev ? { ...prev, gameStatus: 'gameover', scores: newScores, currentPot: newPot } : null);
    } else {
      const nextPlayerIdx = (currentIdx + 1) % gameState.players.length;
      const nextPlayer = gameState.players[nextPlayerIdx];
      const usedIdxs = gameState.usedQuestionIndices || [];
      const nextQIdx = pickUniqueQuestionIndex(QUESTIONS.length, usedIdxs);
      if (gid) {
        await updateGameStatus(gid, {
          current_hot_seat_player: nextPlayer.id,
          current_question_index: nextQIdx,
          current_round: nextRound,
          game_phase: 'answering',
          current_pot: newPot,
        });
      }
      setGameState(prev => prev ? {
        ...prev,
        currentPlayerInHotSeat: nextPlayer.id,
        currentQuestion: QUESTIONS[nextQIdx],
        currentRound: nextRound,
        votes: {}, voteCount: 0,
        gamePhase: 'answering',
        scores: newScores,
        currentPot: newPot,
        usedQuestionIndices: [...usedIdxs, nextQIdx],
      } : null);
    }
  }, [gameState]);

  // ── Bid on Question (Exposer Mode) ──

  const bidOnQuestion = useCallback(async (questionId: string, amount: number) => {
    if (!gameState) return;
    const wallet = walletRef.current;
    const isTestMode = gameState.roomCode === '000-000';
    const myWalletId = isTestMode ? 'test-host' : wallet?.publicKey?.toBase58();
    if (!myWalletId) return;

    const myWallet = myWalletId;
    const currentBids = gameState.questionBids ?? {};
    const questionBids = currentBids[questionId] ?? [];

    setGameState(prev => {
      if (!prev) return null;
      const bids = { ...(prev.questionBids ?? {}) };
      bids[questionId] = [...(bids[questionId] ?? []), { wallet: myWallet, amount }];
      return { ...prev, questionBids: bids };
    });

    // Also increment the question's vote count by bid amount (higher bids = more weight)
    // The question with highest total bids wins
    try {
      await voteForQuestionInDB(questionId);
    } catch {
      // non-fatal
    }
  }, [gameState]);

  // ── Cast Stake Vote (Storyteller Mode — vote with your money) ──

  const castStakeVote = useCallback(async (vote: 'transparent' | 'fake', stakeAmount: number) => {
    if (!gameState) return;
    const wallet = walletRef.current;
    const isTestMode = gameState.roomCode === '000-000';
    const myWalletId = isTestMode ? 'test-host' : wallet?.publicKey?.toBase58();
    if (!myWalletId) return;

    const myWallet = myWalletId;

    setGameState(prev => {
      if (!prev) return null;
      const newStakeVotes = { ...(prev.stakeVotes ?? {}) };
      newStakeVotes[myWallet] = { vote, stake: stakeAmount };
      return {
        ...prev,
        stakeVotes: newStakeVotes,
        votes: { ...prev.votes, [myWallet]: vote },
        voteCount: Object.keys(prev.votes).length + (prev.votes[myWallet] ? 0 : 1),
      };
    });

    // Also record in DB as a regular vote for realtime sync
    const gid = gameState.gameId;
    if (gid) {
      try {
        const round = gameState.currentRound ?? 0;
        await insertVote({
          game_id: gid,
          round,
          voter_wallet: myWallet,
          vote,
        });
      } catch (err: any) {
        console.error('Stake vote error:', err);
      }
    }
  }, [gameState]);

  const endGameNow = useCallback(async () => {
    const gid = gameState?.gameId;
    if (gid) {
      try { await updateGameStatus(gid, { status: 'gameover' }); } catch { /* ignore */ }
    }
    setGameState(prev => prev ? { ...prev, gameStatus: 'gameover' } : null);
  }, [gameState?.gameId]);

  // ── Refresh Players + Game (manual fallback if realtime fails) ──

  const refreshPlayers = useCallback(async () => {
    const gameId = gameIdRef.current;
    if (!gameId) return;
    try {
      const players = await getPlayersForGame(gameId);

      // Also refresh game status so joiners detect when host starts
      const game = await supabase.from('games').select('*').eq('id', gameId).single();

      setGameState(prev => {
        if (!prev) return prev;
        const hostWallet = prev.hostWallet ?? '';
        const mapped = playerRowsToPlayers(players, hostWallet);
        const gameData = game.data;
        return {
          ...prev,
          players: mapped,
          currentPot: derivePotAmount(mapped, prev.buyInAmount, gameData?.current_pot, prev.currentPot),
          totalVotes: mapped.length,
          // Sync game status from DB
          ...(gameData ? {
            gameStatus: gameData.status,
            currentPlayerInHotSeat: gameData.current_hot_seat_player,
            gamePhase: gameData.game_phase as GamePhase || prev.gamePhase,
            currentRound: gameData.current_round ?? prev.currentRound,
            questionOptions: gameData.question_options ?? prev.questionOptions,
            questionPickVotes: gameData.question_pick_votes ?? prev.questionPickVotes,
          } : {}),
        };
      });
    } catch (err) {
      console.error('refreshPlayers error:', err);
    }
  }, []);

  // ── Poll Game State (master fallback for dead Realtime) ──

  const pollGameState = useCallback(async () => {
    const gameId = gameIdRef.current;
    if (!gameId) return;
    try {
      // Fetch game, players, and votes for current round in parallel
      const [gameRes, playersRes] = await Promise.all([
        supabase.from('games').select('*').eq('id', gameId).single(),
        getPlayersForGame(gameId),
      ]);

      const game = gameRes.data;
      if (!game) return;

      // Fetch votes — current round during play, ALL rounds on game over
      const currentRound = game.current_round ?? 0;
      let votesRes: VoteRow[];
      let allVotes: VoteRow[] | null = null;
      if (game.status === 'gameover') {
        const { data } = await supabase.from('votes').select('*').eq('game_id', gameId).order('round', { ascending: true });
        allVotes = (data ?? []) as VoteRow[];
        votesRes = allVotes.filter(v => v.round === currentRound);
      } else {
        votesRes = await getVotesForRound(gameId, currentRound);
      }

      setGameState(prev => {
        if (!prev) return prev;
        const hostWallet = prev.hostWallet ?? '';
        const mapped = playerRowsToPlayers(playersRes, hostWallet);

        // Determine question
        let currentQuestion = prev.currentQuestion;
        if (prev.questionMode === 'classic' || prev.questionMode === 'free-for-all') {
          currentQuestion = QUESTIONS[game.current_question_index] || QUESTIONS[0];
        }

        // Build vote map
        const voteMap: Record<string, 'transparent' | 'fake'> = {};
        votesRes.forEach((v: VoteRow) => { voteMap[v.voter_wallet] = v.vote; });

        // Calculate scores
        const roundChanged = currentRound !== (prev.currentRound ?? 0);
        let newScores = prev.scores ?? {};

        if (game.status === 'gameover' && allVotes && allVotes.length > 0) {
          // Rebuild ALL scores from all rounds
          newScores = {};
          const rounds = [...new Set(allVotes.map(v => v.round))].sort((a, b) => a - b);
          for (const round of rounds) {
            // Hot seat player = players[round % numPlayers]
            const hotSeatIdx = round % mapped.length;
            const hotSeatWallet = mapped[hotSeatIdx]?.id;
            if (!hotSeatWallet) continue;
            const roundVotes = allVotes.filter(v => v.round === round);
            const t = roundVotes.filter(v => v.vote === 'transparent').length;
            const f = roundVotes.filter(v => v.vote === 'fake').length;
            const existing = newScores[hotSeatWallet] ?? { transparent: 0, fake: 0, rounds: 0 };
            newScores[hotSeatWallet] = {
              transparent: existing.transparent + t,
              fake: existing.fake + f,
              rounds: existing.rounds + 1,
            };
          }
        } else {
          // During gameplay: score current round if all votes in
          const hotSeatWallet = game.current_hot_seat_player;
          const eligibleVoters = mapped.filter(p => p.id !== hotSeatWallet).length;
          const votesNeeded = Math.max(eligibleVoters, 1);
          if (votesRes.length >= votesNeeded && hotSeatWallet) {
            const existingRounds = newScores[hotSeatWallet]?.rounds ?? 0;
            if (existingRounds < currentRound + 1) {
              const transparentVotes = votesRes.filter((v: VoteRow) => v.vote === 'transparent').length;
              const fakeVotes = votesRes.filter((v: VoteRow) => v.vote === 'fake').length;
              const existing = newScores[hotSeatWallet] ?? { transparent: 0, fake: 0, rounds: 0 };
              newScores = {
                ...newScores,
                [hotSeatWallet]: {
                  transparent: existing.transparent + transparentVotes,
                  fake: existing.fake + fakeVotes,
                  rounds: currentRound + 1,
                },
              };
            }
          }
        }

        return {
          ...prev,
          gameStatus: game.status,
          currentQuestion,
          currentPlayerInHotSeat: game.current_hot_seat_player,
          gamePhase: (game.game_phase as GamePhase) || prev.gamePhase,
          currentRound,
          players: mapped,
          currentPot: derivePotAmount(mapped, prev.buyInAmount, game.current_pot, prev.currentPot),
          totalVotes: mapped.length,
          scores: newScores,
          questionOptions: game.question_options ?? prev.questionOptions,
          questionPickVotes: game.question_pick_votes ?? prev.questionPickVotes,
          // Clear votes on round change, otherwise update
          ...(roundChanged ? { votes: {}, voteCount: 0 } : { votes: voteMap, voteCount: votesRes.length }),
        };
      });


    } catch (err) {
      console.error('[pollGameState] error:', err);
    }
  }, []);

  // ── Leave Game (remove player from DB + reset local) ────

  const readyUp = useCallback(async () => {
    const wallet = walletRef.current;
    const gameId = gameIdRef.current;
    if (!wallet || !gameId) return;
    try {
      // If there's a buy-in, pay now
      const gs = gameStateRef.current;
      if (gs && gs.buyInAmount > 0 && gs.hostWallet) {
        const hostPubkey = new PublicKey(gs.hostWallet);
        const buyInLamports = Math.round(gs.buyInAmount * LAMPORTS_PER_SOL);
        if (wallet.publicKey.toBase58() !== gs.hostWallet) {
          if (USE_ESCROW) {
            // Trustless: buy-in goes to escrow PDA, not host wallet
            const [gamePDA] = deriveEscrowGamePDA(hostPubkey, gs.roomCode ?? '');
            await joinGameEscrow(wallet, gamePDA);
          } else {
            // Direct transfer: route through MagicBlock for faster confirmations
            try {
              await buyInViaMagicBlock(wallet, hostPubkey, buyInLamports);
            } catch (mbErr) {
              console.warn('[MagicBlock] ER buy-in failed, falling back:', mbErr);
              await joinGameOnChainWithAmount(wallet, hostPubkey, buyInLamports);
            }
          }
        }
      }
      await readyUpPlayer(gameId, wallet.publicKey.toBase58());
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map(p =>
            p.id === wallet.publicKey.toBase58() ? { ...p, isReady: true } : p
          ),
        };
      });
    } catch (err: any) {
      console.error('Ready up failed:', err);
      const msg = err?.message || 'Failed to ready up';
      setError(msg);
      // Re-throw so the UI can show the error and re-enable the button
      throw new Error(msg);
    }
  }, []);

  const leaveGame = useCallback(async () => {
    const wallet = walletRef.current;
    const gameId = gameIdRef.current;
    if (wallet && gameId) {
      try {
        const gs = gameStateRef.current;
        const isHost = wallet.publicKey.toBase58() === gs?.hostWallet;

        // If host leaves, refund all readied players first
        if (isHost && gs && gs.buyInAmount > 0) {
          const readiedPlayers = gs.players.filter(
            p => p.isReady && p.id !== gs.hostWallet
          );
          for (const player of readiedPlayers) {
            try {
              const playerPubkey = new PublicKey(player.id);
              if (USE_ESCROW) {
                const hostPubkey = new PublicKey(gs.hostWallet!);
                const [gamePDA] = deriveEscrowGamePDA(hostPubkey, gs.roomCode ?? '');
                await refundPlayerEscrow(wallet, gamePDA, playerPubkey);
              } else {
                const lamports = Math.round(gs.buyInAmount * LAMPORTS_PER_SOL);
                await joinGameOnChainWithAmount(wallet, playerPubkey, lamports);
              }
            } catch (err) {
              console.warn(`[hostLeave] Failed to refund ${player.name}:`, err);
            }
          }
        }

        // Remove player from DB
        await supabase
          .from('players')
          .delete()
          .eq('game_id', gameId)
          .eq('wallet_address', wallet.publicKey.toBase58());

        // If host leaves, cancel the game so all clients get notified
        if (isHost) {
          // Broadcast host leaving so players get it immediately
          if (channelRef.current) {
            channelRef.current.send({
              type: 'broadcast',
              event: 'host_leaving',
              payload: {},
            });
          }

          await supabase
            .from('games')
            .update({ status: 'cancelled' })
            .eq('id', gameId);
        }
      } catch (err) {
        console.warn('Failed to remove player from DB:', err);
      }
    }
    // Then reset local state
    if (channelRef.current) {
      unsubscribeFromGame(channelRef.current);
      channelRef.current = null;
    }
    gameIdRef.current = null;
    setGameState(null);
    setError(null);
    setLoading(false);
  }, []);

  // ── Leave Request (player asks host for refund) ─────────

  const requestLeave = useCallback(() => {
    const channel = channelRef.current;
    const wallet = walletRef.current;
    const gs = gameStateRef.current;
    if (!channel || !wallet || !gs) return;
    const playerName = gs.players.find(p => p.id === wallet.publicKey.toBase58())?.name ?? 'Player';
    channel.send({
      type: 'broadcast',
      event: 'leave_request',
      payload: { wallet: wallet.publicKey.toBase58(), name: playerName },
    });
  }, []);

  const approveLeave = useCallback(async (playerWallet: string) => {
    const wallet = walletRef.current;
    const gameId = gameIdRef.current;
    const gs = gameStateRef.current;
    if (!wallet || !gameId || !gs) return;

    // Refund the player's buy-in
    if (gs.buyInAmount > 0) {
      try {
        const lamports = Math.round(gs.buyInAmount * LAMPORTS_PER_SOL);
        const playerPubkey = new PublicKey(playerWallet);
        await joinGameOnChainWithAmount(wallet, playerPubkey, lamports);
      } catch (err) {
        console.warn('[approveLeave] Refund failed:', err);
      }
    }

    // Remove player from DB
    try {
      await supabase
        .from('players')
        .delete()
        .eq('game_id', gameId)
        .eq('wallet_address', playerWallet);
    } catch (err) {
      console.warn('[approveLeave] Remove failed:', err);
    }

    // Notify the player they've been approved via broadcast
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'leave_approved',
        payload: { wallet: playerWallet },
      });
    }

    // Remove from leave requests
    setLeaveRequests(prev => prev.filter(w => w !== playerWallet));
  }, []);

  // ── Reset ──────────────────────────────────────────────

  // ── Solo Test Mode ──────────────────────────────────────
  // Creates a fully local game with fake players. No wallet, no Supabase.
  // Use this to test the full game flow by yourself.

  const TEST_PLAYERS: Player[] = [
    { id: 'test-host', name: 'you (host)', balance: 0, isHost: true, walletAddress: 'test-host', isReady: true },
    { id: 'test-p1', name: 'alex', balance: 0, isHost: false, walletAddress: 'test-p1', isReady: true },
    { id: 'test-p2', name: 'jordan', balance: 0, isHost: false, walletAddress: 'test-p2', isReady: true },
    { id: 'test-p3', name: 'sam', balance: 0, isHost: false, walletAddress: 'test-p3', isReady: true },
  ];

  const createTestGame = useCallback((questionMode: QuestionMode = 'classic', classicSubMode?: ClassicSubMode) => {
    const roomCode = '000-000';
    const qIdx = pickUniqueQuestionIndex(QUESTIONS.length, []);
    const isClassicStart = questionMode === 'classic' || questionMode === 'free-for-all';
    setGameState({
      roomCode,
      roomName: 'Test Room',
      buyInAmount: 0,
      players: TEST_PLAYERS,
      currentPot: 0,
      gameStatus: 'playing',
      currentQuestion: questionMode === 'storyteller' ? 'Tell us about the craziest thing you\'ve ever done on a dare.' : isClassicStart ? QUESTIONS[qIdx] : '',
      currentPlayerInHotSeat: 'test-p1',
      votes: {},
      voteCount: 0,
      totalVotes: TEST_PLAYERS.length,
      winner: null,
      hostWallet: 'test-host',
      questionMode,
      payoutMode: 'split-pot',
      numQuestions: TEST_PLAYERS.length,
      submittedQuestions: [],
      questionVotes: {},
      gamePhase: questionMode === 'storyteller' ? 'storyteller-prep' : questionMode === 'exposer' ? 'submitting-questions' : 'answering',
      currentRound: 0,
      scores: {},
      classicSubMode: questionMode === 'classic' ? (classicSubMode ?? 'all-or-nothing') : undefined,
      stakeVotes: {},
      questionBids: {},
      usedQuestionIndices: isClassicStart ? [qIdx] : [],
      currentRoundMode: questionMode === 'free-for-all' ? 'classic' : undefined,
      storytellerPrompt: questionMode === 'storyteller' ? 'Tell us about the craziest thing you\'ve ever done on a dare.' : undefined,
      storytellerChoice: null,
    });
    setError(null);
  }, []);

  // Auto-vote from fake players after a delay (simulates other players voting)
  const testAutoVote = useCallback(() => {
    if (!gameState) return;
    const hotSeat = gameState.currentPlayerInHotSeat;
    const fakePlayers = TEST_PLAYERS.filter(p => p.id !== hotSeat && p.id !== 'test-host');

    // Simulate votes from fake players with staggered timing
    fakePlayers.forEach((fp, i) => {
      setTimeout(() => {
        setGameState(prev => {
          if (!prev) return null;
          const vote: 'transparent' | 'fake' = Math.random() > 0.4 ? 'transparent' : 'fake';
          const newVotes = { ...prev.votes, [fp.id]: vote };
          return { ...prev, votes: newVotes, voteCount: Object.keys(newVotes).length };
        });
      }, (i + 1) * 800);
    });
  }, [gameState]);

  const resetGame = useCallback(() => {
    if (channelRef.current) {
      unsubscribeFromGame(channelRef.current);
      channelRef.current = null;
    }
    gameIdRef.current = null;
    setGameState(null);
    setError(null);
    setLoading(false);
  }, []);

  // ── Prediction Market ────────────────────────────────────

  const placePrediction = useCallback(async (
    predictedWallet: string,
    amountSol: number,
    bettorName: string,
  ): Promise<boolean> => {
    const wallet = walletRef.current;
    const gameId = gameIdRef.current;
    if (!gameId) { setError('No active game'); return false; }

    const amountLamports = Math.round(amountSol * LAMPORTS_PER_SOL);

    try {
      setLoading(true);
      setError(null);

      // On-chain: send prediction SOL to the game host as escrow
      if (wallet && amountLamports > 0) {
        const hostWallet = gameState?.hostWallet;
        if (hostWallet && hostWallet !== wallet.publicKey.toBase58()) {
          try {
            await joinGameOnChainWithAmount(wallet, new PublicKey(hostWallet), amountLamports);
          } catch { /* non-fatal — prediction still recorded in DB */ }
        }
      }

      // Off-chain: record prediction in Supabase
      await placePredictionInDB({
        game_id: gameId,
        bettor_wallet: wallet?.publicKey.toBase58() ?? 'anonymous',
        bettor_name: bettorName,
        predicted_winner_wallet: predictedWallet,
        amount_lamports: amountLamports,
      });

      // Refresh predictions
      const updated = await getPredictionsForGame(gameId);
      setPredictions(updated);
      return true;
    } catch (err: any) {
      setError(err?.message ?? 'Failed to place prediction');
      return false;
    } finally {
      setLoading(false);
    }
  }, [gameState]);

  const distributePredictions = useCallback(async (winnerWallet: string): Promise<void> => {
    const wallet = walletRef.current;
    const gameId = gameIdRef.current;
    if (!wallet || !gameId) return;

    const unsettled = predictions.filter(p => !p.settled);
    const correctBets = unsettled.filter(p => p.predicted_winner_wallet === winnerWallet);

    if (!correctBets.length) {
      // Nobody predicted correctly — host keeps the prediction pot
      await settlePredictions(gameId);
      return;
    }

    // Full prediction pot (all bets — correct + incorrect)
    const fullPot = unsettled.reduce((sum, p) => sum + p.amount_lamports, 0);
    // Split proportionally by bet size among correct predictors
    const correctTotal = correctBets.reduce((sum, p) => sum + p.amount_lamports, 0);

    try {
      for (const bet of correctBets) {
        // Proportional share: (their bet / total correct bets) × full pot
        const share = Math.floor((bet.amount_lamports / correctTotal) * fullPot);
        if (share > 0 && bet.bettor_wallet !== wallet.publicKey.toBase58()) {
          try {
            const { joinGameOnChainWithAmount } = await import('../lib/anchor');
            await joinGameOnChainWithAmount(wallet, new PublicKey(bet.bettor_wallet), share);
          } catch (sendErr) {
            console.warn(`[predictions] Failed to send to ${bet.bettor_wallet}:`, sendErr);
          }
        }
      }
      await settlePredictions(gameId);
      const updated = await getPredictionsForGame(gameId);
      setPredictions(updated);
    } catch (err: any) {
      console.error('distributePredictions:', err);
    }
  }, [predictions]);

  // Also load predictions when game is loaded from DB
  useEffect(() => {
    const gameId = gameIdRef.current;
    if (gameId && gameState?.gameId === gameId && predictions.length === 0) {
      getPredictionsForGame(gameId).then(setPredictions).catch(() => {});
    }
  }, [gameState?.gameId]);

  // ── Simulate (noop in real mode, kept for compat) ──────

  const simulateAutoPlay = useCallback(() => {
    // In real multiplayer, other players vote on their own devices
    // This is kept as a no-op for interface compatibility
  }, []);

  return (
    <GameContext.Provider
      value={{
        gameState,
        loading,
        error,
        predictions,
        predictionPot: predictions.reduce((s, p) => s + p.amount_lamports, 0),
        createGame,
        joinGame,
        startGame,
        castVote,
        submitQuestion,
        voteForQuestion,
        advanceHotTakePhase,
        selectWinner,
        distributeWinnings,
        distributePredictions,
        forceAdvanceRound,
        hostPickQuestion,
        voteForQuestionOption,
        raisePot,
        sendQuestionsToVote,
        endGameNow,
        storytellerChoose,
        storytellerAdvance,
        skipQuestion,
        bidOnQuestion,
        castStakeVote,
        readyUp,
        leaveGame,
        requestLeave,
        leaveRequests,
        approveLeave,
        refreshPlayers,
        pollGameState,
        resetGame,
        simulateAutoPlay,
        setWalletAdapter,
        placePrediction,
        createTestGame,
        testAutoVote,
      }}
    >
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
};
