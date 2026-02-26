import React, { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { PublicKey } from '@solana/web3.js';
import { RealtimeChannel } from '@supabase/supabase-js';
import { GameState, Player, QUESTIONS, QuestionMode, GamePhase, SubmittedQuestion, PayoutMode, calculateSplitPayouts } from '../types/game';
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

// ============================================================
// Game Context — Real multiplayer via Supabase + Solana
// ============================================================

interface GameContextType {
  gameState: GameState | null;
  loading: boolean;
  error: string | null;
  predictions: PredictionRow[];
  predictionPot: number; // total lamports in prediction pot
  createGame: (buyIn: number, roomName: string, questionMode?: QuestionMode, customQuestions?: string[], playerName?: string, payoutMode?: PayoutMode, numQuestions?: number) => Promise<boolean>;
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
  endGameNow: () => Promise<void>;
  readyUp: () => Promise<void>;
  leaveGame: () => Promise<void>;
  refreshPlayers: () => Promise<void>;
  pollGameState: () => Promise<void>;
  resetGame: () => void;
  simulateAutoPlay: () => void;
  setWalletAdapter: (adapter: WalletAdapter | null) => void;
  placePrediction: (predictedWallet: string, amountSol: number, bettorName: string) => Promise<boolean>;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

// ── Helpers ─────────────────────────────────────────────────

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

            if (questionMode === 'classic') {
              currentQuestion = QUESTIONS[game.current_question_index] || QUESTIONS[0];
            } else if (questionMode === 'custom' && prev.customQuestions) {
              currentQuestion = prev.customQuestions[game.current_question_index] || prev.customQuestions[0] || '';
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
              // Clear votes for all clients when round or player changes
              ...(roundChanged || playerChanged ? { votes: {}, voteCount: 0 } : {}),
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
              currentPot: mapped.length * prev.buyInAmount,
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
    async (buyIn: number, roomName: string, questionMode: QuestionMode = 'classic', customQuestions?: string[], playerName?: string, payoutMode: PayoutMode = 'winner-takes-all', numQuestions: number = 0) => {
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
          custom_questions: questionMode === 'custom' ? (customQuestions ?? null) : null,
          payout_mode: payoutMode,
          num_questions: numQuestions > 0 ? numQuestions : null,
        });

        // 3. Host does NOT join as a player (Kahoot model: host = screen/controller)
        // Players join separately via room code

        // 4. Fetch initial players (will be empty)
        const players = await getPlayersForGame(game.id);

        // 5. Determine first question
        const firstQuestion =
          questionMode === 'custom' && customQuestions?.length
            ? customQuestions[0]
            : questionMode === 'hot-take'
              ? '' // Will be set during hot-take flow
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
          customQuestions: questionMode === 'custom' ? customQuestions : undefined,
          submittedQuestions: [],
          questionVotes: {},
          gamePhase: undefined,
          currentRound: 0,
          scores: {},
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
        const customQs = game.custom_questions ?? undefined;

        const currentQuestion =
          qMode === 'custom' && customQs?.length
            ? customQs[game.current_question_index] || customQs[0]
            : qMode === 'hot-take'
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
          customQuestions: customQs,
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

      if (questionMode === 'hot-take') {
        // Hot-take: start in submitting-questions phase
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
              }
            : null,
        );
      } else {
        // Classic or Custom
        const questionPool =
          questionMode === 'custom' && gameState.customQuestions?.length
            ? gameState.customQuestions
            : QUESTIONS;
        const questionIndex = Math.floor(Math.random() * questionPool.length);

        await updateGameStatus(gid, {
          status: 'playing',
          current_hot_seat_player: firstPlayer,
          current_question_index: questionIndex,
          game_phase: 'answering',
          current_round: 0,
        });

        setGameState((prev) =>
          prev
            ? {
                ...prev,
                gameStatus: 'playing',
                currentPlayerInHotSeat: firstPlayer,
                currentQuestion: questionPool[questionIndex],
                gamePhase: 'answering',
                currentRound: 0,
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
      if (!wallet) return;

      const gid = gameState.gameId;
      if (!gid) {
        // Fallback for offline mode
        setGameState((prev) => {
          if (!prev) return null;
          const newVotes = { ...prev.votes, [wallet.publicKey.toBase58()]: vote };
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
            const questionPool =
              gameState.questionMode === 'custom' && gameState.customQuestions?.length
                ? gameState.customQuestions
                : QUESTIONS;
            const nextQuestionIndex = Math.floor(Math.random() * questionPool.length);

            await updateGameStatus(gid, {
              current_hot_seat_player: nextPlayer.id,
              current_question_index: nextQuestionIndex,
              current_round: nextRound,
              game_phase: 'answering',
            });

            setGameState((prev) =>
              prev
                ? {
                    ...prev,
                    currentPlayerInHotSeat: nextPlayer.id,
                    currentQuestion: questionPool[nextQuestionIndex],
                    currentRound: nextRound,
                    votes: {},
                    voteCount: 0,
                    gamePhase: 'answering',
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
      if (!wallet) return;

      const gid = gameState.gameId;
      if (!gid) return;

      try {
        const round = gameState.currentRound ?? 0;
        await submitQuestionToDB({
          game_id: gid,
          round,
          submitter_wallet: wallet.publicKey.toBase58(),
          question_text: text,
        });

        // Real-time subscription will update submittedQuestions for all clients
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
      if (!wallet) return;

      try {
        await voteForQuestionInDB(questionId);

        const myWallet = wallet.publicKey.toBase58();
        setGameState((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            questionVotes: {
              ...(prev.questionVotes ?? {}),
              [myWallet]: questionId,
            },
          };
        });
      } catch (err: any) {
        console.error('Vote for question error:', err);
        setError(err.message || 'Failed to vote for question');
      }
    },
    [gameState],
  );

  // ── Advance Hot-Take Phase ─────────────────────────────

  const advanceHotTakePhase = useCallback(async () => {
    if (!gameState) return;
    const gid = gameState.gameId;
    if (!gid) return;

    const currentPhase = gameState.gamePhase;

    try {
      if (currentPhase === 'submitting-questions') {
        // Move to voting-question
        await updateGameStatus(gid, { game_phase: 'voting-question' });
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

        await updateGameStatus(gid, { game_phase: 'answering' });
        setGameState((prev) =>
          prev
            ? { ...prev, gamePhase: 'answering', currentQuestion: winningText }
            : null,
        );
      } else if (currentPhase === 'answering') {
        // Move to honesty voting
        await updateGameStatus(gid, { game_phase: 'voting-honesty' });
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
          // All rounds done — game over
          await updateGameStatus(gid, { status: 'gameover' });
          setGameState((prev) => (prev ? { ...prev, gameStatus: 'gameover' } : null));
        } else {
          await updateGameStatus(gid, {
            game_phase: 'submitting-questions',
            current_hot_seat_player: nextPlayer,
            current_round: nextRound,
          });
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
              await distributeOnChain(wallet, gamePDA, winnerPubkey, potLamports);
            } else if (gameState.payoutMode === 'split-pot') {
              // Split pot: each player gets payout based on honesty scores
              const scores = gameState.scores ?? {};
              const totalRounds = gameState.numQuestions > 0 ? gameState.numQuestions : gameState.players.length;
              const payouts = calculateSplitPayouts(scores, gameState.buyInAmount, totalRounds);

              console.log('[distribute] Split pot payouts:', payouts);

              // Send each player their share (skip host — they already hold the pot)
              for (const [playerWallet, amountSol] of Object.entries(payouts)) {
                if (playerWallet === hostWallet) continue; // host keeps their share
                if (amountSol <= 0) continue;
                const lamports = Math.round(amountSol * LAMPORTS_PER_SOL);
                try {
                  const playerPubkey = new PublicKey(playerWallet);
                  await distributeOnChain(wallet, gamePDA, playerPubkey, lamports);
                  console.log(`[distribute] Sent ${amountSol} SOL to ${playerWallet.slice(0, 8)}...`);
                } catch (sendErr) {
                  console.warn(`[distribute] Failed to send to ${playerWallet}:`, sendErr);
                }
              }
            }
          } catch (chainErr) {
            console.warn('On-chain distribution failed (non-fatal):', chainErr);
          }
        }

        if (gid) await updateGameStatus(gid, { status: 'gameover' });

        setGameState((prev) =>
          prev ? { ...prev, gameStatus: 'gameover', winner: winnerWallet } : null,
        );
      } catch (err: any) {
        console.error('Distribute error:', err);
        setError(err.message || 'Failed to distribute winnings');
      } finally {
        setLoading(false);
      }
    },
    [gameState],
  );

  // ── Force Advance Round (host skip) ───────────────────

  const forceAdvanceRound = useCallback(async () => {
    if (!gameState) return;
    const gid = gameState.gameId;
    if (!gid) return;
    const hotSeatWallet = gameState.currentPlayerInHotSeat;
    const currentIdx = gameState.players.findIndex(p => p.id === hotSeatWallet);
    const nextRoundNum = (gameState.currentRound ?? 0) + 1;
    const totalRounds = gameState.numQuestions > 0 ? gameState.numQuestions : gameState.players.length;

    try {
      if (nextRoundNum >= totalRounds) {
        await updateGameStatus(gid, { status: 'gameover' });
        setGameState(prev => prev ? { ...prev, gameStatus: 'gameover' } : null);
      } else {
        const nextPlayerIdx = (currentIdx + 1) % gameState.players.length;
        const nextPlayer = gameState.players[nextPlayerIdx];
        const nextRound = (gameState.currentRound ?? 0) + 1;
        const questionPool = gameState.questionMode === 'custom' && gameState.customQuestions?.length
          ? gameState.customQuestions : QUESTIONS;
        const nextQIdx = Math.floor(Math.random() * questionPool.length);
        await updateGameStatus(gid, {
          current_hot_seat_player: nextPlayer.id,
          current_question_index: nextQIdx,
          current_round: nextRound,
          game_phase: 'answering',
        });
        setGameState(prev => prev ? {
          ...prev,
          currentPlayerInHotSeat: nextPlayer.id,
          currentQuestion: questionPool[nextQIdx],
          currentRound: nextRound,
          votes: {}, voteCount: 0,
          gamePhase: 'answering',
        } : null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to advance round');
    }
  }, [gameState]);

  // ── End Game Now ───────────────────────────────────────

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
      console.log('[Manual refresh] players:', players.length);

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
          currentPot: mapped.length * prev.buyInAmount,
          totalVotes: mapped.length,
          // Sync game status from DB
          ...(gameData ? {
            gameStatus: gameData.status,
            currentPlayerInHotSeat: gameData.current_hot_seat_player,
            gamePhase: gameData.game_phase as GamePhase || prev.gamePhase,
            currentRound: gameData.current_round ?? prev.currentRound,
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
        if (prev.questionMode === 'classic') {
          currentQuestion = QUESTIONS[game.current_question_index] || QUESTIONS[0];
        } else if (prev.questionMode === 'custom' && prev.customQuestions) {
          currentQuestion = prev.customQuestions[game.current_question_index] || prev.customQuestions[0] || '';
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
          currentPot: mapped.length * prev.buyInAmount,
          totalVotes: mapped.length,
          scores: newScores,
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
          await joinGameOnChainWithAmount(wallet, hostPubkey, buyInLamports);
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
      setError(err?.message || 'Failed to ready up');
    }
  }, []);

  const leaveGame = useCallback(async () => {
    const wallet = walletRef.current;
    const gameId = gameIdRef.current;
    if (wallet && gameId) {
      try {
        const gs = gameStateRef.current;
        const isHost = wallet.publicKey.toBase58() === gs?.hostWallet;

        // Remove player from DB
        await supabase
          .from('players')
          .delete()
          .eq('game_id', gameId)
          .eq('wallet_address', wallet.publicKey.toBase58());

        // If host leaves, cancel the game so all clients get notified
        if (isHost) {
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

  // ── Reset ──────────────────────────────────────────────

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

    // Find correct predictors
    const correctBets = predictions.filter(p => p.predicted_winner_wallet === winnerWallet && !p.settled);
    if (!correctBets.length) {
      await settlePredictions(gameId);
      return;
    }

    const totalPot = correctBets.reduce((sum, p) => sum + p.amount_lamports, 0);
    const totalCorrect = correctBets.length;

    try {
      // Pay out each correct predictor proportionally
      // (simplified: equal split for now)
      const perWinner = Math.floor(totalPot / totalCorrect);
      for (const bet of correctBets) {
        if (perWinner > 0 && bet.bettor_wallet !== wallet.publicKey.toBase58()) {
          const { joinGameOnChainWithAmount } = await import('../lib/anchor');
          await joinGameOnChainWithAmount(wallet, new PublicKey(bet.bettor_wallet), perWinner).catch(() => {});
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
        endGameNow,
        readyUp,
        leaveGame,
        refreshPlayers,
        pollGameState,
        resetGame,
        simulateAutoPlay,
        setWalletAdapter,
        placePrediction,
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
