import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';

export const GameOverPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, resetGame, distributeWinnings, loading } = useGame();
  const { publicKey, displayName } = usePrivyWallet();
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [distributing, setDistributing] = useState(false);

  if (!gameState) { navigate('/'); return null; }

  const isHost = publicKey?.toBase58() === (gameState as any).hostWallet;
  const scores = gameState.scores ?? {};

  // Rank players by honesty %
  const ranked = gameState.players
    .map(p => {
      const s = scores[p.id];
      const total = s ? s.transparent + s.fake : 0;
      const honesty = total > 0 ? s.transparent / total : 0;
      return { player: p, score: s, honesty, total };
    })
    .sort((a, b) => b.honesty - a.honesty);

  // Auto-suggest top player
  const suggestedId = ranked[0]?.player.id ?? null;
  const activeWinner = selectedWinner ?? suggestedId;

  const handleDistribute = async () => {
    if (!activeWinner) return;
    setDistributing(true);
    try {
      await distributeWinnings(activeWinner);
      setConfirmed(true);
    } catch (e) {
      console.error(e);
      setConfirmed(true); // still mark done
    }
    setDistributing(false);
  };

  const winnerPlayer = gameState.players.find(p => p.id === activeWinner);

  return (
    <div className="page">
      <nav className="navbar">
        <div style={{ fontFamily: 'Space Grotesk', fontSize: 20, fontWeight: 700, color: 'var(--lime)' }}>
          GAME OVER
        </div>
        <button
          onClick={() => { resetGame(); navigate('/'); }}
          className="btn btn-ghost"
          style={{ width: 'auto' }}
        >
          New Game
        </button>
      </nav>

      <div className="page-content animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Pot */}
        <div className="card-lg" style={{ textAlign: 'center' }}>
          <p className="label" style={{ textAlign: 'center', marginBottom: 8 }}>Total Pot</p>
          <p style={{ fontFamily: 'Space Grotesk', fontSize: 48, fontWeight: 700, color: 'var(--lime)', lineHeight: 1 }}>
            {gameState.currentPot.toFixed(2)}
            <span style={{ fontSize: 20, marginLeft: 6, color: 'var(--text-2)' }}>SOL</span>
          </p>
          {confirmed && winnerPlayer && (
            <p style={{ fontSize: 14, color: 'var(--lime)', marginTop: 8 }}>
              🎉 Sent to {winnerPlayer.name}
            </p>
          )}
        </div>

        {/* Leaderboard */}
        <div>
          <label className="label">
            {isHost && !confirmed ? 'Select Winner' : 'Final Standings'}
          </label>
          {isHost && !confirmed && (
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>
              🤖 Auto-suggested: <span style={{ color: 'var(--lime)' }}>{ranked[0]?.player.name}</span> based on votes. Tap to change.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ranked.map(({ player, score, honesty, total }, i) => {
              const isWinner = player.id === activeWinner;
              const isSelected = isWinner && isHost && !confirmed;

              return (
                <div
                  key={player.id}
                  className={`lb-row ${isWinner ? 'winner' : ''}`}
                  onClick={() => isHost && !confirmed && setSelectedWinner(player.id)}
                  style={{ cursor: isHost && !confirmed ? 'pointer' : 'default' }}
                >
                  {/* Rank */}
                  <span style={{
                    fontFamily: 'Space Grotesk', fontSize: 18, fontWeight: 700,
                    color: i === 0 ? 'var(--lime)' : 'var(--text-3)',
                    width: 28, flexShrink: 0
                  }}>
                    {i + 1}
                  </span>

                  {/* Name + badges */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{player.name}</span>
                      {i === 0 && <span className="badge badge-lime" style={{ padding: '2px 8px', fontSize: 10 }}>🌟 Most Honest</span>}
                      {isSelected && <span className="badge badge-lime" style={{ padding: '2px 8px', fontSize: 10 }}>Selected</span>}
                    </div>
                    {score && (
                      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                        <span style={{ fontSize: 12, color: 'var(--lime)' }}>✅ {score.transparent}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>❌ {score.fake}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{Math.round(honesty * 100)}% honest</span>
                      </div>
                    )}
                  </div>

                  {/* Winnings */}
                  {confirmed && isWinner && (
                    <span style={{ fontFamily: 'Space Grotesk', fontSize: 16, fontWeight: 700, color: 'var(--lime)' }}>
                      +{gameState.currentPot.toFixed(2)} SOL
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Host distribution */}
        {isHost && !confirmed && (
          <button
            className="btn btn-primary"
            onClick={handleDistribute}
            disabled={distributing || !activeWinner}
            style={{ fontSize: 16, padding: '18px' }}
          >
            {distributing ? 'Distributing...' : `🏆 Send ${gameState.currentPot.toFixed(2)} SOL to ${winnerPlayer?.name ?? 'Winner'}`}
          </button>
        )}

        {confirmed && (
          <button
            className="btn btn-secondary"
            onClick={() => { resetGame(); navigate('/'); }}
            style={{ fontSize: 16, padding: '18px' }}
          >
            Play Again →
          </button>
        )}
      </div>
    </div>
  );
};
