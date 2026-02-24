import React, { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { QuestionSubmitPhase } from '../components/QuestionSubmitPhase';
import { QuestionVotePhase } from '../components/QuestionVotePhase';
import fireIconSrc from '../assets/social-rewards-trends-hot-flame--Streamline-Pixel.svg';
import groupIconSrc from '../assets/Group.svg';

export const GamePlayPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, castVote, advanceHotTakePhase } = useGame();
  const { publicKey, displayName } = usePrivyWallet();

  const myWallet = publicKey?.toBase58() ?? '';
  const isHost = myWallet === (gameState as any)?.hostWallet;

  useEffect(() => {
    if (gameState?.gameStatus === 'gameover') navigate('/gameover');
  }, [gameState?.gameStatus, navigate]);

  const handleAdvancePhase = useCallback(() => {
    if (isHost) advanceHotTakePhase();
  }, [advanceHotTakePhase, isHost]);

  if (!gameState) { navigate('/'); return null; }

  const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayerInHotSeat);
  const hasVoted = !!gameState.votes[myWallet];
  const isHotSeat = myWallet === gameState.currentPlayerInHotSeat;
  const isHotTake = gameState.questionMode === 'hot-take';
  const phase = gameState.gamePhase;
  const scores = gameState.scores ?? {};
  const round = (gameState.currentRound ?? 0) + 1;
  const totalRounds = gameState.players.length;
  const votesIn = gameState.voteCount;
  const totalVoters = Math.max(gameState.players.length - 1, 1);

  // ── Hot-Take: Submitting Questions ──────────────────────────
  if (isHotTake && phase === 'submitting-questions') {
    return (
      <div className="page">
        <nav className="navbar">
          <div className="badge badge-lime">Round {round}/{totalRounds}</div>
          <button
            onClick={() => navigate('/gameover')}
            style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            End Game
          </button>
        </nav>
        <div className="page-content animate-in">
          {isHotSeat ? (
            <div className="card-lg" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🪑</div>
              <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                You're in the Hot Seat
              </h2>
              <p style={{ color: 'var(--text-2)', fontSize: 14 }}>
                Players are writing questions for you...
              </p>
              <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 12 }}>
                {gameState.submittedQuestions?.length ?? 0} / {gameState.players.length - 1} submitted
              </p>
            </div>
          ) : (
            <QuestionSubmitPhase
              hotSeatPlayerName={currentPlayer?.name || 'Unknown'}
              onTimerEnd={handleAdvancePhase}
            />
          )}
          <ScoreboardSection gameState={gameState} myWallet={myWallet} />
        </div>
      </div>
    );
  }

  // ── Hot-Take: Voting on Questions ────────────────────────────
  if (isHotTake && phase === 'voting-question') {
    return (
      <div className="page">
        <nav className="navbar">
          <div className="badge badge-lime">Round {round}/{totalRounds}</div>
          <button onClick={() => navigate('/gameover')} style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>End Game</button>
        </nav>
        <div className="page-content animate-in">
          <QuestionVotePhase hotSeatPlayerName={currentPlayer?.name || 'Unknown'} onTimerEnd={handleAdvancePhase} />
          <ScoreboardSection gameState={gameState} myWallet={myWallet} />
        </div>
      </div>
    );
  }

  // ── Hot-Take: Answering phase ─────────────────────────────────
  if (isHotTake && phase === 'answering') {
    return (
      <div className="page">
        <nav className="navbar">
          <div className="badge badge-lime">Round {round}/{totalRounds}</div>
          <button onClick={() => navigate('/gameover')} style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>End Game</button>
        </nav>
        <div className="page-content animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <HotSeatBanner name={currentPlayer?.name || ''} isMe={isHotSeat} />
          <div className="card-lg" style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
              🔥 Hot Take Question
            </p>
            <p className="question-text" style={{ marginBottom: 24 }}>
              {gameState.currentQuestion || 'No question selected'}
            </p>
            {isHotSeat ? (
              <button className="btn btn-primary" onClick={handleAdvancePhase}>
                I've Answered ✓
              </button>
            ) : (
              <p style={{ color: 'var(--text-2)', fontSize: 14 }}>
                Listen to {currentPlayer?.name}'s answer...
              </p>
            )}
          </div>
          <ScoreboardSection gameState={gameState} myWallet={myWallet} />
        </div>
      </div>
    );
  }

  // ── Default / Classic / Custom / Voting-Honesty Phase ─────────
  return (
    <div className="page">
      <nav className="navbar">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="badge badge-neutral">Round {round}/{totalRounds}</div>
          {isHotTake && <div className="badge badge-lime">🔥 Hot Take</div>}
        </div>
        <button onClick={() => navigate('/gameover')} style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>End Game</button>
      </nav>

      <div className="page-content animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Hot seat banner */}
        <HotSeatBanner name={currentPlayer?.name || 'Unknown'} isMe={isHotSeat} />

        {/* Question */}
        <div className="card-lg" style={{ textAlign: 'center' }}>
          <p className="question-text">{gameState.currentQuestion}</p>
        </div>

        {/* Voting */}
        {isHotSeat ? (
          <div className="card" style={{ textAlign: 'center', padding: 16 }}>
            <p style={{ color: 'var(--text-2)', fontSize: 14 }}>
              Answer honestly — others are voting on whether to believe you
            </p>
          </div>
        ) : (
          <div>
            <label className="label" style={{ textAlign: 'center' }}>
              Is {currentPlayer?.name} being transparent?
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="vote-btn vote-transparent"
                onClick={() => castVote('transparent')}
                disabled={hasVoted}
              >
                ✅ Transparent
              </button>
              <button
                className="vote-btn vote-fake"
                onClick={() => castVote('fake')}
                disabled={hasVoted}
              >
                ❌ Fake
              </button>
            </div>

            {/* Progress */}
            {votesIn > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    {hasVoted ? '✓ Vote cast' : 'Waiting for votes'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{votesIn}/{totalVoters}</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${(votesIn / totalVoters) * 100}%` }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Host advance for hot-take voting-honesty */}
        {isHotTake && phase === 'voting-honesty' && hasVoted && isHost && (
          <button className="btn btn-secondary" onClick={handleAdvancePhase}>
            Next Round →
          </button>
        )}

        <ScoreboardSection gameState={gameState} myWallet={myWallet} />
      </div>
    </div>
  );
};

// ── Sub-components ─────────────────────────────────────────────

function HotSeatBanner({ name, isMe }: { name: string; isMe: boolean }) {
  return (
    <div className="hot-seat-banner" style={{ display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left' }}>
      <div style={{
        width: 52, height: 52, borderRadius: 16, flexShrink: 0,
        background: 'rgba(191,251,79,0.08)',
        border: '1px solid rgba(191,251,79,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <img src={fireIconSrc} alt="Hot Seat" style={{ width: 28, height: 28, filter: 'brightness(0) saturate(100%) invert(94%) sepia(48%) saturate(700%) hue-rotate(40deg) brightness(105%)', opacity: 0.9 }} />
      </div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          In the Hot Seat
        </div>
        <div style={{ fontFamily: 'Space Grotesk', fontSize: 22, fontWeight: 700, color: 'var(--lime)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          {name}
          {isMe && <span style={{ fontSize: 14, color: 'var(--text-2)', fontWeight: 500, marginLeft: 8 }}>(You)</span>}
        </div>
      </div>
    </div>
  );
}

function ScoreboardSection({ gameState, myWallet }: { gameState: any; myWallet: string }) {
  const scores = gameState.scores ?? {};
  const hasScores = Object.keys(scores).length > 0;

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <img src={groupIconSrc} alt="" style={{ width: 14, height: 14, opacity: 0.4, filter: 'brightness(0) invert(1)' }} />
        <label className="label" style={{ marginBottom: 0 }}>{hasScores ? 'Live Scores' : 'Players'}</label>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {gameState.players.map((p: any, i: number) => {
          const score = scores[p.id];
          const isHotSeat = p.id === gameState.currentPlayerInHotSeat;
          const isMe = p.id === myWallet;
          const total = score ? score.transparent + score.fake : 0;
          const pct = total > 0 ? Math.round((score.transparent / total) * 100) : null;

          return (
            <div key={p.id} className={`player-row ${isHotSeat ? 'active' : ''}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isHotSeat && <span style={{ fontSize: 12 }}>🔥</span>}
                <span style={{ fontWeight: 600, fontSize: 13 }}>
                  {p.name || `Player ${i + 1}`}
                  {isMe && <span style={{ color: 'var(--text-3)', marginLeft: 4, fontSize: 11 }}>you</span>}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {score ? (
                  <>
                    <span style={{ fontSize: 12, color: 'var(--lime)' }}>✅ {score.transparent}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>❌ {score.fake}</span>
                    {pct !== null && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{pct}%</span>}
                  </>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--lime)', fontFamily: 'Space Grotesk', fontWeight: 700 }}>
                    {gameState.buyInAmount} SOL
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
