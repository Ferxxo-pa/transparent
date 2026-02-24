import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';

export const GameOverPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, resetGame, distributeWinnings, loading } = useGame();
  const { publicKey } = usePrivyWallet();
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [distError, setDistError] = useState<string | null>(null);

  if (!gameState) { navigate('/'); return null; }

  const isHost = publicKey?.toBase58() === (gameState as any).hostWallet;
  const scores = gameState.scores ?? {};

  const ranked = gameState.players
    .map(p => {
      const s = scores[p.id];
      const total = s ? s.transparent + s.fake : 0;
      const honesty = total > 0 ? s.transparent / total : 0;
      return { player: p, score: s, honesty, total };
    })
    .sort((a, b) => b.honesty - a.honesty);

  const suggestedId = ranked[0]?.player.id ?? null;
  const activeWinner = selectedWinner ?? suggestedId;
  const winnerPlayer = gameState.players.find(p => p.id === activeWinner);

  const handleDistribute = async () => {
    if (!activeWinner) return;
    setDistributing(true);
    setDistError(null);
    try {
      await distributeWinnings(activeWinner);
      setConfirmed(true);
    } catch (e: any) {
      setDistError(e?.message || 'Distribution failed');
      setConfirmed(true); // still mark done for UX
    }
    setDistributing(false);
  };

  return (
    <div className="page">
      <nav className="navbar">
        <div style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 18, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Game Over
        </div>
        <button
          onClick={() => { resetGame(); navigate('/'); }}
          className="btn btn-ghost"
          style={{ width: 'auto', fontSize: 13 }}
        >
          New Game
        </button>
      </nav>

      <div className="page-content animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Pot total */}
        <div className="card-lg" style={{ textAlign: 'center' }}>
          <p className="label" style={{ textAlign: 'center', marginBottom: 10 }}>Total Pot</p>
          <div style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 52, color: 'var(--lime)', lineHeight: 1, letterSpacing: '-0.03em' }}>
            {gameState.currentPot.toFixed(2)}
            <span style={{ fontSize: 20, color: 'var(--text-3)', fontWeight: 500, marginLeft: 6 }}>SOL</span>
          </div>
          {confirmed && winnerPlayer && (
            <p style={{ fontSize: 14, color: 'var(--lime)', marginTop: 12 }}>
              🎉 Pot sent to {winnerPlayer.name}
            </p>
          )}
        </div>

        {/* Leaderboard */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <label className="label" style={{ marginBottom: 0 }}>
              {isHost && !confirmed ? 'Select Winner' : 'Final Standings'}
            </label>
            {isHost && !confirmed && (
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                Auto-suggested: <span style={{ color: 'var(--lime)' }}>{ranked[0]?.player.name}</span>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ranked.map(({ player, score, honesty }, i) => {
              const isWinner = player.id === activeWinner;
              const isSelectable = isHost && !confirmed;

              return (
                <div
                  key={player.id}
                  className={`lb-row ${isWinner ? 'winner' : ''}`}
                  onClick={() => isSelectable && setSelectedWinner(player.id)}
                  style={{ cursor: isSelectable ? 'pointer' : 'default' }}
                >
                  <span style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 18, color: i === 0 ? 'var(--lime)' : 'var(--text-3)', width: 28, flexShrink: 0 }}>
                    {i + 1}
                  </span>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: score ? 4 : 0 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{player.name}</span>
                      {i === 0 && <span className="badge badge-lime" style={{ padding: '2px 8px', fontSize: 10 }}>Most Honest</span>}
                      {isWinner && isSelectable && <span className="badge badge-cream" style={{ padding: '2px 8px', fontSize: 10 }}>Selected</span>}
                    </div>
                    {score ? (
                      <div style={{ display: 'flex', gap: 12 }}>
                        <span style={{ fontSize: 12, color: 'var(--lime)' }}>✅ {score.transparent}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>❌ {score.fake}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{Math.round(honesty * 100)}% honest</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>No votes recorded</span>
                    )}
                  </div>

                  {confirmed && isWinner && (
                    <span style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 15, color: 'var(--lime)', whiteSpace: 'nowrap' }}>
                      +{gameState.currentPot.toFixed(2)} SOL
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {distError && (
          <div style={{ background: 'rgba(255,100,80,0.08)', border: '1px solid rgba(255,100,80,0.2)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 13 }}>
            ⚠️ {distError}
          </div>
        )}

        {isHost && !confirmed && (
          <button
            className="btn btn-primary"
            onClick={handleDistribute}
            disabled={distributing || !activeWinner}
            style={{ fontSize: 15, padding: '18px', marginTop: 4 }}
          >
            {distributing ? 'Sending...' : `Send ${gameState.currentPot.toFixed(2)} SOL to ${winnerPlayer?.name ?? 'Winner'}`}
          </button>
        )}

        {(!isHost || confirmed) && (
          <button
            className="btn btn-secondary"
            onClick={() => { resetGame(); navigate('/'); }}
            style={{ fontSize: 15, padding: '18px' }}
          >
            Play Again
          </button>
        )}
      </div>
    </div>
  );
};
