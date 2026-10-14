// Refine Edge WGSL (B10e), interpolated into the image / video shader. Its CPU twin is
// core/refineEdge.ts `refineEdgeAt` (same constants, imported here) - change both together. The host
// shader must define `fn refine_sample(p: vec2f) -> vec3f` (the layer's source colour at a composition
// point) and pass the mask field from `computeMaskStack(world, count, masks, radius)`.

import {
  REFINE_CONF_LO, REFINE_CONF_HI, REFINE_BAND_FADE, REFINE_CONTRAST_GAIN,
  REFINE_SOLVE_LO, REFINE_SOLVE_HI, REFINE_SOLVE_MIN_ALPHA,
} from '../core/refineEdge';

const f32Lit = (v: number) => (Number.isInteger(v) ? `${v}.0` : `${v}`);

export const REFINE_WGSL = /* wgsl */ `
// field = (mask alpha, signed distance (inside < 0), unit outward normal). Returns (alpha, colour delta).
fn refineEdgeAt(world: vec2f, field: vec4f, radius: f32, contrast: f32, decon: f32) -> vec4f {
  let sd = field.y;
  let n = field.zw;
  if (!(radius > 0.0) || abs(sd) >= radius || dot(n, n) < 0.25) { return vec4f(field.x, 0.0, 0.0, 0.0); }
  let e = world - n * sd;
  let t = vec2f(-n.y, n.x) * (radius * 0.5);
  let fp = e - n * radius;
  let bp = e + n * radius;
  let F = (refine_sample(fp - t) + refine_sample(fp) + refine_sample(fp + t)) / 3.0;
  let B = (refine_sample(bp - t) + refine_sample(bp) + refine_sample(bp + t)) / 3.0;
  let C = refine_sample(world);
  let fb = F - B;
  let len2 = dot(fb, fb);
  let aRaw = clamp(dot(C - B, fb) / max(len2, 1e-6), 0.0, 1.0);
  let aC = clamp((aRaw - 0.5) * (1.0 + ${f32Lit(REFINE_CONTRAST_GAIN)} * contrast) + 0.5, 0.0, 1.0);
  let conf = smoothstep(${f32Lit(REFINE_CONF_LO)}, ${f32Lit(REFINE_CONF_HI)}, length(fb));
  let w = (1.0 - smoothstep(radius * ${f32Lit(REFINE_BAND_FADE)}, radius, abs(sd))) * conf;
  let alpha = mix(field.x, aC, w);
  let k = smoothstep(${f32Lit(REFINE_SOLVE_LO)}, ${f32Lit(REFINE_SOLVE_HI)}, aRaw);
  let solved = clamp((C - (1.0 - aRaw) * B) / max(aRaw, ${f32Lit(REFINE_SOLVE_MIN_ALPHA)}), vec3f(0.0), vec3f(1.0));
  let fEst = mix(F, solved, k);
  return vec4f(alpha, (fEst - C) * (decon * w));
}
`;
