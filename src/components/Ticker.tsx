import React, { useEffect, useRef, useState } from 'react';

interface TickerProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

export const Ticker: React.FC<TickerProps> = ({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
}) => {
  const [display, setDisplay] = useState(value);
  const rafRef = useRef<number>();
  const startRef = useRef<number>();
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;

    if (from === to) return;

    const duration = 700;

    const animate = (timestamp: number) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;

      setDisplay(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplay(to);
        fromRef.current = to;
      }
    };

    startRef.current = undefined;
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  // Sync fromRef when display settles
  useEffect(() => {
    fromRef.current = display;
  }, [display]);

  const formatted = decimals > 0 ? display.toFixed(decimals) : Math.round(display).toString();

  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
};
