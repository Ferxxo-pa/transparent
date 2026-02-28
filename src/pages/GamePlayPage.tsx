import React, { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { QuestionSubmitPhase } from '../components/QuestionSubmitPhase';
import { QuestionVotePhase } from '../components/QuestionVotePhase';

export const GamePlayPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, castVote, advanceHotTakePhase, voteForQuestionOption, skipQuestionPick, forceAdvanceRound, endGameNow, pollGameState } = useGame();
  const { publicKey } = usePrivyWallet();

  const myWallet = publicKey?.toBase58() ?? '';
  const isHost   = myWallet === (gameState as any)?.hostWallet;
  const isHotSeat = myWallet === gameState?.currentPlayerInHotSeat;
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [autoAdvanced, setAutoAdvanced] = useState<number | null>(null);

  useEffect(() => {
    if (gameState?.gameStatus === 'gameover') navigate('/gameover');
    if (gameState?.gameStatus === 'cancelled') navigate('/', { replace: true });
  }, [gameState?.gameStatus, navigate]);

  // Poll every 3s as Realtime fallback
  useEffect(() => {
    if (!gameState || gameState.gameStatus !== 'playing') return;
    const interval = setInterval(() => { pollGameState(); }, 3000);
    return () => clearInterval(interval);
  }, [gameState?.gameStatus, pollGameState]);

  // Auto-advance when host detects all votes are in
  useEffect(() => {
    if (!gameState || !isHost || gameState.gameStatus !== 'playing') return;
    const currentRound = gameState.currentRound ?? 0;
    if (autoAdvanced === currentRound) return;
    const hotSeatWallet = gameState.currentPlayerInHotSeat;
    const eligible = gameState.players.filter(p => p.id !== hotSeatWallet).length;
    const needed = Math.max(eligible, 1);
    if (gameState.voteCount >= needed && needed > 0) {
      const timer = setTimeout(() => {
        setAutoAdvanced(currentRound);
        forceAdvanceRound();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [gameState?.voteCount, gameState?.currentRound, isHost, autoAdvanced, forceAdvanceRound]);

  const advance = useCallback(() => {
    if (isHost) advanceHotTakePhase();
  }, [advanceHotTakePhase, isHost]);

  if (!gameState) return null;

  const player     = gameState.players.find(p => p.id === gameState.currentPlayerInHotSeat);
  const hasVoted   = !!gameState.votes[myWallet];
  const isHotTake  = gameState.questionMode === 'hot-take';
  const phase      = gameState.gamePhase;
  const round      = (gameState.currentRound ?? 0) + 1;
  const total      = gameState.numQuestions > 0 ? gameState.numQuestions : gameState.players.length;
  const votesIn    = gameState.voteCount;
  // All players except hot seat player vote (host is NOT a player)
  const voterCount = Math.max(total - 1, 1);
  const myVote     = gameState.votes[myWallet];

  // ── Top bar ────────────────────────────────────────────────
  const TopBar = () => (
    <div style={{ width: '100%', paddingTop: 16, marginBottom: 20 }}>
      <span className="chip chip-lavender" style={{ fontSize: 11 }}>Round {round}/{total}</span>
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

  // ── Picking Question Phase (group votes on which question) ──
  if (phase === 'picking-question' && gameState.questionOptions) {
    const myPickVote = gameState.questionPickVotes?.[myWallet];
    const hasPickVoted = myPickVote !== undefined;
    const pickVotes = gameState.questionPickVotes ?? {};
    const totalPickVotes = Object.keys(pickVotes).length;
    const eligiblePickers = gameState.players.filter(p => p.id !== gameState.currentPlayerInHotSeat).length;

    return (
      <div className="page fade-in">
        <TopBar />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', flex: 1 }}>
          <HotSeatCard />

          <div style={{
            padding: '20px', textAlign: 'center',
            background: 'var(--glass)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
          }}>
            <p className="label-cipher" style={{ marginBottom: 6 }}>Pick the question 🎯</p>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>
              {isHotSeat
                ? "The group is picking your question... brace yourself"
                : "Vote on which question they have to answer"
              }
            </p>
          </div>

          {/* Host can skip the pick and go with a random question */}
          {isHost && (
            <motion.button
              className="btn btn-secondary"
              onClick={skipQuestionPick}
              whileTap={{ scale: 0.96 }}
              style={{ fontSize: 12 }}
            >
              Skip → Random Question
            </motion.button>
          )}

          {!isHotSeat ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {gameState.questionOptions.map((q, idx) => {
                const votesForThis = Object.values(pickVotes).filter(v => v === idx).length;
                return (
                  <motion.button
                    key={idx}
                    onClick={() => !hasPickVoted && voteForQuestionOption(idx)}
                    disabled={hasPickVoted}
                    whileTap={!hasPickVoted ? { scale: 0.97 } : {}}
                    style={{
                      padding: '14px 16px',
                      background: myPickVote === idx
                        ? 'rgba(196,255,60,0.12)'
                        : 'var(--glass)',
                      border: `1px solid ${myPickVote === idx ? 'var(--lime-border, rgba(196,255,60,0.4))' : 'var(--border)'}`,
                      borderRadius: 'var(--r-sm, 10px)',
                      cursor: hasPickVoted ? 'default' : 'pointer',
                      opacity: hasPickVoted && myPickVote !== idx ? 0.5 : 1,
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      color: 'var(--text)',
                      fontSize: 13,
                      lineHeight: 1.4,
                      position: 'relative',
                      transition: '0.2s',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: 'var(--lime, #C4FF3C)', marginRight: 8 }}>
                      {String.fromCharCode(65 + idx)}.
                    </span>
                    {q}
                    {hasPickVoted && votesForThis > 0 && (
                      <span style={{
                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                        fontSize: 11, color: 'var(--muted)',
                      }}>
                        {votesForThis} vote{votesForThis !== 1 ? 's' : ''}
                      </span>
                    )}
                  </motion.button>
                );
              })}
              {hasPickVoted && (
                <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Waiting for others... {totalPickVotes}/{eligiblePickers}
                </p>
              )}
            </div>
          ) : (
            <div style={{
              padding: '24px', textAlign: 'center',
              background: 'rgba(196,255,60,0.05)', border: '1px solid var(--lime-border, rgba(196,255,60,0.2))',
              borderRadius: 'var(--r)',
            }}>
              <p style={{ fontSize: 24, marginBottom: 8 }}>😰</p>
              <p style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>They're picking your question...</p>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                {totalPickVotes}/{eligiblePickers} voted
              </p>
            </div>
          )}
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

        {/* === HOST VIEW (Kahoot-style: spectator + controller) === */}
        {isHost ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Live vote progress */}
            <div style={{ background: 'var(--glass)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '18px', textAlign: 'center' }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>Live Votes</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 12 }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--lime)' }}>
                    {Object.values(gameState.votes).filter(v => v === 'transparent').length}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--muted)' }}>✓ Honest</p>
                </div>
                <div style={{ width: 1, background: 'var(--border)' }} />
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--red, #ff5252)' }}>
                    {Object.values(gameState.votes).filter(v => v === 'fake').length}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--muted)' }}>✗ Lying</p>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 11 }}>
                <span style={{ color: 'var(--muted)' }}>Votes in</span>
                <span style={{ color: 'var(--muted)' }}>{votesIn}/{voterCount}</span>
              </div>
              <div className="progress"><div className="progress-bar" style={{ width: `${(votesIn / Math.max(voterCount, 1)) * 100}%` }} /></div>
            </div>

            {/* Host controls */}
            {votesIn >= voterCount && voterCount > 0 && (
              <motion.button
                className="btn btn-primary"
                onClick={forceAdvanceRound}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                whileTap={{ scale: 0.96 }}
              >
                Next Round →
              </motion.button>
            )}
            {votesIn > 0 && votesIn < voterCount && (
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

            <button
              onClick={() => setShowEndConfirm(true)}
              style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Space Grotesk', fontWeight: 500, padding: '12px 0', alignSelf: 'center' }}
            >
              End Game
            </button>
          </div>
        ) : isHotSeat ? (
          /* === HOT SEAT PLAYER VIEW === */
          <div style={{ background: 'var(--glass)', border: '1px solid var(--border)', borderRadius: 'var(--r)', textAlign: 'center', padding: '18px' }}>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
              Answer out loud. {voterCount === 1 ? 'The other player is voting' : 'Others are voting'} on whether you're being honest.
            </p>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 11 }}>
                <span style={{ color: 'var(--muted)' }}>Votes in</span>
                <span style={{ color: 'var(--muted)' }}>{votesIn}/{voterCount}</span>
              </div>
              <div className="progress"><div className="progress-bar" style={{ width: `${(votesIn / Math.max(voterCount, 1)) * 100}%` }} /></div>
            </div>
          </div>
        ) : (
          /* === VOTER VIEW === */
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
            <div className="progress"><div className="progress-bar" style={{ width: `${(votesIn / Math.max(voterCount, 1)) * 100}%` }} /></div>

            <Scores />
          </div>
        )}
      </div>

      {/* End Game confirmation */}
      <AnimatePresence>
        {showEndConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', padding: 20 }}
            onClick={() => setShowEndConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '28px 24px', maxWidth: 320, width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <div>
                <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>End this game?</p>
                <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>This will end the game for all players and move to the results screen.</p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setShowEndConfirm(false)}
                  style={{ flex: 1, height: 44, borderRadius: 'var(--r-pill)', background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Space Grotesk' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setShowEndConfirm(false); endGameNow(); }}
                  style={{ flex: 1, height: 44, borderRadius: 'var(--r-pill)', background: 'rgba(255,82,82,0.15)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Space Grotesk' }}
                >
                  End Game
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
