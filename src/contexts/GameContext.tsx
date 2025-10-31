import React, { createContext, useContext, useState, ReactNode } from 'react';
import { GameState, Player, QUESTIONS, FAKE_PLAYER_NAMES } from '../types/game';

interface GameContextType {
  gameState: GameState | null;
  createGame: (buyIn: number, roomName: string) => void;
  joinGame: (roomCode: string) => void;
  startGame: () => void;
  castVote: (vote: 'transparent' | 'fake') => void;
  selectWinner: (playerId: string) => void;
  resetGame: () => void;
  simulateAutoPlay: () => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

const generateRoomCode = (): string => {
  const part1 = Math.floor(100 + Math.random() * 900);
  const part2 = Math.floor(100 + Math.random() * 900);
  return `${part1}-${part2}`;
};

const generateFakePlayers = (count: number, buyIn: number): Player[] => {
  const players: Player[] = [];
  for (let i = 0; i < count; i++) {
    players.push({
      id: `player-${i + 1}`,
      name: FAKE_PLAYER_NAMES[i % FAKE_PLAYER_NAMES.length],
      balance: buyIn,
      isHost: i === 0,
    });
  }
  return players;
};

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [gameState, setGameState] = useState<GameState | null>(null);

  const createGame = (buyIn: number, roomName: string) => {
    const roomCode = generateRoomCode();
    const players = generateFakePlayers(4, buyIn);

    setGameState({
      roomCode,
      roomName,
      buyInAmount: buyIn,
      players,
      currentPot: players.length * buyIn,
      gameStatus: 'waiting',
      currentQuestion: QUESTIONS[0],
      currentPlayerInHotSeat: null,
      votes: {},
      voteCount: 0,
      totalVotes: players.length,
      winner: null,
    });
  };

  const joinGame = (roomCode: string) => {
    const buyIn = 1;
    const players = generateFakePlayers(4, buyIn);

    setGameState({
      roomCode,
      roomName: 'College Night',
      buyInAmount: buyIn,
      players,
      currentPot: players.length * buyIn,
      gameStatus: 'waiting',
      currentQuestion: QUESTIONS[0],
      currentPlayerInHotSeat: null,
      votes: {},
      voteCount: 0,
      totalVotes: players.length,
      winner: null,
    });
  };

  const startGame = () => {
    if (!gameState) return;

    setGameState({
      ...gameState,
      gameStatus: 'playing',
      currentPlayerInHotSeat: gameState.players[0].id,
    });
  };

  const castVote = (vote: 'transparent' | 'fake') => {
    if (!gameState) return;

    const newVotes = { ...gameState.votes, 'current-player': vote };

    setGameState({
      ...gameState,
      votes: newVotes,
      voteCount: 1,
      totalVotes: 3,
    });

    setTimeout(() => {
      setGameState(prev => prev ? {
        ...prev,
        voteCount: 2,
      } : null);
    }, 600);

    setTimeout(() => {
      setGameState(prev => prev ? {
        ...prev,
        voteCount: 3,
      } : null);
    }, 1200);

    setTimeout(() => {
      const fakeVotes: Record<string, 'transparent' | 'fake'> = { ...newVotes };
      gameState.players.forEach(player => {
        if (!fakeVotes[player.id]) {
          fakeVotes[player.id] = Math.random() > 0.5 ? 'transparent' : 'fake';
        }
      });

      setGameState(prev => prev ? {
        ...prev,
        votes: fakeVotes,
        gameStatus: 'gameover',
      } : null);
    }, 1800);
  };

  const selectWinner = (playerId: string) => {
    if (!gameState) return;

    setGameState({
      ...gameState,
      winner: playerId,
    });
  };

  const resetGame = () => {
    setGameState(null);
  };

  const simulateAutoPlay = () => {
    if (!gameState || gameState.gameStatus !== 'playing') return;

    setTimeout(() => {
      castVote('transparent');
    }, 2000);
  };

  return (
    <GameContext.Provider
      value={{
        gameState,
        createGame,
        joinGame,
        startGame,
        castVote,
        selectWinner,
        resetGame,
        simulateAutoPlay,
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
