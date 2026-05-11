import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useGame } from '../contexts/GameContext';
import { WalletSetupGate } from '../components/WalletSetupGate';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { Blobs, BackButton, SolMark, WalletChip } from '../components';

export const JoinGamePage: React.FC = () => {
  const navigate = useNavigate();
  const { code: codeParam } = useParams<{ code?: string }>();
  const { joinGame, loading, error } = useGame();
  const { displayName, walletReady } = usePrivyWallet();

  // Parse pre-filled code from URL param into 6 individual digits
  const initialDigits = (() => {
    if (!codeParam) return ['', '', '', '', '', ''];
    const raw = codeParam.replace(/[^0-9]/g, '').slice(0, 6);
    const arr = raw.split('');
    while (arr.length < 6) arr.push('');
    return arr;
  })();

  const [digits, setDigits] = useState<string[]>(initialDigits);
  const [nickname, setNickname] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first empty digit on mount
  useEffect(() => {
    const firstEmpty = digits.findIndex(d => d === '');
    const idx = firstEmpty === -1 ? 5 : firstEmpty;
    inputRefs.current[idx]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/[^0-9]/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);

    // Auto-advance to next input
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
    if (!pasted) return;
    const next = [...digits];
    for (let i = 0; i < 6; i++) {
      next[i] = pasted[i] || '';
    }
    setDigits(next);
    const focusIdx = Math.min(pasted.length, 5);
    inputRefs.current[focusIdx]?.focus();
  };

  const allFilled = digits.every(d => d !== '');
  const codeString = `${digits.slice(0, 3).join('')}-${digits.slice(3).join('')}`;

  const handleJoin = async () => {
    if (!allFilled) return;
    const ok = await joinGame(codeString, nickname.trim() || undefined);
    if (ok) navigate('/waiting');
  };

  return (
    <WalletSetupGate>
      <div style={{ width: '100%', minHeight: '100dvh', position: 'relative' }}>
        <Blobs palette="join" />

        <div
          className="page page--form fade-in scroll-no-bar"
          style={{ position: 'relative', zIndex: 1, overflowY: 'auto' }}
        >
          {/* header */}
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <BackButton onClick={() => navigate('/')} />
            <WalletChip />
          </div>

          {/* main card — centered vertically */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <motion.div
            className="glass glass-strong"
            style={{ width: '100%', padding: '30px 24px', borderRadius: 30, textAlign: 'center' }}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
          >
            {/* sticker */}
            <div style={{ display: 'inline-flex', marginBottom: 14 }}>
              <span className="sticker sticker-azure">code</span>
            </div>

            {/* title */}
            <h2 className="display" style={{ fontSize: 28, margin: 0, marginBottom: 22, lineHeight: 1 }}>
              drop the <span className="italic-serif" style={{ fontWeight: 400, color: 'var(--azure)' }}>digits</span>
            </h2>

            {/* 6 digit inputs */}
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 28 }}
              onPaste={handlePaste}
            >
              {digits.map((d, i) => (
                <React.Fragment key={i}>
                  <input
                    ref={el => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={e => handleDigitChange(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(i, e)}
                    style={{
                      width: 38,
                      height: 56,
                      borderRadius: 14,
                      background: d ? 'rgba(77,168,255,0.15)' : 'rgba(255,255,255,0.04)',
                      border: d ? '1.5px solid rgba(77,168,255,0.6)' : '1px solid rgba(255,255,255,0.12)',
                      color: d ? 'var(--azure)' : 'var(--ink)',
                      fontSize: 26,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: 700,
                      textAlign: 'center',
                      outline: 'none',
                      caretColor: 'var(--azure)',
                      transition: 'all 0.2s',
                      WebkitAppearance: 'none',
                    }}
                  />
                  {/* dot separator after digit 3 */}
                  {i === 2 && (
                    <div style={{ alignSelf: 'center', color: 'var(--ink-faint)', fontSize: 24, fontWeight: 700 }}>·</div>
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* handle field */}
            <div style={{ marginTop: 24, textAlign: 'left' }}>
              <label className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)', letterSpacing: '0.14em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                your handle
              </label>
              <input
                className="input-bare"
                type="text"
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                placeholder="@degen"
                maxLength={18}
              />
            </div>
          </motion.div>
          </div>

          {/* error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                width: '100%',
                marginTop: 16,
                background: 'rgba(255,92,92,0.08)',
                border: '1px solid rgba(255,92,92,0.25)',
                borderRadius: 16,
                padding: '12px 14px',
                color: 'var(--coral)',
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              {error.includes('TypeError') || error.includes('Failed to fetch')
                ? 'connection error — check your internet and try again'
                : error}
            </motion.div>
          )}

          {/* CTA */}
          <div style={{ width: '100%', paddingTop: 20, paddingBottom: 24 }}>
            <motion.button
              className="btn btn-degen"
              onClick={handleJoin}
              disabled={!allFilled || loading}
              whileTap={allFilled && !loading ? { scale: 0.96 } : {}}
              style={{ opacity: !allFilled || loading ? 0.4 : 1, cursor: !allFilled || loading ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {loading ? 'joining...' : (
                <>
                  ape in · <SolMark size={14} tone="dark" /> 0.1
                </>
              )}
            </motion.button>
          </div>
        </div>
      </div>
    </WalletSetupGate>
  );
};
