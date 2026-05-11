import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Blobs } from '../components';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ width: '100%', minHeight: '100dvh', position: 'relative' }}>
      <Blobs palette="home" />

      <div
        className="page"
        style={{
          position: 'relative',
          zIndex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}
      >
        <motion.div
          className="glass glass-strong"
          style={{ padding: '40px 28px', borderRadius: 32, textAlign: 'center', width: '100%' }}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        >
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 400, damping: 18 }}
            style={{ fontSize: 64, lineHeight: 1, marginBottom: 16 }}
          >
            👻
          </motion.div>

          <p className="display" style={{ fontSize: 48, lineHeight: 1, color: 'var(--ink)', marginBottom: 6 }}>
            404
          </p>
          <p className="italic-serif" style={{ fontSize: 28, color: 'var(--pink)', marginBottom: 12 }}>
            nothing here.
          </p>
          <p style={{ fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.5 }}>
            this page doesn't exist — or maybe it never did.
          </p>
        </motion.div>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          <button
            className="btn btn-degen"
            onClick={() => navigate('/')}
          >
            take me home
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => navigate(-1)}
          >
            go back
          </button>
        </div>
      </div>
    </div>
  );
};
