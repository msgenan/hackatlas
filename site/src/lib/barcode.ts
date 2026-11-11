/** A deterministic barcode for a boarding pass: bar widths come from a hash of the event id. Decorative. */
export interface Bar { x: number; w: number }

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let a = seed || 1;
  return () => {
    a ^= a << 13;
    a ^= a >>> 17;
    a ^= a << 5;
    return ((a >>> 0) % 1000) / 1000;
  };
}

/** Bars across a 0..width box with quiet zones; widths 1..3 units, gaps 1..2 units. */
export function barcode(id: string, width = 120): Bar[] {
  const r = rng(hash(id));
  const bars: Bar[] = [];
  let x = 2;
  while (x < width - 2) {
    const w = 1 + Math.floor(r() * 3);
    if (x + w > width - 2) break;
    bars.push({ x, w });
    x += w + 1 + Math.floor(r() * 2);
  }
  return bars;
}

export function barcodePath(id: string, width = 120, height = 28): string {
  return barcode(id, width)
    .map((b) => `M${b.x} 0h${b.w}v${height}h-${b.w}z`)
    .join("");
}
