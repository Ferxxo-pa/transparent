import React, { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { QuestionSubmitPhase } from '../components/QuestionSubmitPhase';
import { QuestionVotePhase } from '../components/QuestionVotePhase';
import { HostQuestionPicker } from '../components/HostQuestionPicker';
import { PlayerQuestionVote } from '../components/PlayerQuestionVote';
import { RaisePot } from '../components/RaisePot';
import { MagicBlockBadge } from '../components/MagicBlockBadge';
import { QUESTIONS } from '../types/game';
import { StorytellerPhase } from '../components/StorytellerPhase';
import { Blobs, BackButton, Avatar, SolMark } from '../components';

export const GamePlayPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, castVote, advanceHotTakePhase, forceAdvanceRound, endGameNow, pollGameState, hostPickQuestion, sendQuestionsToVote, storytellerChoose, storytellerAdvance } = useGame();
  const { publicKey } = usePrivyWallet();

  const myWallet = publicKey?.toBase58() ?? '';
  const isHost   = myWallet === (gameState as any)?.hostWallet;
  const isHotSeat = myWallet === gameState?.currentPlayerInHotSeat;
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [autoAdvanced, setAutoAdvanced] = useState<number | null>(null);
  const [showRaise, setShowRaise] = useState(false);

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
      const t = setTimeout(() => {
        setAutoAdvanced(currentRound);
        forceAdvanceRound();
      }, 2000);
      return () => clearTimeout(t);
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
  const voterCount = Math.max(total - 1, 1);
  const myVote     = gameState.votes[myWallet];

  // blob palette changes when vote is cast
  const blobPalette = myVote === 'transparent' ? 'truth' : myVote === 'fake' ? 'bluff' : 'vote';

  // ── Top bar ────────────────────────────────────────────────
  const TopBar = () => (
    <div style={{ width: '100%', paddingTop: 16, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <BackButton onClick={() => navigate(-1)} />
      <span className="chip" style={{ fontSize: 11 }}>round {round} / {total}</span>
      <MagicBlockBadge compact />
    </div>
  );

  // ── Subject card ────────────────────────────────────────────
  const SubjectCard = () => (
    <div style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 18px',
    }}>
      <Avatar emoji="🔥" color="var(--pink)" size={44} />
      <div style={{ flex: 1 }}>
        <p className="mono" style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 2 }}>
          subject · round {round}
        </p>
        <p className="display" style={{ fontSize: 20, lineHeight: 1, color: 'var(--ink)' }}>
          {(player?.name ?? 'unknown').toLowerCase()}
          {isHotSeat && <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-faint)', marginLeft: 8 }}>(you)</span>}
        </p>
      </div>
    </div>
  );

  // ── Question card ──────────────────────────────────────────
  const QuestionCard = ({ question, answer }: { question: string; answer?: string }) => {
    // highlight a phrase in pink italic-serif
    const renderQuestion = (text: string) => {
      const words = text.split(' ');
      if (words.length <= 4) return <span className="italic-serif" style={{ color: 'var(--pink)' }}>{text.toLowerCase()}</span>;
      const mid = Math.floor(words.length / 2);
      const start = Math.max(mid - 1, 0);
      const end = Math.min(mid + 2, words.length);
      return (
        <>
          {words.slice(0, start).join(' ').toLowerCase()}{' '}
          <span className="italic-serif" style={{ color: 'var(--pink)' }}>{words.slice(start, end).join(' ').toLowerCase()}</span>
          {' '}{words.slice(end).join(' ').toLowerCase()}
        </>
      );
    };

    return (
      <motion.div
        className="glass glass-strong"
        style={{ padding: 26, borderRadius: 28, textAlign: 'center', width: '100%' }}
        key={question}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      >
        <p className="mono" style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 14 }}>the question</p>
        <p className="display" style={{ fontSize: 26, lineHeight: 1.1, fontWeight: 800 }}>
          {renderQuestion(question)}
        </p>
        {answer && (
          <>
            <div style={{ width: '100%', borderTop: '1px solid rgba(255,255,255,0.08)', margin: '20px 0' }} />
            <p className="mono" style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>their answer</p>
            <p className="italic-serif" style={{ fontSize: 22, color: 'var(--ink)', lineHeight: 1.3 }}>{answer.toLowerCase()}</p>
          </>
        )}
      </motion.div>
    );
  };

  // ── Pot + Raise row ────────────────────────────────────────
  const PotRow = () => (
    <div style={{ display: 'flex', gap: 8, width: '100%', alignItems: 'stretch' }}>
      <div className="glass-flat" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 14px' }}>
        <SolMark size={13} tone="acid" />
        <span className="money" style={{ fontSize: 22, color: 'var(--acid)' }}>{(gameState.currentPot || 0).toFixed(2)}</span>
      </div>
      <button
        className="glass-flat mono"
        onClick={() => setShowRaise(true)}
        style={{
          padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          color: 'var(--tangerine)', fontWeight: 700, fontSize: 11, border: '1px solid rgba(255,138,42,0.4)',
          background: 'rgba(255,138,42,0.12)', borderRadius: 16, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
        }}
      >
        raise +
      </button>
    </div>
  );

  // ── Vote buttons ───────────────────────────────────────────
  const VoteButtons = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
      <div className="vote-wrap">
        <motion.button
          className={`vote-btn is-truth ${myVote === 'transparent' ? 'selected' : ''}`}
          onClick={() => castVote('transparent')}
          disabled={hasVoted}
          whileTap={{ scale: 0.93 }}
          animate={myVote === 'transparent' ? { animation: 'voteThump 0.3s ease' } : {}}
          style={myVote === 'transparent' ? { flex: 1.15 } : {}}
        >
          <span style={{ fontSize: 28 }}>😇</span>
          <span style={{ fontSize: 14, fontWeight: 800, textTransform: 'lowercase' }}>truth</span>
        </motion.button>
        <motion.button
          className={`vote-btn is-bluff ${myVote === 'fake' ? 'selected' : ''}`}
          onClick={() => castVote('fake')}
          disabled={hasVoted}
          whileTap={{ scale: 0.93 }}
          animate={myVote === 'fake' ? { animation: 'voteThump 0.3s ease' } : {}}
          style={myVote === 'fake' ? { flex: 1.15 } : {}}
        >
          <span style={{ fontSize: 28 }}>🤥</span>
          <span style={{ fontSize: 14, fontWeight: 800, textTransform: 'lowercase' }}>bluff</span>
        </motion.button>
      </div>

      {/* Vote progress */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="mono" style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          {votesIn}/{voterCount} voted
        </span>
      </div>
      <div className="progress" style={{ boxShadow: `0 0 12px var(--acid-glow)` }}>
        <div className="progress-bar" style={{ width: `${(votesIn / Math.max(voterCount, 1)) * 100}%` }} />
      </div>
    </div>
  );

  // ── Hot seat waiting view ──────────────────────────────────
  const HotSeatWaiting = () => (
    <div className="glass glass-strong" style={{ textAlign: 'center', padding: '28px 22px', borderRadius: 28, width: '100%' }}>
      <p className="display" style={{ fontSize: 18, marginBottom: 8, color: 'var(--ink-soft)' }}>
        answer out loud. the table is voting.
      </p>
      <div style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)', textTransform: 'uppercase' }}>{votesIn}/{voterCount} voted</span>
        </div>
        <div className="progress" style={{ boxShadow: `0 0 12px var(--acid-glow)` }}>
          <div className="progress-bar" style={{ width: `${(votesIn / Math.max(voterCount, 1)) * 100}%` }} />
        </div>
      </div>
      <button className="btn-degen" onClick={advance} style={{ marginTop: 20, width: '100%' }}>
        done answering ✓
      </button>
    </div>
  );

  // ── Scores ─────────────────────────────────────────────────
  const Scores = () => {
    const scores = gameState.scores ?? {};
    if (!Object.keys(scores).length) return null;
    return (
      <div style={{ marginTop: 4 }}>
        <p className="label" style={{ marginBottom: 8 }}>scores</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {gameState.players.map((p, i) => {
            const s = scores[p.id];
            const t = s ? s.transparent + s.fake : 0;
            const pct = t > 0 ? Math.round((s.transparent / t) * 100) : null;
            return (
              <div key={p.id} className="glass-flat" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px',
                borderColor: p.id === gameState.currentPlayerInHotSeat ? 'var(--glass-stroke-hi)' : undefined,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {p.id === gameState.currentPlayerInHotSeat && <span style={{ fontSize: 11 }}>🔥</span>}
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{(p.name || `p${i+1}`).toLowerCase()}</span>
                  {p.id === myWallet && <span className="mono" style={{ fontSize: 9, color: 'var(--ink-faint)', padding: '1px 5px', background: 'var(--glass-bg)', borderRadius: 4 }}>you</span>}
                </div>
                <div className="mono" style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--ink-faint)' }}>
                  {s ? <><span style={{ color: 'var(--acid)' }}>✓{s.transparent}</span><span>✗{s.fake}</span>{pct !== null && <span>{pct}%</span>}</> : <span>—</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Storyteller Mode ─────────────────────────────────────────
  if (phase && phase.startsWith('storyteller-')) {
    return (
      <div className="page page--game fade-in" style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <Blobs palette="story" />
        <TopBar />
        <SubjectCard />
        <div style={{ marginTop: 24, width: '100%' }}>
          <StorytellerPhase
            phase={phase as any}
            prompt={gameState.storytellerPrompt || gameState.currentQuestion || ''}
            isHotSeat={isHotSeat}
            isHost={isHost}
            playerName={player?.name ?? 'Unknown'}
            storytellerChoice={gameState.storytellerChoice ?? null}
            votes={gameState.votes}
            voteCount={votesIn}
            voterCount={voterCount}
            myVote={myVote}
            onChoose={storytellerChoose}
            onVote={castVote}
            onAdvance={storytellerAdvance}
          />
        </div>
        <Scores />
      </div>
    );
  }

  // ── Host Picking Question ───────────────────────────────────
  if (phase === 'host-picking') {
    const questionPool =
      gameState.questionMode === 'custom' && gameState.customQuestions?.length
        ? gameState.customQuestions
        : QUESTIONS;

    return (
      <div className="page page--game fade-in">
        <Blobs palette="vote" />
        <TopBar />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', flex: 1 }}>
          <SubjectCard />
          {isHost ? (
            <HostQuestionPicker
              questions={questionPool}
              usedIndices={gameState.usedQuestionIndices || []}
              hotSeatPlayerName={player?.name || 'Unknown'}
              onPick={(question, index) => hostPickQuestion(question, index)}
              onSendToVote={(qs, indices) => sendQuestionsToVote(qs, indices)}
            />
          ) : (
            <div className="glass glass-strong" style={{ textAlign: 'center', padding: '28px 18px', borderRadius: 28 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🎯</div>
              <p className="display" style={{ fontSize: 17 }}>host is picking a question</p>
              <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 6 }}>
                for {(player?.name || 'the hot seat').toLowerCase()}…
              </p>
            </div>
          )}
          <Scores />
        </div>
      </div>
    );
  }

  // ── Player Voting on Questions ──────────────────────────────
  if (phase === 'player-voting') {
    const options = gameState.questionOptions || [];
    const handleVoteEnd = () => {
      const picks = gameState.questionPickVotes || {};
      const counts = options.map((_, idx) =>
        Object.values(picks).filter(v => v === idx).length
      );
      const winIdx = counts.indexOf(Math.max(...counts));
      const winQ = options[winIdx] || options[0];
      hostPickQuestion(winQ, -1);
    };

    return (
      <div className="page page--game fade-in">
        <Blobs palette="vote" />
        <TopBar />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', flex: 1 }}>
          <SubjectCard />
          <PlayerQuestionVote
            questions={options}
            questionIndices={[]}
            hotSeatPlayerName={player?.name || 'Unknown'}
            isHotSeatPlayer={isHotSeat}
            onTimerEnd={handleVoteEnd}
          />
          <Scores />
        </div>
      </div>
    );
  }

  // ── Hot-Take: Writing questions ────────────────────────────
  if (isHotTake && phase === 'submitting-questions') {
    return (
      <div className="page page--game fade-in">
        <Blobs palette="vote" />
        <TopBar />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', flex: 1 }}>
          <SubjectCard />
          {isHotSeat ? (
            <div className="glass glass-strong" style={{ textAlign: 'center', padding: '28px 18px', borderRadius: 28 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🪑</div>
              <p className="display" style={{ fontSize: 17 }}>you're in the hot seat</p>
              <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 6 }}>players are writing questions for you…</p>
              <div style={{ marginTop: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)', textTransform: 'uppercase' }}>submitted</span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)' }}>{gameState.submittedQuestions?.length ?? 0}/{total - 1}</span>
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
      <div className="page page--game fade-in">
        <Blobs palette="vote" />
        <TopBar />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', flex: 1 }}>
          <SubjectCard />
          <QuestionVotePhase hotSeatPlayerName={player?.name || 'Unknown'} onTimerEnd={advance} />
          <Scores />
        </div>
      </div>
    );
  }

  // ── Hot-Take: Answering ────────────────────────────────────
  if (isHotTake && phase === 'answering') {
    return (
      <div className="page page--game fade-in">
        <Blobs palette={blobPalette} />
        <TopBar />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', flex: 1 }}>
          <SubjectCard />
          <QuestionCard question={gameState.currentQuestion || 'no question selected'} />
          {isHotSeat ? (
            <button className="btn-degen" onClick={advance} style={{ width: '100%' }}>done answering ✓</button>
          ) : (
            <p className="mono" style={{ textAlign: 'center', color: 'var(--ink-faint)', fontSize: 11, textTransform: 'lowercase' }}>
              listen to {(player?.name || '').toLowerCase()}'s answer…
            </p>
          )}
          <Scores />
        </div>
      </div>
    );
  }

  // ── Classic / Custom / Voting-honesty ─────────────────────
  return (
    <div className="page page--game fade-in">
      <Blobs palette={blobPalette} />
      <TopBar />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', flex: 1 }}>

        <SubjectCard />

        {/* Question */}
        <QuestionCard question={gameState.currentQuestion} />

        {/* Pot + Raise row */}
        {!isHost && !isHotSeat && <PotRow />}

        {/* === HOST VIEW === */}
        {isHost ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Live vote progress */}
            <div className="glass glass-strong" style={{ padding: '18px', textAlign: 'center', borderRadius: 28 }}>
              <p className="mono" style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>live votes</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 12 }}>
                <div style={{ textAlign: 'center' }}>
                  <p className="money" style={{ fontSize: 28, color: 'var(--azure)' }}>
                    {Object.values(gameState.votes).filter(v => v === 'transparent').length}
                  </p>
                  <p className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)' }}>😇 truth</p>
                </div>
                <div style={{ width: 1, background: 'var(--glass-stroke)' }} />
                <div style={{ textAlign: 'center' }}>
                  <p className="money" style={{ fontSize: 28, color: 'var(--tangerine)' }}>
                    {Object.values(gameState.votes).filter(v => v === 'fake').length}
                  </p>
                  <p className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)' }}>🤥 bluff</p>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)', textTransform: 'uppercase' }}>{votesIn}/{voterCount} voted</span>
              </div>
              <div className="progress" style={{ boxShadow: `0 0 12px var(--acid-glow)` }}>
                <div className="progress-bar" style={{ width: `${(votesIn / Math.max(voterCount, 1)) * 100}%` }} />
              </div>
            </div>

            {/* Host controls */}
            {votesIn >= voterCount && voterCount > 0 && (
              <motion.button
                className="btn-degen"
                onClick={forceAdvanceRound}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                whileTap={{ scale: 0.96 }}
                style={{ width: '100%' }}
              >
                next round →
              </motion.button>
            )}
            {votesIn > 0 && votesIn < voterCount && (
              <motion.button
                className="btn-degen" style={{ width: '100%', height: 38, fontSize: 12, opacity: 0.7 }}
                onClick={forceAdvanceRound}
                initial={{ opacity: 0 }} animate={{ opacity: 0.7 }}
                whileTap={{ scale: 0.96 }}
              >
                force next ({votesIn}/{voterCount})
              </motion.button>
            )}

            <Scores />

            <button
              onClick={() => setShowEndConfirm(true)}
              className="mono"
              style={{ fontSize: 11, color: 'var(--ink-faint)', background: 'none', border: 'none', cursor: 'pointer', padding: '12px 0', alignSelf: 'center', textTransform: 'lowercase' }}
            >
              end game
            </button>
          </div>
        ) : isHotSeat ? (
          /* === HOT SEAT PLAYER VIEW === */
          <HotSeatWaiting />
        ) : (
          /* === VOTER VIEW === */
          <VoteButtons />
        )}

        {!isHost && !isHotSeat && <Scores />}
      </div>

      {/* End Game confirmation */}
      <AnimatePresence>
        {showEndConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="scrim"
            style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            onClick={() => setShowEndConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="glass glass-strong"
              style={{ padding: '28px 24px', maxWidth: 320, width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16, borderRadius: 28 }}
            >
              <div>
                <p className="display" style={{ fontSize: 18, marginBottom: 6 }}>end this game?</p>
                <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5 }}>this will end the game for all players and move to the results screen.</p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setShowEndConfirm(false)}
                  className="glass-flat"
                  style={{ flex: 1, height: 44, cursor: 'pointer', color: 'var(--ink-faint)', fontSize: 14, fontWeight: 600 }}
                >
                  cancel
                </button>
                <button
                  onClick={() => { setShowEndConfirm(false); endGameNow(); }}
                  style={{ flex: 1, height: 44, borderRadius: 16, background: 'rgba(255,92,92,0.12)', border: '1px solid rgba(255,92,92,0.3)', color: 'var(--coral)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                >
                  end game
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Raise the Pot — visible during answering/voting phases */}
      {gameState.gamePhase === 'answering' && <RaisePot />}
      <AnimatePresence>{showRaise && <RaisePot />}</AnimatePresence>
    </div>
  );
};
