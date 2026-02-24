import React, { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { QuestionSubmitPhase } from '../components/QuestionSubmitPhase';
import { QuestionVotePhase } from '../components/QuestionVotePhase';

export const GamePlayPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, castVote, advanceHotTakePhase, forceAdvanceRound } = useGame();
  const { publicKey } = usePrivyWallet();

  const myWallet = publicKey?.toBase58() ?? '';
  const isHost   = myWallet === (gameState as any)?.hostWallet;

  useEffect(() => {
    if (gameState?.gameStatus === 'gameover') navigate('/gameover');
  }, [gameState?.gameStatus, navigate]);

  const advance = useCallback(() => {
    if (isHost) advanceHotTakePhase();
  }, [advanceHotTakePhase, isHost]);

  if (!gameState) { navigate('/'); return null; }

  const player     = gameState.players.find(p => p.id === gameState.currentPlayerInHotSeat);
  const hasVoted   = !!gameState.votes[myWallet];
  const isHotSeat  = myWallet === gameState.currentPlayerInHotSeat;
  const isHotTake  = gameState.questionMode === 'hot-take';
  const phase      = gameState.gamePhase;
  const round      = (gameState.currentRound ?? 0) + 1;
  const total      = gameState.players.length;
  const votesIn    = gameState.voteCount;
  const voterCount = Math.max(total - 1, 1);
  const myVote     = gameState.votes[myWallet];

  // ── Shared Navbar ──────────────────────────────────────────
  const Nav = () => (
    <nav className="navbar">
      <span className="chip chip-lavender">Round {round} / {total}</span>
      <button
        onClick={() => navigate('/gameover')}
        style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Space Grotesk', fontWeight: 500 }}
      >
        End Game
      </button>
    </nav>
  );

  // ── Hot Seat Banner ────────────────────────────────────────
  const HotSeatCard = () => (
    <div className="hot-seat scan-lines corner-accent">
      <div style={{ fontSize: 28, flexShrink: 0 }}>🔥</div>
      <div style={{ flex: 1 }}>
        <p className="label-cipher" style={{ marginBottom: 2 }}>In the hot seat</p>
        <p style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.03em', color: 'var(--lime)', lineHeight: 1 }}>
          {player?.name ?? 'Unknown'}
          {isHotSeat && <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)', marginLeft: 8 }}>(you)</span>}
        </p>
      </div>
    </div>
  );

  // ── Score mini sidebar (shown at bottom) ───────────────────
  const Scores = () => {
    const scores = gameState.scores ?? {};
    if (!Object.keys(scores).length) return null;
    return (
      <div>
        <div className="section-header" style={{ marginBottom: 8 }}><p className="label-cipher">Scores</p></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {gameState.players.map((p, i) => {
            const s = scores[p.id];
            const t = s ? s.transparent + s.fake : 0;
            const pct = t > 0 ? Math.round((s.transparent / t) * 100) : null;
            return (
              <div key={p.id} className="player-row" style={{ borderColor: p.id === gameState.currentPlayerInHotSeat ? 'var(--lime-border)' : undefined }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {p.id === gameState.currentPlayerInHotSeat && <span style={{ fontSize: 12 }}>🔥</span>}
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name || `P${i+1}`}</span>
                  {p.id === myWallet && <span className="chip chip-muted" style={{ fontSize: 10, padding: '1px 6px' }}>you</span>}
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--muted)' }}>
                  {s ? <><span style={{ color: 'var(--lime)' }}>✓{s.transparent}</span><span>✗{s.fake}</span>{pct !== null && <span>{pct}%</span>}</> : <span>{gameState.buyInAmount} SOL</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Hot-Take: Writing questions ────────────────────────────
  if (isHotTake && phase === 'submitting-questions') {
    return (
      <div className="page fade-in">
        <Nav />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', flex: 1 }}>
          <HotSeatCard />
          {isHotSeat ? (
            <div className="card" style={{ textAlign: 'center', padding: '32px 20px' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🪑</div>
              <p style={{ fontWeight: 700, fontSize: 18 }}>You're in the hot seat</p>
              <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 8 }}>Players are writing questions for you…</p>
              <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>Questions submitted</span>
                  <span style={{ color: 'var(--muted)' }}>{gameState.submittedQuestions?.length ?? 0}/{total - 1}</span>
                </div>
                <div className="progress">
                  <div className="progress-bar" style={{ width: `${((gameState.submittedQuestions?.length ?? 0) / Math.max(total - 1, 1)) * 100}%` }} />
                </div>
              </div>
            </div>
          ) : (
            <QuestionSubmitPhase hotSeatPlayerName={player?.name || 'Unknown'} onTimerEnd={advance} />
          )}
          <Scores />
        </div>
      </div>
    );
  }

  // ── Hot-Take: Voting on questions ──────────────────────────
  if (isHotTake && phase === 'voting-question') {
    return (
      <div className="page fade-in">
        <Nav />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', flex: 1 }}>
          <HotSeatCard />
          <QuestionVotePhase hotSeatPlayerName={player?.name || 'Unknown'} onTimerEnd={advance} />
          <Scores />
        </div>
      </div>
    );
  }

  // ── Hot-Take: Answering ────────────────────────────────────
  if (isHotTake && phase === 'answering') {
    return (
      <div className="page fade-in">
        <Nav />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', flex: 1 }}>
          <HotSeatCard />
          <div className="card" style={{ textAlign: 'center' }}>
            <p className="label-sm" style={{ marginBottom: 14 }}>Hot Take Question</p>
            <p className="question">{gameState.currentQuestion || 'No question selected'}</p>
          </div>
          {isHotSeat ? (
            <button className="btn btn-primary" onClick={advance}>I've Answered ✓</button>
          ) : (
            <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
              Listen to {player?.name}'s answer…
            </p>
          )}
          <Scores />
        </div>
      </div>
    );
  }

  // ── Classic / Custom / Voting-honesty ─────────────────────
  return (
    <div className="page fade-in">
      <Nav />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', flex: 1 }}>

        {/* Hot seat */}
        <HotSeatCard />

        {/* The question — center of screen */}
        <motion.div
          className="card-pixel corner-accent"
          style={{ padding: '24px 20px', textAlign: 'center', flex: 0 }}
          key={gameState.currentQuestion}
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        >
          <p className="question">{gameState.currentQuestion}</p>
        </motion.div>

        {/* Voting or answering */}
        {isHotSeat ? (
          <div className="card" style={{ textAlign: 'center', padding: '20px' }}>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
              Answer out loud. Others are voting on whether you're being honest.
            </p>
            {votesIn > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>Votes in</span>
                  <span style={{ color: 'var(--muted)' }}>{votesIn}/{voterCount}</span>
                </div>
                <div className="progress">
                  <div className="progress-bar" style={{ width: `${(votesIn / voterCount) * 100}%` }} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p className="label-cipher" style={{ textAlign: 'center', marginBottom: 4 }}>
              Is {player?.name} being honest?
            </p>

            {/* Vote buttons — big, thumb-friendly, fill the space */}
            <div className="vote-wrap">
              <motion.button
                className={`vote-btn vote-honest ${myVote === 'transparent' ? 'voted' : ''}`}
                onClick={() => castVote('transparent')}
                disabled={hasVoted}
                whileTap={{ scale: 0.93 }}
                whileHover={!hasVoted ? { scale: 1.04, boxShadow: '0 0 30px rgba(196,255,60,0.3)' } : {}}
                animate={myVote === 'transparent' ? { scale: [1, 1.12, 1], transition: { duration: 0.35 } } : {}}
                transition={{ type: 'spring', stiffness: 450, damping: 22 }}
              >
                <span style={{ fontSize: 22 }}>✓</span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>Honest</span>
              </motion.button>
              <motion.button
                className={`vote-btn vote-fake ${myVote === 'fake' ? 'voted' : ''}`}
                onClick={() => castVote('fake')}
                disabled={hasVoted}
                whileTap={{ scale: 0.93 }}
                whileHover={!hasVoted ? { scale: 1.04, boxShadow: '0 0 30px rgba(255,82,82,0.3)' } : {}}
                animate={myVote === 'fake' ? { scale: [1, 1.12, 1], transition: { duration: 0.35 } } : {}}
                transition={{ type: 'spring', stiffness: 450, damping: 22 }}
              >
                <span style={{ fontSize: 22 }}>✗</span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>Lying</span>
              </motion.button>
            </div>

            {/* Vote status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {hasVoted ? `You voted ${myVote === 'transparent' ? 'Honest' : 'Lying'}` : 'Cast your vote'}
              </span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{votesIn}/{voterCount} voted</span>
            </div>
            {votesIn > 0 && (
              <div className="progress">
                <div className="progress-bar" style={{ width: `${(votesIn / voterCount) * 100}%` }} />
              </div>
            )}
          </div>
        )}

        {/* Host advance — hot-take */}
        {isHotTake && phase === 'voting-honesty' && isHost && (
          <motion.button
            className="btn btn-secondary"
            onClick={advance}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            whileTap={{ scale: 0.96 }}
          >Next Round →</motion.button>
        )}
        {/* Host advance — classic/custom: skip when votes stall */}
        {!isHotSeat && !isHotTake && isHost && votesIn > 0 && (
          <motion.button
            className="btn btn-ghost"
            style={{ width: '100%', height: 40, fontSize: 13, color: 'var(--muted)' }}
            onClick={forceAdvanceRound}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            whileTap={{ scale: 0.96 }}
          >Force next round ({votesIn}/{voterCount} voted)</motion.button>
        )}

        {/* Live scores at bottom */}
        <div style={{ marginTop: 4 }}>
          <Scores />
        </div>
      </div>
    </div>
  );
};
