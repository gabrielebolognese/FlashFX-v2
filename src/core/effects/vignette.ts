// Vignette (B13-gpu) - the pure per-pixel darkening factor for a radial vignette. The live effect is a
// WGSL case in the image shader (applyColorEffect), which MIRRORS this exact formula; keeping the math
// here makes the falloff curve node-testable (scripts/verify-vignette.mjs) even though the shader itself
// can only be verified in a WebGPU browser. Pure + dependency-free.
//
// Model: distance from centre in "edge units" (0 at centre, 1 at an edge midpoint, ~1.414 at a corner),
// then a smoothstep from (radius - softness) to radius gives the darkened fraction. The returned FACTOR
// is 1 at full brightness (inside the clear centre) and falls toward 0 at the edges; the caller blends it
// by `amount`: rgb *= mix(1, factor, amount).

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** GLSL/WGSL-style smoothstep (Hermite), matching the shader's `smoothstep`. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const denom = edge1 - edge0;
  if (Math.abs(denom) < 1e-6) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / denom);
  return t * t * (3 - 2 * t);
}

/** Distance of a uv (each 0..1) from the frame centre, in edge units (0 centre, 1 edge-mid, ~1.414 corner). */
export function vignetteDistance(u: number, v: number): number {
  const dx = (u - 0.5) * 2;
  const dy = (v - 0.5) * 2;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Brightness factor at uv for a vignette of `radius` (where darkening reaches full) and `softness` (the
 * falloff width before it). 1 = untouched (centre), 0 = fully darkened (edge). Monotonic non-increasing
 * with distance. `radius`/`softness` are clamped to sane ranges so the curve can't invert.
 */
export function vignetteFactor(u: number, v: number, radius: number, softness: number): number {
  // radius spans [0, 1.5] because the corner distance is ~1.414 - a radius past 1 keeps the edge
  // midpoints bright and darkens only the corners (the classic corner-weighted vignette).
  const r = Math.max(0, Math.min(radius, 1.5));
  const s = Math.max(0, Math.min(softness, 1));
  const dist = vignetteDistance(u, v);
  // factor 1 inside (radius - softness), easing to 0 by `radius`.
  return 1 - smoothstep(r - s, r, dist);
}

/**
 * Apply the vignette to a single channel value: `c * mix(1, factor, amount)`. `amount` (0..1) is the
 * strength - 0 leaves the pixel untouched (so an added-but-zeroed effect is a no-op). The shader does the
 * identical `rgb *= mix(1, factor, amount)`.
 */
export function applyVignetteChannel(c: number, factor: number, amount: number): number {
  const a = clamp01(amount);
  return c * (1 - a * (1 - factor)); // == c * mix(1, factor, a)
}
