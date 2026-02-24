import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Package, Nfc, Zap, Check } from 'lucide-react';
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
      <nav className="navbar">
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(196,255,60,0.1)', border: '1px solid var(--lime-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={18} color="var(--lime)" />
            </div>
            <span className="chip chip-lime">Coming Soon</span>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 10 }}>
            The Physical Game
          </h1>
          <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.6 }}>
            A real card deck with NFC chips built in. Tap to launch the game instantly — no room codes, no typing. Just deal and play.
          </p>
        </div>

        {/* Features */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { icon: <Nfc size={15} />, title: 'NFC tap to launch', desc: 'One tap on the chip loads the game for everyone. No link sharing needed.' },
            { icon: <Package size={15} />, title: 'Full card deck included', desc: 'Premium cards with the original question set. Works standalone, no app required.' },
            { icon: <Zap size={15} />, title: 'On-chain stakes built in', desc: 'The NFC chip connects directly to your wallet. Entry fees and payouts are instant.' },
          ].map((f, i) => (
            <motion.div
              key={i}
              className="card"
              style={{ padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.07, type: 'spring', stiffness: 300, damping: 28 }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--glass)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--lime)', flexShrink: 0 }}>
                {f.icon}
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>{f.title}</p>
                <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{f.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Form */}
        <AnimatePresence mode="wait">
          {done ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="card"
              style={{ padding: '28px 24px', textAlign: 'center', background: 'rgba(196,255,60,0.06)', border: '1px solid var(--lime-border)' }}
            >
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(196,255,60,0.15)', border: '1px solid var(--lime-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Check size={22} color="var(--lime)" />
              </div>
              <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--lime)', marginBottom: 6 }}>You're on the list 🎉</p>
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                We'll ping you the moment the physical game drops. First to know, first to cop.
              </p>
            </motion.div>
          ) : (
            <motion.div key="form" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Get pinged when it drops</p>
                  <p style={{ fontSize: 12, color: 'var(--muted)' }}>No spam. Just a heads up when the cards are ready.</p>
                </div>
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
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
