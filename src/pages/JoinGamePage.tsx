import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { useGame } from '../contexts/GameContext';
import { WalletSetupGate } from '../components/WalletSetupGate';
import { usePrivyWallet } from '../contexts/PrivyContext';

export const JoinGamePage: React.FC = () => {
  const navigate = useNavigate();
  const { joinGame, loading, error } = useGame();
  const { displayName, walletReady } = usePrivyWallet();
  const [code, setCode]         = useState('');
  const [nickname, setNickname] = useState('');

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value.replace(/[^0-9]/g, '');
    if (v.length > 3) v = v.slice(0, 3) + '-' + v.slice(3, 6);
    setCode(v);
  };

  const canJoin = code.length === 7;

  const handleJoin = async () => {
    if (!canJoin) return;
    const ok = await joinGame(code, nickname.trim() || undefined);
    if (ok) navigate('/waiting');
  };

  return (
    <WalletSetupGate>
    <div className="page fade-in">
      <nav className="navbar" style={{ minHeight: 38, display: 'flex', alignItems: 'center' }}>
        <motion.button
          onClick={() => navigate('/')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, fontFamily: 'Space Grotesk', fontWeight: 600 }}
          whileTap={{ scale: 0.95 }}
        >
          <ArrowLeft size={15} /> Back
        </motion.button>
      </nav>

      <div style={{ height: 16 }} />

      <motion.div
        style={{ display: 'flex', flexDirection: 'column', gap: 28, width: '100%', flex: 1, paddingBottom: 80 }}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
      >
        <div>
          <div className="heading">Join a room</div>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6 }}>Enter the code from the host</p>
        </div>

        {/* Code input — hero element */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 24, delay: 0.1 }}
        >
          <p className="label-cipher" style={{ marginBottom: 10 }}>Room Code</p>
          <input
            className="input-code"
            value={code}
            onChange={handleCodeChange}
            placeholder="000-000"
            maxLength={7}
            inputMode="numeric"
            autoFocus
          />
        </motion.div>

        {/* Nickname */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26, delay: 0.18 }}
        >
          <p className="label-cipher" style={{ marginBottom: 8 }}>Your Name</p>
          <input
            className="input"
            type="text"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder="What should people call you?"
            maxLength={18}
          />
        </motion.div>

        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            style={{ background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 'var(--r-sm)', padding: '12px 14px', color: 'var(--red)', fontSize: 13 }}
          >
            ⚠️ {error}
          </motion.div>
        )}
      </motion.div>

      {/* Sticky CTA */}
      <div style={{ width: '100%', paddingTop: 8 }}>
        <motion.button
          className="btn btn-primary"
          onClick={handleJoin}
          disabled={!canJoin || loading}
          whileTap={{ scale: 0.96 }}
          whileHover={canJoin && !loading ? { scale: 1.03, boxShadow: '0 0 40px rgba(196,255,60,0.45)' } : {}}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        >
          {loading ? 'Joining…' : canJoin ? 'Join Game →' : 'Enter Room Code'}
        </motion.button>
      </div>
    </div>
    </WalletSetupGate>
  );
};
