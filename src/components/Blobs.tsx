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
    { c: '#4DA8FF', x: '-10%', y: '20%', s: 380, a: 0.7, anim: 'blob-1' },
    { c: '#C4FF3C', x: '75%', y: '70%', s: 340, a: 0.7, anim: 'blob-2' },
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

interface Layer {
  id: number;
  palette: BlobPalette;
  opacity: number;
}

let layerCounter = 0;

export const Blobs: React.FC<BlobsProps> = ({ palette = 'home' }) => {
  const [layers, setLayers] = useState<Layer[]>([
    { id: layerCounter++, palette, opacity: 1 },
  ]);
  const prevPalette = useRef(palette);
  const cleanupRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (palette === prevPalette.current) return;
    prevPalette.current = palette;

    // Add new layer on top, fade out old layers
    setLayers(prev => [
      ...prev.map(l => ({ ...l, opacity: 0 })),
      { id: layerCounter++, palette, opacity: 1 },
    ]);

    // Remove old layers after transition completes
    if (cleanupRef.current) clearTimeout(cleanupRef.current);
    cleanupRef.current = setTimeout(() => {
      setLayers(prev => prev.filter(l => l.opacity > 0));
    }, 2500);

    return () => {
      if (cleanupRef.current) clearTimeout(cleanupRef.current);
    };
  }, [palette]);

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
      {layers.map(layer => (
        <div
          key={layer.id}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: layer.opacity,
            transition: 'opacity 2200ms cubic-bezier(0.4, 0, 0.2, 1)',
            pointerEvents: 'none',
          }}
        >
          {(BLOB_PALETTES[layer.palette] || []).map((b, i) => (
            <div
              key={i}
              className={`blob ${b.anim}`}
              style={{
                position: 'absolute',
                left: b.x,
                top: b.y,
                width: b.s,
                height: b.s,
                borderRadius: '50%',
                background: b.c,
                opacity: b.a,
                filter: 'blur(60px)',
                willChange: 'transform',
                pointerEvents: 'none' as const,
              }}
            />
          ))}
        </div>
      ))}

      {/* Vignette */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(circle at 50% 50%, transparent 60%, rgba(0,0,0,0.4))',
        pointerEvents: 'none',
      }} />
    </div>
  );
};
