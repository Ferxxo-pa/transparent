import React, { useEffect, useRef, useState } from 'react';

interface BlobDef {
  c: string;
  x: string;
  y: string;
  s: number;
  a: number;
  anim: string;
}

export const BLOB_PALETTES: Record<string, BlobDef[]> = {
  home: [
    { c: '#C4FF3C', x: '-15%', y: '-10%', s: 380, a: 0.85, anim: 'blob-1' },
    { c: '#FF3B8B', x: '70%', y: '85%', s: 320, a: 0.7, anim: 'blob-2' },
    { c: '#A968FF', x: '85%', y: '5%', s: 240, a: 0.55, anim: 'blob-3' },
  ],
  create: [
    { c: '#FF3B8B', x: '-10%', y: '40%', s: 360, a: 0.75, anim: 'blob-1' },
    { c: '#C4FF3C', x: '80%', y: '-5%', s: 320, a: 0.7, anim: 'blob-2' },
    { c: '#A968FF', x: '60%', y: '90%', s: 280, a: 0.55, anim: 'blob-3' },
  ],
  join: [
    { c: '#4DA8FF', x: '-10%', y: '10%', s: 420, a: 0.75, anim: 'blob-1' },
    { c: '#C4FF3C', x: '75%', y: '65%', s: 360, a: 0.7, anim: 'blob-2' },
    { c: '#A968FF', x: '30%', y: '90%', s: 300, a: 0.5, anim: 'blob-3' },
  ],
  lobby: [
    { c: '#A968FF', x: '50%', y: '0%', s: 380, a: 0.75, anim: 'blob-1' },
    { c: '#C4FF3C', x: '-15%', y: '60%', s: 320, a: 0.65, anim: 'blob-2' },
    { c: '#FF3B8B', x: '85%', y: '85%', s: 280, a: 0.6, anim: 'blob-3' },
  ],
  vote: [
    { c: '#4DA8FF', x: '0%', y: '20%', s: 360, a: 0.65, anim: 'blob-1' },
    { c: '#FF8A2A', x: '85%', y: '70%', s: 360, a: 0.65, anim: 'blob-2' },
  ],
  truth: [{ c: '#4DA8FF', x: '50%', y: '50%', s: 480, a: 0.85, anim: 'blob-1' }],
  bluff: [{ c: '#FF8A2A', x: '50%', y: '50%', s: 480, a: 0.85, anim: 'blob-1' }],
  story: [
    { c: '#FF3B8B', x: '50%', y: '20%', s: 380, a: 0.8, anim: 'blob-1' },
    { c: '#FF8A2A', x: '20%', y: '80%', s: 320, a: 0.65, anim: 'blob-2' },
  ],
  win: [
    { c: '#C4FF3C', x: '50%', y: '30%', s: 460, a: 0.85, anim: 'blob-1' },
    { c: '#A968FF', x: '15%', y: '85%', s: 280, a: 0.6, anim: 'blob-2' },
    { c: '#FF3B8B', x: '85%', y: '85%', s: 240, a: 0.55, anim: 'blob-3' },
  ],
};

export type BlobPalette = keyof typeof BLOB_PALETTES;

interface BlobsProps {
  palette?: BlobPalette;
}

export const Blobs: React.FC<BlobsProps> = ({ palette = 'home' }) => {
  const [current, setCurrent] = useState(palette);
  const [prev, setPrev] = useState<BlobPalette | null>(null);
  const [fading, setFading] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (palette !== current) {
      setPrev(current);
      setCurrent(palette);
      setFading(true);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setPrev(null);
        setFading(false);
      }, 1800);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette]);

  const renderBlobs = (blobs: BlobDef[], opacity: number) =>
    blobs.map((b, i) => (
      <div
        key={`${b.c}-${i}`}
        className={`blob ${b.anim}`}
        style={{
          position: 'absolute',
          left: b.x,
          top: b.y,
          width: b.s,
          height: b.s,
          borderRadius: '50%',
          background: b.c,
          opacity: b.a * opacity,
          filter: 'blur(60px)',
          willChange: 'transform, opacity',
          transition: 'opacity 1800ms cubic-bezier(0.4, 0, 0.2, 1)',
          pointerEvents: 'none' as const,
        }}
      />
    ));

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    >
      {/* Previous palette fading out */}
      {prev && fading && renderBlobs(BLOB_PALETTES[prev], 0)}

      {/* Current palette fading in */}
      {renderBlobs(BLOB_PALETTES[current], fading ? 0.85 : 1)}

      {/* Vignette — darkens edges, keeps blobs contained */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(circle at 50% 50%, transparent 60%, rgba(0,0,0,0.4))',
        pointerEvents: 'none',
      }} />
    </div>
  );
};
