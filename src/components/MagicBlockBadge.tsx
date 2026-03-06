import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { isMagicBlockAvailable } from '../lib/magicblock';

/**
 * Visual indicator showing MagicBlock Ephemeral Rollups status.
 * Shows in-game to let players (and judges) know transactions
 * are routing through ER for faster confirmations.
 */
export const MagicBlockBadge: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      try {
        const result = await isMagicBlockAvailable();
        if (mounted) setAvailable(result);
      } catch {
        if (mounted) setAvailable(false);
      }
    };

    check();
    const interval = setInterval(check, 30_000); // Re-check every 30s

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (available === null) return null; // Still checking

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        title={available ? 'MagicBlock Ephemeral Rollups — Active' : 'MagicBlock — Fallback to base layer'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          borderRadius: 20,
          background: available ? 'rgba(196, 255, 60, 0.08)' : 'rgba(255, 255, 255, 0.04)',
          border: `1px solid ${available ? 'rgba(196, 255, 60, 0.2)' : 'rgba(255, 255, 255, 0.06)'}`,
          fontSize: 10,
          fontWeight: 600,
          color: available ? 'var(--lime)' : 'var(--muted)',
          cursor: 'default',
        }}
      >
        <span style={{ fontSize: 10 }}>{available ? '⚡' : '○'}</span>
        ER
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 14px',
        borderRadius: 24,
        background: available
          ? 'linear-gradient(135deg, rgba(196, 255, 60, 0.06), rgba(68, 255, 136, 0.04))'
          : 'rgba(255, 255, 255, 0.03)',
        border: `1px solid ${available ? 'rgba(196, 255, 60, 0.15)' : 'rgba(255, 255, 255, 0.06)'}`,
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Pulse dot */}
      <div style={{ position: 'relative', width: 8, height: 8 }}>
        {available && (
          <motion.div
            animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: 'var(--lime)',
            }}
          />
        )}
        <div
          style={{
            position: 'relative',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: available ? 'var(--lime)' : 'var(--muted)',
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: available ? 'var(--text)' : 'var(--muted)',
            letterSpacing: '0.02em',
          }}
        >
          ⚡ MagicBlock
        </span>
        <span
          style={{
            fontSize: 9,
            color: available ? 'rgba(196, 255, 60, 0.7)' : 'var(--faint)',
            fontWeight: 500,
          }}
        >
          {available ? 'Ephemeral Rollups Active' : 'Base Layer Fallback'}
        </span>
      </div>
    </motion.div>
  );
};
