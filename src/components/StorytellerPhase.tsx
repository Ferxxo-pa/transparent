import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  phase: 'storyteller-prep' | 'storyteller-telling' | 'storyteller-voting' | 'storyteller-reveal';
  prompt: string;
  isHotSeat: boolean;
  isHost: boolean;
  playerName: string;
  storytellerChoice: 'truth' | 'fake' | null;
  votes: Record<string, 'transparent' | 'fake'>;
  voteCount: number;
  voterCount: number;
  myVote?: 'transparent' | 'fake';
  onChoose: (choice: 'truth' | 'fake') => void;
  onVote: (vote: 'transparent' | 'fake') => void;
  onAdvance: () => void;
}

export const StorytellerPhase: React.FC<Props> = ({
  phase, prompt, isHotSeat, isHost, playerName, storytellerChoice,
  votes, voteCount, voterCount, myVote, onChoose, onVote, onAdvance,
}) => {

  // ── PREP PHASE: Hot-seat player sees prompt, chooses truth/fake ──
  if (phase === 'storyteller-prep') {
    if (isHotSeat) {
      return (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', alignItems: 'center', textAlign: 'center' }}
        >
          <div style={{ fontSize: 40 }}>🎭</div>
          <p className="label-cipher" style={{ fontSize: 11 }}>YOUR PROMPT</p>
          <div style={{
            padding: '24px 20px', borderRadius: 'var(--r)',
            background: 'linear-gradient(135deg, rgba(196,255,60,0.08), rgba(196,255,60,0.02))',
            border: '1px solid var(--lime-border)', width: '100%',
          }}>
            <p style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.4, color: 'var(--lime)' }}>{prompt}</p>
          </div>
          
          <p style={{ color: 'var(--muted)', fontSize: 13, maxWidth: 300 }}>
            Are you going to tell a <strong>real</strong> story or <strong>make one up</strong>? Choose below — nobody else can see this.
          </p>
          
          <div style={{ display: 'flex', gap: 12, width: '100%' }}>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => onChoose('truth')}
              className="btn-primary"
              style={{ flex: 1, padding: '16px', fontSize: 16, background: 'var(--green)', color: '#000' }}
            >
              ✅ Tell the Truth
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => onChoose('fake')}
              className="btn-primary"
              style={{ flex: 1, padding: '16px', fontSize: 16, background: '#ef4444', color: '#fff' }}
            >
              🎭 Fake It
            </motion.button>
          </div>
        </motion.div>
      );
    }
    
    // Other players wait
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ textAlign: 'center', padding: 40 }}
      >
        <div style={{ fontSize: 40, marginBottom: 16 }}>🎭</div>
        <p style={{ fontSize: 18, fontWeight: 700 }}>{playerName} is preparing...</p>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>
          They're about to tell a story. Your job: figure out if it's real or fake.
        </p>
        <div className="loading-dots" style={{ marginTop: 20 }}>
          <span>•</span><span>•</span><span>•</span>
        </div>
      </motion.div>
    );
  }

  // ── TELLING PHASE: Hot-seat tells the story, host advances when done ──
  if (phase === 'storyteller-telling') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', alignItems: 'center', textAlign: 'center' }}
      >
        <div style={{ fontSize: 40 }}>🎤</div>
        
        <div style={{
          padding: '16px 20px', borderRadius: 'var(--r)',
          background: 'var(--glass)', border: '1px solid var(--border)', width: '100%',
        }}>
          <p className="label-cipher" style={{ marginBottom: 6 }}>THE PROMPT</p>
          <p style={{ fontSize: 16, fontWeight: 600 }}>{prompt}</p>
        </div>

        <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--lime)' }}>
          {isHotSeat ? "You're telling your story!" : `${playerName} is telling their story...`}
        </p>

        {isHotSeat && (
          <p style={{ 
            fontSize: 12, color: storytellerChoice === 'truth' ? 'var(--green)' : '#ef4444',
            background: storytellerChoice === 'truth' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            padding: '6px 14px', borderRadius: 20,
          }}>
            {storytellerChoice === 'truth' ? '✅ You chose: TRUTH' : '🎭 You chose: FAKE'}
          </p>
        )}

        {!isHotSeat && (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Listen carefully... is it real or fake?
          </p>
        )}

        {isHost && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onAdvance}
            className="btn-primary"
            style={{ padding: '14px 32px', marginTop: 12 }}
          >
            Story Done → Vote 🗳️
          </motion.button>
        )}
      </motion.div>
    );
  }

  // ── VOTING PHASE: Everyone except hot-seat votes ──
  if (phase === 'storyteller-voting') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', alignItems: 'center', textAlign: 'center' }}
      >
        <div style={{ fontSize: 40 }}>🗳️</div>
        <p style={{ fontSize: 20, fontWeight: 700 }}>Was {playerName} being transparent?</p>

        {isHotSeat ? (
          <div style={{ padding: 20 }}>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>
              The group is voting on your story...
            </p>
            <p style={{ fontSize: 24, fontWeight: 700, marginTop: 12 }}>
              {voteCount}/{voterCount} votes in
            </p>
          </div>
        ) : myVote ? (
          <div style={{ padding: 20 }}>
            <p style={{ fontSize: 16, fontWeight: 600 }}>
              You voted: {myVote === 'transparent' ? '✅ Transparent' : '🎭 Fake'}
            </p>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>
              {voteCount}/{voterCount} votes in
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, width: '100%' }}>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => onVote('transparent')}
              className="btn-primary"
              style={{ flex: 1, padding: '18px', fontSize: 16, background: 'var(--green)', color: '#000' }}
            >
              ✅ Transparent
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => onVote('fake')}
              className="btn-primary"
              style={{ flex: 1, padding: '18px', fontSize: 16, background: '#ef4444', color: '#fff' }}
            >
              🎭 Fake
            </motion.button>
          </div>
        )}

        {isHost && voteCount >= voterCount && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onAdvance}
            className="btn-primary"
            style={{ padding: '14px 32px', marginTop: 12 }}
          >
            Reveal Answer 👀
          </motion.button>
        )}
      </motion.div>
    );
  }

  // ── REVEAL PHASE: Show if it was truth or fake ──
  if (phase === 'storyteller-reveal') {
    const isTruth = storytellerChoice === 'truth';
    const correctVoters = Object.entries(votes).filter(([_, v]) => {
      if (isTruth) return v === 'transparent';
      return v === 'fake';
    }).length;
    const totalVoters = Object.keys(votes).length;

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', alignItems: 'center', textAlign: 'center' }}
      >
        <motion.div
          animate={{ rotate: [0, -10, 10, -10, 0] }}
          transition={{ duration: 0.5 }}
          style={{ fontSize: 60 }}
        >
          {isTruth ? '✅' : '🎭'}
        </motion.div>

        <p style={{ fontSize: 28, fontWeight: 800, color: isTruth ? 'var(--green)' : '#ef4444' }}>
          {isTruth ? 'IT WAS THE TRUTH!' : 'THEY FAKED IT!'}
        </p>

        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          {correctVoters}/{totalVoters} people guessed correctly
        </p>

        {/* Vote breakdown */}
        <div style={{ display: 'flex', gap: 20, padding: '12px 0' }}>
          <div>
            <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--green)' }}>
              {Object.values(votes).filter(v => v === 'transparent').length}
            </span>
            <p style={{ fontSize: 11, color: 'var(--muted)' }}>voted transparent</p>
          </div>
          <div>
            <span style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>
              {Object.values(votes).filter(v => v === 'fake').length}
            </span>
            <p style={{ fontSize: 11, color: 'var(--muted)' }}>voted fake</p>
          </div>
        </div>

        {isHost && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onAdvance}
            className="btn-primary"
            style={{ padding: '14px 32px', marginTop: 12 }}
          >
            Next Round →
          </motion.button>
        )}
      </motion.div>
    );
  }

  return null;
};
