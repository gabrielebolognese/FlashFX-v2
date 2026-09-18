// Particle dissolve (B19) - pure spawn-point sampling (leaf module, no imports). Produces the
// `sourcePoints` for a 'points' emitter so a region/logo "dissolves" into particles. Seeded with the
// house mulberry32 so the sample set is deterministic (frame-pure - the same seed always yields the
// same points). The alpha-accurate sampling of a real source layer is browser canvas work that calls
// sampleMaskPoints with the layer's pixels; sampleRegionPoints needs no pixels and renders now.
// Unit-tested (verify:particles).

export type Pt = [number, number];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `count` deterministic points uniformly inside the rectangle [-w/2, w/2] x [-h/2, h/2] (emitter-local
 * coords, centred like the other emitter shapes). For a rectangular dissolve region.
 */
export function sampleRegionPoints(width: number, height: number, count: number, seed: number): Pt[] {
  const n = Math.max(0, Math.floor(count));
  const rng = mulberry32(seed >>> 0);
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    out.push([(rng() - 0.5) * width, (rng() - 0.5) * height]);
  }
  return out;
}

/**
 * `count` deterministic points sampled from the opaque area of a single-channel alpha mask (row-major,
 * length w*h, 0..255), returned in emitter-local coords centred on the mask. Rejection-samples opaque
 * pixels; falls back to the region sampler when the mask is empty. This is the logo/text dissolve.
 */
export function sampleMaskPoints(alpha: Uint8ClampedArray | number[], w: number, h: number, count: number, seed: number, threshold = 8): Pt[] {
  const n = Math.max(0, Math.floor(count));
  const rng = mulberry32(seed >>> 0);
  // collect opaque pixel indices (cap the scan cost by striding on huge masks)
  const opaque: number[] = [];
  for (let i = 0; i < w * h; i++) if (alpha[i] >= threshold) opaque.push(i);
  if (opaque.length === 0) return sampleRegionPoints(w, h, n, seed);
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const idx = opaque[Math.floor(rng() * opaque.length) % opaque.length];
    const x = idx % w, y = (idx / w) | 0;
    out.push([x - w / 2, y - h / 2]);
  }
  return out;
}
