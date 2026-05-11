import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { Blobs, BackButton } from '../components';

export const WaitlistPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [name, setName]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('waitlist')
        .upsert({ email: email.trim().toLowerCase(), name: name.trim() || null }, { onConflict: 'email', ignoreDuplicates: true });
      if (err) throw err;
      setDone(true);
    } catch (e: any) {
      setError(e?.message ?? 'something went wrong — try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ width: '100%', minHeight: '100dvh', position: 'relative' }}>
      <Blobs palette="lobby" />

      <div
        className="page page--form scroll-no-bar"
        style={{
          position: 'relative',
          zIndex: 1,
          overflowY: 'auto',
          gap: 18,
        }}
      >
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <BackButton onClick={() => navigate('/')} />
          <span className="chip chip-acid">coming soon</span>
        </div>

        {/* title */}
        <div style={{ marginBottom: 4 }}>
          <span className="display" style={{ fontSize: 36, lineHeight: 1.05, color: 'var(--ink)' }}>
            get first{' '}
          </span>
          <span className="italic-serif" style={{ fontSize: 36, color: 'var(--acid)' }}>
            access.
          </span>
          <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6, marginTop: 12 }}>
            we're building a real card deck with nfc chips and on-chain stakes built in. sign up and you'll be the first to know when it ships.
          </p>
        </div>

        {/* form / success */}
        <AnimatePresence mode="wait">
          {done ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass glass-strong"
              style={{ padding: '32px 24px', borderRadius: 28, textAlign: 'center' }}
            >
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 400, damping: 18 }}
                style={{ fontSize: 48, lineHeight: 1, marginBottom: 14 }}
              >
                🎉
              </motion.div>
              <p className="display" style={{ fontSize: 22, color: 'var(--acid)', marginBottom: 8 }}>you're in</p>
              <p style={{ fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.6 }}>
                first to know when something drops. we won't spam you.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              className="glass glass-strong"
              style={{ padding: '24px 20px', borderRadius: 28, display: 'flex', flexDirection: 'column', gap: 14 }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            >
              <div>
                <label className="mono" style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'block', marginBottom: 6 }}>
                  name (optional)
                </label>
                <input
                  className="input-bare"
                  type="text"
                  placeholder="what should we call you?"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>

              <div>
                <label className="mono" style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'block', marginBottom: 6 }}>
                  email
                </label>
                <input
                  className="input-bare"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                />
              </div>

              {error && (
                <div style={{
                  background: 'rgba(255,92,92,0.10)',
                  border: '1px solid rgba(255,92,92,0.28)',
                  borderRadius: 16,
                  padding: '10px 14px',
                  color: 'var(--coral)',
                  fontSize: 13,
                }}>
                  {error}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* CTA */}
        {!done && (
          <div style={{ marginTop: 'auto', paddingTop: 8 }}>
            <button
              className="btn btn-degen"
              onClick={submit}
              disabled={!valid || loading}
            >
              {loading ? 'joining...' : 'join the waitlist →'}
            </button>
            <p className="mono" style={{ textAlign: 'center', fontSize: 10, color: 'var(--ink-faint)', marginTop: 8, letterSpacing: '0.04em' }}>
              no spam. unsubscribe anytime.
            </p>
          </div>
        )}

        {done && (
          <div style={{ marginTop: 'auto', paddingTop: 8 }}>
            <button
              className="btn btn-ghost"
              onClick={() => navigate('/')}
            >
              back to home
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
