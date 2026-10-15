import React, { useState } from 'react';

const AGE_KEY = 'transparent_age_ok';

export function hasAgeConfirmation(): boolean {
  try {
    return localStorage.getItem(AGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function AgeGate({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState(hasAgeConfirmation);

  if (ok) return <>{children}</>;

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="glass glass-strong" style={{ maxWidth: 420, width: '100%', padding: 28, borderRadius: 28, textAlign: 'center' }}>
        <p className="mono" style={{ letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: 11, color: 'var(--ink-faint)' }}>
          before you tap in
        </p>
        <h1 className="display" style={{ fontSize: 36, margin: '12px 0' }}>
          this room is <span className="italic-serif" style={{ color: 'var(--pink)' }}>18+</span>
        </h1>
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, lineHeight: 1.5 }}>
          Questions default to mild. Hotter questions stay off until a host opts in. Free play is the default. Credits on a card cannot be transferred or cashed out.
        </p>
        <button
          type="button"
          className="btn btn-degen"
          style={{ width: '100%', marginTop: 22 }}
          onClick={() => {
            localStorage.setItem(AGE_KEY, '1');
            setOk(true);
          }}
        >
          I'm 18 or older
        </button>
      </div>
    </div>
  );
}
