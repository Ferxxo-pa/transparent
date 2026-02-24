import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';

export const GameOverPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, resetGame, distributeWinnings } = useGame();
  const { publicKey } = usePrivyWallet();
  const [selected,    setSelected]    = useState<string | null>(null);
  const [confirmed,   setConfirmed]   = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [distErr,     setDistErr]     = useState<string | null>(null);

  if (!gameState) { navigate('/'); return null; }

  const isHost  = publicKey?.toBase58() === (gameState as any).hostWallet;
  const scores  = gameState.scores ?? {};

  const ranked = gameState.players
    .map(p => {
      const s = scores[p.id];
      const t = s ? s.transparent + s.fake : 0;
      const honesty = t > 0 ? s.transparent / t : 0;
      return { p, s, honesty, t };
    })
    .sort((a, b) => b.honesty - a.honesty);

  const activeWinner = selected ?? ranked[0]?.p.id ?? null;
  const winnerPlayer = gameState.players.find(p => p.id === activeWinner);

  const distribute = async () => {
    if (!activeWinner) return;
    setDistributing(true);
    setDistErr(null);
    try {
      await distributeWinnings(activeWinner);
      setConfirmed(true);
    } catch (e: any) {
      setDistErr(e?.message || 'Distribution failed');
      setConfirmed(true);
    }
    setDistributing(false);
  };

  return (
    <div className="page fade-in">
      <nav className="navbar">
        <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em' }}>
          {confirmed ? '🎉 Game Over' : 'Game Over'}
        </span>
        <button
          className="btn-ghost"
          onClick={() => { resetGame(); navigate('/'); }}
          style={{ display: 'flex', alignItems: 'center', height: 34, padding: '0 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--r-pill)', cursor: 'pointer', color: 'var(--muted)', fontSize: 13, fontFamily: 'Space Grotesk', fontWeight: 600 }}
        >
          New Game
        </button>
      </nav>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', flex: 1 }}>

        {/* Pot */}
        <div className="card-lime" style={{ textAlign: 'center', padding: '28px 20px' }}>
          {confirmed && winnerPlayer ? (
            <>
              <p className="label" style={{ marginBottom: 10 }}>Winner</p>
              <p style={{ fontWeight: 800, fontSize: 'clamp(28px, 7vw, 38px)', color: 'var(--lime)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                {winnerPlayer.name}
              </p>
              <p style={{ color: 'var(--lime)', fontSize: 20, fontWeight: 700, marginTop: 8 }}>
                +{gameState.currentPot.toFixed(2)} SOL
              </p>
            </>
          ) : (
            <>
              <p className="label" style={{ marginBottom: 10 }}>Total Pot</p>
              <p style={{ fontWeight: 800, fontSize: 'clamp(44px, 11vw, 60px)', color: 'var(--lime)', letterSpacing: '-0.04em', lineHeight: 1 }}>
                {gameState.currentPot.toFixed(2)}
                <span style={{ fontSize: 20, color: 'var(--muted)', fontWeight: 600, marginLeft: 6 }}>SOL</span>
              </p>
            </>
          )}
        </div>

        {/* Leaderboard */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p className="label" style={{ marginBottom: 0 }}>
              {isHost && !confirmed ? 'Select Winner' : 'Final Standings'}
            </p>
            {isHost && !confirmed && ranked[0] && (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                Suggested: <span style={{ color: 'var(--lime)' }}>{ranked[0].p.name}</span>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ranked.map(({ p, s, honesty }, i) => {
              const isWinner = p.id === activeWinner;
              return (
                <div
                  key={p.id}
                  className={`lb-row ${isWinner ? 'winner' : ''} ${isHost && !confirmed ? 'selectable' : ''}`}
                  onClick={() => isHost && !confirmed && setSelected(p.id)}
                >
                  <span style={{ fontWeight: 800, fontSize: 18, color: i === 0 ? 'var(--lime)' : 'var(--muted)', width: 24, flexShrink: 0, letterSpacing: '-0.03em' }}>
                    {i + 1}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</span>
                      {i === 0 && <span className="chip chip-lime" style={{ fontSize: 10, padding: '1px 8px' }}>Most honest</span>}
                      {isWinner && isHost && !confirmed && <span className="chip chip-white" style={{ fontSize: 10, padding: '1px 8px' }}>Selected</span>}
                    </div>
                    {s ? (
                      <div style={{ display: 'flex', gap: 10, marginTop: 3, fontSize: 12, color: 'var(--muted)' }}>
                        <span style={{ color: 'var(--lime)' }}>✓ {s.transparent}</span>
                        <span>✗ {s.fake}</span>
                        <span>{Math.round(honesty * 100)}% honest</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>No votes</span>
                    )}
                  </div>
                  {confirmed && isWinner && (
                    <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--lime)', whiteSpace: 'nowrap' }}>
                      +{gameState.currentPot.toFixed(2)} SOL
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {distErr && (
          <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 'var(--r-sm)', padding: '12px 14px', color: 'var(--red)', fontSize: 13 }}>
            {distErr}
          </div>
        )}
      </div>

      {/* CTA */}
      <div style={{ width: '100%', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {isHost && !confirmed ? (
          <button className="btn btn-primary" onClick={distribute} disabled={distributing || !activeWinner}>
            {distributing ? 'Sending…' : `Send ${gameState.currentPot.toFixed(2)} SOL to ${winnerPlayer?.name ?? 'Winner'}`}
          </button>
        ) : (
          <button className="btn btn-secondary" onClick={() => { resetGame(); navigate('/'); }}>
            Play Again
          </button>
        )}
      </div>
    </div>
  );
};
