import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { claimCard, ClaimResult } from '../lib/credits';
import { parseCardToken } from '../../supabase/functions/_shared/cards';

export const CardClaimPage: React.FC = () => {
  const { cardToken = '' } = useParams<{ cardToken: string }>();
  const navigate = useNavigate();
  const { ready, authenticated, login, getAccessToken, logout } = usePrivy();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClaimResult | null>(null);

  const parsed = parseCardToken(decodeURIComponent(cardToken));
  const devPreview = import.meta.env.DEV && cardToken === 'demo-player';

  const claim = async () => {
    if (devPreview) {
      setResult({
        ok: true,
        granted: 100,
        balance: 100,
        card: { id: 'demo', serial: 'P0001', role: 'player' },
      });
      return;
    }
    if (!parsed) return;
    setWorking(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Log in to claim this card');
      const claimed = await claimCard(parsed.id + '.' + parsed.signature, token);
      setResult(claimed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not claim this card');
    } finally {
      setWorking(false);
    }
  };

  const role = result?.card?.role;
  const serial = result?.card?.serial;

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="glass glass-strong" style={{ width: '100%', maxWidth: 440, padding: '28px 24px', borderRadius: 28 }}>
        <p className="mono" style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--acid)' }}>
          nfc card
        </p>
        <h1 className="display" style={{ fontSize: 34, margin: '8px 0 12px' }}>
          {result ? (role === 'host' ? 'host card' : 'player card') : 'claim this card'}
        </h1>

        {!parsed && !devPreview && (
          <p role="alert" style={{ color: 'var(--coral)' }}>This card link is not valid. Use the URL printed on the card.</p>
        )}

        {(parsed || devPreview) && !result && (
          <>
            <p style={{ color: 'var(--ink-soft)', fontSize: 14, lineHeight: 1.5 }}>
              One claim per card. Player cards add starter credits to your account. Credits stay in the game: no transfer, no cash-out.
            </p>
            {error && (
              <p role="alert" style={{ color: 'var(--coral)', marginTop: 14 }}>{error}</p>
            )}
            <button
              type="button"
              className="btn btn-degen"
              style={{ width: '100%', marginTop: 22 }}
              disabled={working || (!ready && !devPreview)}
              onClick={() => (authenticated || devPreview ? claim() : login())}
            >
              {working ? 'claiming…' : authenticated || devPreview ? 'claim card' : 'log in to claim'}
            </button>
            {authenticated && (
              <button type="button" onClick={() => logout()} className="mono" style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer' }}>
                use a different email
              </button>
            )}
          </>
        )}

        {result?.ok && role === 'host' && (
          <>
            <p style={{ color: 'var(--ink-soft)', fontSize: 14, lineHeight: 1.5 }}>
              Card {serial} is yours. Start a free-play room. The room name is filled in.
            </p>
            <button
              type="button"
              className="btn btn-degen"
              style={{ width: '100%', marginTop: 22 }}
              onClick={() => navigate(`/create?card=${encodeURIComponent(result.card?.id ?? '')}&serial=${encodeURIComponent(serial ?? '')}`)}
            >
              start a room
            </button>
          </>
        )}

        {result?.ok && role === 'player' && (
          <>
            <p style={{ color: 'var(--ink-soft)', fontSize: 14, lineHeight: 1.5 }}>
              {result.alreadyClaimed
                ? `Card ${serial} was already on this account.`
                : `Card ${serial} added ${result.granted ?? 0} credits.`}
              {' '}Balance: {result.balance ?? 0}. These credits cannot be sent or cashed out.
            </p>
            <button type="button" className="btn btn-degen" style={{ width: '100%', marginTop: 22 }} onClick={() => navigate('/join')}>
              join a room
            </button>
          </>
        )}
      </div>
    </div>
  );
};
