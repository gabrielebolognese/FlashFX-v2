// Pure CPU gradient sampler (B8e) — a faithful port of the shape fill/stroke gradient shader
// (renderer.ts gradientT / sampleGradientLayer / sampleFill / blendRGB) to plain TS. Used to CPU-bake
// a gradient STROKE per stroke-vertex on pen-path (polygon) shapes, which the SDF pipeline renders in
// the fragment shader but the tessellated path pipeline cannot. Same maths → the baked gradient
// matches an SDF shape's gradient at each sample (Gouraud-interpolated across the dense stroke quads).
// Leaf module: imports only types, so it bundles in a node harness (`verify:fill-sampler`).

import type { Vec2, Vec4, ResolvedFill, ResolvedFillLayer } from './types';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// W3C separable blend, per channel — exact port of blendChannel() in renderer.ts.
function blendChannel(mode: number, cb: number, cs: number): number {
  switch (mode) {
    case 1: return cb * cs;                                   // multiply
    case 2: return cb + cs - cb * cs;                         // screen
    case 3: return cb <= 0.5 ? 2 * cb * cs : 1 - 2 * (1 - cb) * (1 - cs); // overlay
    case 4: return Math.min(cb, cs);                          // darken
    case 5: return Math.max(cb, cs);                          // lighten
    case 6: return cs >= 1 ? 1 : Math.min(1, cb / (1 - cs));  // color-dodge
    case 7: return cs <= 0 ? 0 : 1 - Math.min(1, (1 - cb) / cs); // color-burn
    case 8: return cs <= 0.5 ? 2 * cs * cb : 1 - 2 * (1 - cs) * (1 - cb); // hard-light
    case 9: {                                                 // soft-light
      if (cs <= 0.5) return cb - (1 - 2 * cs) * cb * (1 - cb);
      const d = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb);
      return cb + (2 * cs - 1) * (d - cb);
    }
    case 10: return Math.abs(cb - cs);                        // difference
    case 11: return cb + cs - 2 * cb * cs;                    // exclusion
    default: return cs;                                       // normal (0)
  }
}

function blendRGB(mode: number, cb: Vec4, cs: Vec4): [number, number, number] {
  if (mode === 0) return [cs[0], cs[1], cs[2]];
  return [blendChannel(mode, cb[0], cs[0]), blendChannel(mode, cb[1], cs[1]), blendChannel(mode, cb[2], cs[2])];
}

// Gradient parameter in 0..1 — exact port of gradientT(). Linear uses the CSS gradient-line formula
// (0deg toward top); radial uses a circle with farthest-corner extent. boxSize is the shape box in px.
function gradientT(gType: number, angle: number, cx: number, cy: number, uv: Vec2, boxSize: Vec2): number {
  const localX = (uv[0] - 0.5) * boxSize[0];
  const localY = (uv[1] - 0.5) * boxSize[1];
  if (gType === 1) {
    const cpx = (cx - 0.5) * boxSize[0];
    const cpy = (cy - 0.5) * boxSize[1];
    const dvx = localX - cpx;
    const dvy = localY - cpy;
    const cxk = Math.max(Math.abs(boxSize[0] * 0.5 - cpx), Math.abs(-boxSize[0] * 0.5 - cpx));
    const cyk = Math.max(Math.abs(boxSize[1] * 0.5 - cpy), Math.abs(-boxSize[1] * 0.5 - cpy));
    const maxDist = Math.max(Math.hypot(cxk, cyk), 1e-4);
    return clamp01(Math.hypot(dvx, dvy) / maxDist);
  }
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  const denom = Math.max(Math.abs(boxSize[0] * dx) + Math.abs(boxSize[1] * dy), 1e-4);
  return clamp01(0.5 + (localX * dx + localY * dy) / denom);
}

function mix4(a: Vec4, b: Vec4, k: number): Vec4 {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
}

function sampleLayer(layer: ResolvedFillLayer, uv: Vec2, boxSize: Vec2): Vec4 {
  const stops = layer.stops;
  if (stops.length === 0) return [0, 0, 0, 0];
  if (stops.length === 1) return stops[0].color;
  const t = gradientT(layer.gradientType, layer.angle, layer.centerX, layer.centerY, uv, boxSize);
  if (t <= stops[0].position) return stops[0].color;
  for (let s = 0; s < stops.length - 1; s++) {
    const pa = stops[s].position;
    const pb = stops[s + 1].position;
    if (t <= pb) {
      const k = clamp01((t - pa) / Math.max(pb - pa, 1e-5));
      return mix4(stops[s].color, stops[s + 1].color, k);
    }
  }
  return stops[stops.length - 1].color;
}

/**
 * Sample a resolved fill/stroke at box-uv (0..1 across the shape's bounding box) → straight-alpha
 * RGBA. Solid → the flat color. Gradient → the multi-layer stack composited bottom-up with W3C blend
 * + source-over, exactly like the shape fragment shader (index 0 topmost).
 */
export function sampleResolvedFill(fill: ResolvedFill, uv: Vec2, boxSize: Vec2): Vec4 {
  if (fill.kind === 0 || fill.layers.length === 0) return fill.color;
  let accR = 0, accG = 0, accB = 0, accA = 0;
  for (let idx = fill.layers.length - 1; idx >= 0; idx--) {
    const src = sampleLayer(fill.layers[idx], uv, boxSize);
    const mode = fill.layers[idx].blendMode;
    const blended = blendRGB(mode, [accR, accG, accB, accA], src);
    // mix(src.rgb, blended, accA) — the shader blends toward the W3C result by the accumulated alpha.
    const mR = src[0] + (blended[0] - src[0]) * accA;
    const mG = src[1] + (blended[1] - src[1]) * accA;
    const mB = src[2] + (blended[2] - src[2]) * accA;
    const sa = src[3];
    const outA = sa + accA * (1 - sa);
    if (outA > 0) {
      accR = (mR * sa + accR * accA * (1 - sa)) / outA;
      accG = (mG * sa + accG * accA * (1 - sa)) / outA;
      accB = (mB * sa + accB * accA * (1 - sa)) / outA;
    } else {
      accR = 0; accG = 0; accB = 0;
    }
    accA = outA;
  }
  return [accR, accG, accB, accA];
}
