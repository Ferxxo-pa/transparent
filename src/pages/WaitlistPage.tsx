import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

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
      setError(e?.message ?? 'Something went wrong — try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page fade-in" style={{ maxWidth: 480 }}>
      <nav className="navbar" style={{ marginBottom: 8 }}>
        <motion.button
          onClick={() => navigate('/')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, fontFamily: 'Space Grotesk', fontWeight: 600 }}
          whileTap={{ scale: 0.95 }}
        >
          <ArrowLeft size={15} /> Back
        </motion.button>
      </nav>

      <motion.div
        style={{ display: 'flex', flexDirection: 'column', gap: 28, width: '100%', flex: 1 }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      >
        {/* Header */}
        <div>
          <span className="chip chip-lime" style={{ marginBottom: 16, display: 'inline-block' }}>Coming Soon</span>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 12 }}>
            Get first access to the physical game.
          </h1>
          <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.7 }}>
            We're building a real card deck with NFC chips and on-chain stakes built in. Sign up and you'll be the first to know when it's ready to ship.
          </p>
        </div>

        {/* Form */}
        <AnimatePresence mode="wait">
          {done ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="card"
              style={{ padding: '32px 24px', textAlign: 'center', background: 'rgba(196,255,60,0.06)', border: '1px solid var(--lime-border)' }}
            >
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(196,255,60,0.15)', border: '1px solid var(--lime-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Check size={22} color="var(--lime)" />
              </div>
              <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--lime)', marginBottom: 8 }}>You're in 🎉</p>
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                First to know when something drops. We won't spam you.
              </p>
            </motion.div>
          ) : (
            <motion.div key="form" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input
                  className="input"
                  type="text"
                  placeholder="Your name (optional)"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
                <input
                  className="input"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                />
                {error && (
                  <p style={{ fontSize: 12, color: 'var(--red)' }}>{error}</p>
                )}
              </div>
              <motion.button
                className="btn btn-primary"
                onClick={submit}
                disabled={!valid || loading}
                whileTap={{ scale: 0.96 }}
                whileHover={valid && !loading ? { scale: 1.03, boxShadow: '0 0 40px rgba(196,255,60,0.45)' } : {}}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                {loading ? 'Joining…' : 'Join the waitlist →'}
              </motion.button>
              <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)' }}>
                No spam. Unsubscribe anytime.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
