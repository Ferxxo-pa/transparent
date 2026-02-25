import React, { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { PublicKey } from '@solana/web3.js';
import { RealtimeChannel } from '@supabase/supabase-js';
import { GameState, Player, QUESTIONS, QuestionMode, GamePhase, SubmittedQuestion } from '../types/game';
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
  createGame: (buyIn: number, roomName: string, questionMode?: QuestionMode, customQuestions?: string[], playerName?: string) => Promise<boolean>;
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
  leaveGame: () => Promise<void>;
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

  const setWalletAdapter = useCallback((adapter: WalletAdapter | null) => {
    walletRef.current = adapter;
  }, []);

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
    async (buyIn: number, roomName: string, questionMode: QuestionMode = 'classic', customQuestions?: string[], playerName?: string) => {
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
        });

        // 3. Add host as first player
        const hostAddr = wallet.publicKey.toBase58();
        const hostDisplayName = playerName?.trim() || `${hostAddr.slice(0, 4)}...${hostAddr.slice(-4)}`;
        await addPlayerToDB({
          game_id: game.id,
          wallet_address: hostAddr,
          display_name: hostDisplayName,
          has_paid: true,
        });

        // 4. Fetch initial players
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
          currentPot: buyIn,
          gameStatus: 'waiting',
          currentQuestion: firstQuestion,
          currentPlayerInHotSeat: null,
          votes: {},
          voteCount: 0,
          totalVotes: 1,
          winner: null,
          gameId: game.id,
          hostWallet: wallet.publicKey.toBase58(),
          questionMode,
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

        // 2. Send buy-in SOL to host wallet on-chain
        try {
          const hostPubkey = new PublicKey(game.host_wallet);
          const buyInLamports = game.buy_in_lamports;
          if (buyInLamports > 0 && wallet.publicKey.toBase58() !== game.host_wallet) {
            await joinGameOnChainWithAmount(wallet, hostPubkey, buyInLamports);
          }
        } catch (chainErr: any) {
          console.error('On-chain buy-in failed:', chainErr);
          // Log details for debugging
          console.error('Buy-in details:', {
            host: game.host_wallet,
            player: wallet.publicKey.toBase58(),
            lamports: game.buy_in_lamports,
            error: chainErr?.message,
          });
          // Non-fatal during dev — game continues in Supabase
        }

        // 3. Add player to Supabase
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

    if (gameState.players.length < 1) {
      setError('Need at least 1 player to start');
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
          const nextIdx = currentIdx + 1;

          if (nextIdx >= gameState.players.length) {
            // All players have had a turn — game over
            await updateGameStatus(gid, { status: 'gameover' });
            setGameState((prev) => (prev ? { ...prev, gameStatus: 'gameover' } : null));
          } else {
            // Next player's turn
            const nextPlayer = gameState.players[nextIdx];
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
        const nextIdx = (currentIdx + 1) % gameState.players.length;
        const nextPlayer = gameState.players[nextIdx]?.id ?? null;
        const nextRound = (gameState.currentRound ?? 0) + 1;

        if (nextIdx === 0) {
          // All players have been in hot seat — game over
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

        // Only attempt on-chain distribution if there's an actual buy-in
        if (gameState.buyInAmount > 0) {
          try {
            const hostWallet = (gameState as any).hostWallet;
            const hostPubkey = new PublicKey(hostWallet);
            const [gamePDA] = deriveGamePDA(hostPubkey, gameState.roomName);
            const winnerPubkey = new PublicKey(winnerWallet);
            // Pass exact pot lamports — prevents draining host's full wallet
            const potLamports = Math.round(gameState.currentPot * LAMPORTS_PER_SOL);
            await distributeOnChain(wallet, gamePDA, winnerPubkey, potLamports);
          } catch (chainErr) {
            console.warn('On-chain distribution failed (non-fatal):', chainErr);
            // Game still recorded as over — host can send manually
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
    const nextIdx = currentIdx + 1;

    try {
      if (nextIdx >= gameState.players.length) {
        await updateGameStatus(gid, { status: 'gameover' });
        setGameState(prev => prev ? { ...prev, gameStatus: 'gameover' } : null);
      } else {
        const nextPlayer = gameState.players[nextIdx];
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

  // ── Leave Game (remove player from DB + reset local) ────

  const leaveGame = useCallback(async () => {
    const wallet = walletRef.current;
    const gameId = gameIdRef.current;
    if (wallet && gameId) {
      try {
        await supabase
          .from('players')
          .delete()
          .eq('game_id', gameId)
          .eq('wallet_address', wallet.publicKey.toBase58());
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
        leaveGame,
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
