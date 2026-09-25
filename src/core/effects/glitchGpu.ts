// Pure mirror of the B14-gpu spatial glitch shader math (pixel-sort + datamosh). The live effects are
// WGSL cases in applySpatialEffect that MIRROR these functions; keeping the math here makes the
// frame-purity + bounds node-testable (scripts/verify-glitch-gpu.mjs) even though the shader render is
// browser-only. Leaf module, no imports. The WGSL reuses the shader's existing `hash21`; this is its exact
// twin so a "frame-pure, deterministic given (cell, seed)" claim is provable.

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const fract = (x: number) => x - Math.floor(x);

/** Rec.709 luma, matching the shader's `dot(c, vec3f(0.2126, 0.7152, 0.0722))`. */
export function luma709(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

/**
 * Exact twin of the shader's hash21 (renderer.ts): a 2D -> [0,1) pseudo-random hash. Deterministic, so a
 * value seeded by (block, timeBucket) is frame-pure. (JS is f64 vs WGSL f32, so values aren't bit-equal
 * across the two, but the algorithm + its properties are identical - which is what determinism needs.)
 */
export function hash21(px: number, py: number): number {
  let p3x = fract(px * 0.1031);
  let p3y = fract(py * 0.1031);
  let p3z = fract(px * 0.1031); // vec3(p.xyx) -> (px, py, px)
  // p3 += dot(p3, p3.yzx + 33.33)
  const d = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33);
  p3x += d; p3y += d; p3z += d;
  return fract((p3x + p3y) * p3z);
}

export interface MoshOffset { dx: number; dy: number; gate: number }

/**
 * Datamosh per-block displacement: a block (cell) at discrete time `seed` gets a pseudo-random direction
 * + magnitude scaled by `amount`, and a `gate` (0/1) so only a fraction of blocks "corrupt" (the block-drop
 * look) - more blocks as amount rises. Mirrors the WGSL datamosh case exactly. Bounded: |offset| <=
 * 0.15 (uv units). `gate` uses WGSL step semantics (1 when hash >= 1-amount).
 */
export function moshOffset(cellX: number, cellY: number, seed: number, amount: number): MoshOffset {
  const amt = clamp01(amount);
  const h1 = hash21(cellX + seed, cellY + seed);
  const h2 = hash21(cellX + seed + 19, cellY + seed + 19);
  const hg = hash21(cellX + seed + 3, cellY + seed + 3);
  const ang = h1 * 6.28318;
  const mag = amt * 0.15 * h2;
  return {
    dx: Math.cos(ang) * mag,
    dy: Math.sin(ang) * mag,
    gate: hg >= 1 - amt ? 1 : 0, // step(1-amt, hg)
  };
}

/**
 * Pixel-sort selection: within a fixed-length window of neighbour lumas along the row, carry forward the
 * BRIGHTEST pixel that is above `gate` and brighter than the current pixel (the bright-streak look). Returns
 * the selected luma (== currentLuma when nothing qualifies). Mirrors the WGSL loop's accumulate rule; the
 * shader blends the selected COLOUR by `amount`, this pins the selection math. Bounded by the window length.
 */
export function pixelSortLuma(currentLuma: number, windowLumas: number[], gate: number): number {
  let best = currentLuma;
  for (const sl of windowLumas) {
    if (sl > gate && sl > best) best = sl;
  }
  return best;
}
