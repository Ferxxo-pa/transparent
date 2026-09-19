import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useGame } from '../contexts/GameContext';

/** Read-only recovery controls; never advance a round or send a transaction. */
export function GameRefreshBanner() {
  const { gameState, refreshError, pollGameState } = useGame();
  const retryInFlight = useRef(false);
  const [retrying, setRetrying] = useState(false);
  if (!gameState || !refreshError) return null;
  async function retry() {
    if (retryInFlight.current) return;
    retryInFlight.current = true;
    setRetrying(true);
    try { await pollGameState(); } finally { retryInFlight.current = false; setRetrying(false); }
  }
  return (
    <section role="status" aria-live="polite" aria-label="Game connection" style={{ position: 'relative', zIndex: 20, maxWidth: 640, margin: '12px auto', padding: 16, borderRadius: 12, background: '#201c27', border: '1px solid #e4ad69', color: '#fff' }}>
      <p style={{ margin: '0 0 12px' }}>{refreshError}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <button type="button" onClick={retry} disabled={retrying} aria-busy={retrying} style={{ minHeight: 44, padding: '8px 16px' }}>{retrying ? 'Refreshing…' : 'Retry refresh'}</button>
        <Link to="/" state={{ skipGameRedirect: true }} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', color: '#fff' }}>Return home</Link>
      </div>
    </section>
  );
}
