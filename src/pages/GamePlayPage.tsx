import React, { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { QuestionSubmitPhase } from '../components/QuestionSubmitPhase';
import { QuestionVotePhase } from '../components/QuestionVotePhase';

export const GamePlayPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, castVote, advanceHotTakePhase, forceAdvanceRound, endGameNow } = useGame();
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

  // ── Top bar ────────────────────────────────────────────────
  const TopBar = () => (
    <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, marginBottom: 20 }}>
      <span className="chip chip-lavender" style={{ fontSize: 11 }}>Round {round}/{total}</span>
      {isHost && (
        <button
          onClick={endGameNow}
          style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Space Grotesk', fontWeight: 600 }}
        >
          End Game
        </button>
      )}
    </div>
  );

  // ── Hot Seat Banner ────────────────────────────────────────
  const HotSeatCard = () => (
    <div style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 14,
      padding: '16px 18px', borderRadius: 'var(--r)',
      background: 'linear-gradient(135deg, rgba(196,255,60,0.08), rgba(196,255,60,0.03))',
      border: '1px solid var(--lime-border)',
    }}>
      <div style={{ fontSize: 26, flexShrink: 0 }}>🔥</div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 2 }}>In the hot seat</p>
        <p style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.03em', color: 'var(--lime)', lineHeight: 1 }}>
          {player?.name ?? 'Unknown'}
          {isHotSeat && <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)', marginLeft: 8 }}>(you)</span>}
        </p>
      </div>
    </div>
  );

  // ── Scores ─────────────────────────────────────────────────
  const Scores = () => {
    const scores = gameState.scores ?? {};
    if (!Object.keys(scores).length) return null;
    return (
      <div style={{ marginTop: 4 }}>
        <p className="label-cipher" style={{ marginBottom: 8 }}>Scores</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {gameState.players.map((p, i) => {
            const s = scores[p.id];
            const t = s ? s.transparent + s.fake : 0;
            const pct = t > 0 ? Math.round((s.transparent / t) * 100) : null;
            return (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: 'var(--r-sm)',
                background: 'var(--glass)', border: `1px solid ${p.id === gameState.currentPlayerInHotSeat ? 'var(--lime-border)' : 'var(--border)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {p.id === gameState.currentPlayerInHotSeat && <span style={{ fontSize: 11 }}>🔥</span>}
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name || `P${i+1}`}</span>
                  {p.id === myWallet && <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600, padding: '1px 5px', background: 'var(--card-2)', borderRadius: 4 }}>you</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--muted)' }}>
                  {s ? <><span style={{ color: 'var(--lime)' }}>✓{s.transparent}</span><span>✗{s.fake}</span>{pct !== null && <span>{pct}%</span>}</> : <span>—</span>}
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
        <TopBar />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', flex: 1 }}>
          <HotSeatCard />
          {isHotSeat ? (
            <div style={{ background: 'var(--glass)', border: '1px solid var(--border)', borderRadius: 'var(--r)', textAlign: 'center', padding: '28px 18px' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🪑</div>
              <p style={{ fontWeight: 700, fontSize: 17 }}>You're in the hot seat</p>
              <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 6 }}>Players are writing questions for you…</p>
              <div style={{ marginTop: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11 }}>
                  <span style={{ color: 'var(--muted)' }}>Submitted</span>
                  <span style={{ color: 'var(--muted)' }}>{gameState.submittedQuestions?.length ?? 0}/{total - 1}</span>
                </div>
                <div className="progress"><div className="progress-bar" style={{ width: `${((gameState.submittedQuestions?.length ?? 0) / Math.max(total - 1, 1)) * 100}%` }} /></div>
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
        <TopBar />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', flex: 1 }}>
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
        <TopBar />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', flex: 1 }}>
          <HotSeatCard />
          <div style={{ background: 'var(--glass)', border: '1px solid var(--border)', borderRadius: 'var(--r)', textAlign: 'center', padding: '24px 18px' }}>
            <p className="label-cipher" style={{ marginBottom: 12 }}>Hot Take Question</p>
            <p className="question">{gameState.currentQuestion || 'No question selected'}</p>
          </div>
          {isHotSeat ? (
            <button className="btn btn-primary" onClick={advance}>I've Answered ✓</button>
          ) : (
            <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
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
      <TopBar />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', flex: 1 }}>

        <HotSeatCard />

        {/* Question */}
        <motion.div
          style={{
            padding: '28px 20px', textAlign: 'center',
            background: 'var(--glass)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
          }}
          key={gameState.currentQuestion}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        >
          <p className="question">{gameState.currentQuestion}</p>
        </motion.div>

        {/* Voting or answering */}
        {isHotSeat ? (
          <div style={{ background: 'var(--glass)', border: '1px solid var(--border)', borderRadius: 'var(--r)', textAlign: 'center', padding: '18px' }}>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
              Answer out loud. Others are voting on whether you're being honest.
            </p>
            {total === 1 ? (
              <motion.button
                className="btn btn-secondary"
                style={{ marginTop: 14 }}
                onClick={forceAdvanceRound}
                whileTap={{ scale: 0.96 }}
              >
                Next →
              </motion.button>
            ) : votesIn > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 11 }}>
                  <span style={{ color: 'var(--muted)' }}>Votes in</span>
                  <span style={{ color: 'var(--muted)' }}>{votesIn}/{voterCount}</span>
                </div>
                <div className="progress"><div className="progress-bar" style={{ width: `${(votesIn / voterCount) * 100}%` }} /></div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p className="label-cipher" style={{ textAlign: 'center' }}>
              Is {player?.name} being honest?
            </p>

            <div className="vote-wrap">
              <motion.button
                className={`vote-btn vote-honest ${myVote === 'transparent' ? 'voted' : ''}`}
                onClick={() => castVote('transparent')}
                disabled={hasVoted}
                whileTap={{ scale: 0.93 }}
                whileHover={!hasVoted ? { scale: 1.03 } : {}}
                animate={myVote === 'transparent' ? { scale: [1, 1.1, 1], transition: { duration: 0.3 } } : {}}
              >
                <span style={{ fontSize: 20 }}>✓</span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>Honest</span>
              </motion.button>
              <motion.button
                className={`vote-btn vote-fake ${myVote === 'fake' ? 'voted' : ''}`}
                onClick={() => castVote('fake')}
                disabled={hasVoted}
                whileTap={{ scale: 0.93 }}
                whileHover={!hasVoted ? { scale: 1.03 } : {}}
                animate={myVote === 'fake' ? { scale: [1, 1.1, 1], transition: { duration: 0.3 } } : {}}
              >
                <span style={{ fontSize: 20 }}>✗</span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>Lying</span>
              </motion.button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                {hasVoted ? `Voted ${myVote === 'transparent' ? 'Honest' : 'Lying'}` : 'Cast your vote'}
              </span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{votesIn}/{voterCount}</span>
            </div>
            {votesIn > 0 && (
              <div className="progress"><div className="progress-bar" style={{ width: `${(votesIn / voterCount) * 100}%` }} /></div>
            )}
          </div>
        )}

        {isHotTake && phase === 'voting-honesty' && isHost && (
          <motion.button className="btn btn-secondary" onClick={advance} initial={{ opacity: 0 }} animate={{ opacity: 1 }} whileTap={{ scale: 0.96 }}>
            Next Round →
          </motion.button>
        )}

        {!isHotSeat && !isHotTake && isHost && votesIn > 0 && (
          <motion.button
            className="btn btn-ghost" style={{ width: '100%', height: 38, fontSize: 12 }}
            onClick={forceAdvanceRound}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            whileTap={{ scale: 0.96 }}
          >
            Force next ({votesIn}/{voterCount})
          </motion.button>
        )}

        <Scores />
      </div>
    </div>
  );
};
