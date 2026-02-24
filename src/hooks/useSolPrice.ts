import { useState, useEffect } from 'react';

// Fetches live SOL/USD price from CoinGecko (free, no key needed)
// Caches for 60s to avoid hammering the API
let cached: { price: number; ts: number } | null = null;
const TTL = 60_000;

export function useSolPrice(): number | null {
  const [price, setPrice] = useState<number | null>(() => cached?.price ?? null);

  useEffect(() => {
    const now = Date.now();
    if (cached && now - cached.ts < TTL) {
      setPrice(cached.price);
      return;
    }
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd')
      .then(r => r.json())
      .then(data => {
        const p = data?.solana?.usd;
        if (p) {
          cached = { price: p, ts: Date.now() };
          setPrice(p);
        }
      })
      .catch(() => {}); // fail silently — estimates are optional
  }, []);

  return price;
}

// Format a SOL amount as a USD string, e.g. "~$1.40"
export function solToUsd(sol: number, price: number | null): string {
  if (!price || sol <= 0) return '';
  const usd = sol * price;
  if (usd < 0.01) return `~$${(usd * 100).toFixed(2)}¢`;
  if (usd < 1)    return `~$${usd.toFixed(2)}`;
  return `~$${usd.toFixed(2)}`;
}
