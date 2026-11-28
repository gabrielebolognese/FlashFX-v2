// B61: liquid drip / melt. Letters (or any layer content) melt into liquid streams that run down from
// every bottom edge, wobble, and, on reaching a floor line, turn and flow along it. A texture-aware
// ("spatial") effect in the image shader's effect stack, so it works on text / shape layers through
// the B57 precomp wrap (agent.applyLayerEffects / agent.liquidDrip) and on images directly.
//
// Drips only fall from the lowest ink of each column (a pixel with content below it gets none), so
// counters and the gaps between ascenders stay open and the word stays readable while it melts.
// How it reads: every output pixel walks UPSTREAM along a flow field (straight down with a sideways
// wobble; near the floor the flow bends sideways) in fixed steps. The first opaque source pixel it meets
// is the stream's origin: if the walked distance is within that column's drip length the pixel takes the
// origin's colour (fading over the last 20 % of the length, the drip head), drawn UNDER the original
// (the wobble phase is smooth noise across x, so neighbouring streamlines stay parallel and bounded)
// content. Drip length varies smoothly per column (seeded value noise), so a word melts into separate
// drips of different lengths rather than a curtain. Frame-pure: no time input, the animation is the
// keyframed length (param 0).
//
// Params (one effect slot, 7 floats):
//   0 length    drip length in texture px (0 = off; key it 0 -> N to melt)
//   1 floor     floor line as a texture-V fraction 0..1 (<= 0 = no floor: drips just fall)
//   2 spacing   px between independent drips (noise cell size), default 14
//   3 sway      sideways wobble amplitude in px, default 6
//   4 seed      integer seed for lengths and wobble phases, default 1
//   5 flow      floor flow: > 0 to the right, < 0 to the left (magnitude 0..1 = how hard it turns),
//               0 = outward from the texture centre at full strength
//   6 variance  0..1 how much drip lengths differ between columns, default 0.9 (near 1: separate drips with gaps)
//
// This module is the single source of truth: `liquidDripAt` is the CPU twin and `LIQUID_DRIP_WGSL` the
// shader function, generated from the same constants (verify:liquid-drip checks the maths, gpu:liquid-text
// checks the WGSL against the twin on a real WebGPU render).

/** Walk step in px (smallest). Long drips scale the step so the walk stays within MAX_STEPS. */
export const DRIP_STEP_PX = 4;
/** Upper bound of the upstream walk (WGSL loop bound). */
export const DRIP_MAX_STEPS = 192;
/** A sample with alpha above this is the stream origin. */
export const DRIP_HIT_ALPHA = 0.35;
/** The drip head fades over the last (1 - DRIP_HEAD) of its length. */
export const DRIP_HEAD = 0.8;
/** On a hit, a second sample this far further upstream (px) replaces an anti-aliased rim sample. */
export const DRIP_RIM_PX = 1.5;
/** How much the flow still falls at the floor (1 - this = vertical speed on the floor). */
export const DRIP_FLOOR_TURN = 0.85;

export interface LiquidDripParams {
  length: number; floor: number; spacing: number; sway: number; seed: number; flow: number; variance: number;
}

export const LIQUID_DRIP_DEFAULTS: readonly number[] = [0, 0, 14, 6, 1, 0, 0.9];

export function dripParams(p: readonly number[]): LiquidDripParams {
  const g = (i: number): number => (typeof p[i] === 'number' && Number.isFinite(p[i]) ? p[i] : LIQUID_DRIP_DEFAULTS[i]);
  return { length: g(0), floor: g(1), spacing: Math.max(2, g(2)), sway: g(3), seed: g(4), flow: g(5), variance: Math.min(1, Math.max(0, g(6))) };
}

/** PCG hash (u32 -> u32), identical to the WGSL `dripPcg`. */
export function dripPcg(v: number): number {
  const s = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
  const w = Math.imul(((s >>> (((s >>> 28) + 4) >>> 0)) ^ s) >>> 0, 277803737) >>> 0;
  return ((w >>> 22) ^ w) >>> 0;
}

/** Seeded hash of an integer cell -> [0, 1). */
export function dripHash(cell: number, seed: number): number {
  const sd = dripPcg(((Math.floor(seed) | 0) + 0x9e3779b9) >>> 0);
  return dripPcg(((cell | 0) >>> 0) ^ sd) / 4294967296;
}

/** Smooth 1-D value noise in [0, 1). */
export function dripNoise(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = dripHash(i, seed), b = dripHash(i + 1, seed);
  return a + (b - a) * u;
}

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Drip length of the column through x (px). */
export function dripLengthAt(x: number, p: LiquidDripParams): number {
  // smoothstep(0.2, 0.9, noise): at high variance the low end of the noise gives ZERO length, so a wide
  // bottom edge breaks into separate drips with gaps instead of one curtain.
  return p.length * (1 - p.variance + p.variance * smoothstep(0.2, 0.9, dripNoise(x / p.spacing, p.seed)));
}

/** Wobble wavenumber (rad / px): one sway period every 12 drip spacings, at least 200 px. */
export function dripWaveK(spacing: number): number {
  return (2 * Math.PI) / Math.max(spacing * 12, 200);
}

export type DripSampler = (x: number, y: number) => [number, number, number, number];

/**
 * CPU twin of the WGSL: the drip contribution at pixel centre (px, py) of a W x H texture, plus the
 * original colour composited over it. `sample(x, y)` returns the texture's RGBA at a px position
 * (bilinear, like the GPU sampler); `premultiplied` = the texture holds premultiplied colour (a precomp).
 * Returns the colour the spatial stage outputs (same space as the input).
 */
export function liquidDripAt(sample: DripSampler, px: number, py: number, W: number, H: number, raw: readonly number[], premultiplied: boolean): [number, number, number, number] {
  const orig = sample(px, py);
  const p = dripParams(raw);
  if (!(p.length >= 0.5)) return orig;
  const walk = dripWalk(sample, px, py, W, H, p, premultiplied);
  if (!walk) return orig;
  // walk.color is straight and opaque; in a premultiplied texture opaque colour is the same numbers.
  return dripOver(orig, walk.color, walk.fade, premultiplied);
}

/** The upstream walk: the origin colour and the head fade, or null when no stream reaches this pixel. */
export function dripWalk(sample: DripSampler, px: number, py: number, W: number, H: number, p: LiquidDripParams, premultipliedIn = true): { color: [number, number, number, number]; travelled: number; origin: [number, number]; fade: number } | null {
  const h = Math.max(DRIP_STEP_PX, p.length / DRIP_MAX_STEPS);
  const steps = Math.min(DRIP_MAX_STEPS, Math.ceil(p.length / h));
  const floorPx = p.floor > 0 ? p.floor * H : 1e9;
  const band = Math.max(0.15 * p.length, 12);
  const k = dripWaveK(p.spacing);
  const mag = p.flow === 0 ? 1 : Math.min(1, Math.abs(p.flow));
  // Drips fall only from the LOWEST ink of a column: a pixel with content below it (a counter, the gap
  // under an ascender, a row of text above another) gets none, so letters stay readable while they melt.
  for (let j = 1; j <= steps; j++) {
    const yy = py + j * h;
    if (yy > H) break;
    if (sample(px, yy)[3] > DRIP_HIT_ALPHA) return null;
  }
  let x = px, y = py, t = 0;
  for (let i = 1; i <= DRIP_MAX_STEPS; i++) {
    if (i > steps) break;
    const turn = smoothstep(floorPx - band, floorPx, y) * mag;
    const side = p.flow > 0 ? 1 : p.flow < 0 ? -1 : (x >= W * 0.5 ? 1 : -1);
    const phase = dripNoise(x / (p.spacing * 3), p.seed + 7) * 6.283185307;
    const vx = p.sway * k * Math.cos(k * y + phase) * (1 - turn) + side * turn;
    const vy = 1 - DRIP_FLOOR_TURN * turn;
    const len = Math.hypot(vx, vy);
    x -= (vx / len) * h;
    y -= (vy / len) * h;
    t += h;
    if (x < 0 || y < 0 || x > W || y > H) continue;
    let s = sample(x, y);
    if (s[3] > DRIP_HIT_ALPHA) {
      // The step can land on the anti-aliased rim of the source: look one rim width deeper and keep the
      // more opaque sample, so streams carry the solid colour (no banding).
      const d = sample(x - (vx / len) * DRIP_RIM_PX, y - (vy / len) * DRIP_RIM_PX);
      if (d[3] > s[3]) s = d;
      const L = dripLengthAt(x, p);
      if (t > L) return null;
      // Liquid is opaque: the stream takes the origin's colour at full alpha (an anti-aliased or hairline
      // origin sample would otherwise give semi-transparent rows, i.e. stripes inside the stream).
      const color: [number, number, number, number] = premultipliedIn
        ? [s[0] / s[3], s[1] / s[3], s[2] / s[3], 1]
        : [s[0], s[1], s[2], 1];
      return { color, travelled: t, origin: [x, y], fade: 1 - smoothstep(L * DRIP_HEAD, L, t) };
    }
  }
  return null;
}

/** Original over the (faded) drip, in the texture's colour space. */
export function dripOver(orig: readonly number[], drip: readonly number[], fade: number, premultiplied: boolean): [number, number, number, number] {
  const da = drip[3] * fade;
  if (premultiplied) {
    const k = 1 - orig[3];
    return [orig[0] + drip[0] * fade * k, orig[1] + drip[1] * fade * k, orig[2] + drip[2] * fade * k, orig[3] + da * k];
  }
  const a = orig[3] + da * (1 - orig[3]);
  const mixc = (o: number, d: number): number => (a > 1e-6 ? (o * orig[3] + d * da * (1 - orig[3])) / a : 0);
  return [mixc(orig[0], drip[0]), mixc(orig[1], drip[1]), mixc(orig[2], drip[2]), a];
}

/**
 * WGSL twin (module-scope functions of the image shader; needs `texData`, `texSampler` and `u.srcPremultiplied`).
 * `liquidDripFx(color, uv, texel, a, b)` with a = (type, p0, p1, p2), b = (p3, p4, p5, p6).
 */
export const LIQUID_DRIP_WGSL = /* wgsl */ `
fn dripPcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn dripHash(cell: f32, seed: f32) -> f32 {
  let sd = dripPcg(bitcast<u32>(i32(floor(seed))) + 0x9e3779b9u);
  return f32(dripPcg(bitcast<u32>(i32(cell)) ^ sd)) / 4294967296.0;
}
fn dripNoise(x: f32, seed: f32) -> f32 {
  let i = floor(x);
  let f = x - i;
  let u = f * f * (3.0 - 2.0 * f);
  return mix(dripHash(i, seed), dripHash(i + 1.0, seed), u);
}
fn liquidDripFx(color: vec4f, uv: vec2f, texel: vec2f, a: vec4f, b: vec4f) -> vec4f {
  let L = a.y;
  if (!(L >= 0.5)) { return color; }
  let spacing = max(a.w, 2.0);
  let sway = b.x;
  let seed = b.y;
  let flow = b.z;
  let variance = clamp(b.w, 0.0, 1.0);
  let W = 1.0 / texel.x;
  let H = 1.0 / texel.y;
  let h = max(${DRIP_STEP_PX.toFixed(1)}, L / ${DRIP_MAX_STEPS.toFixed(1)});
  let steps = min(${DRIP_MAX_STEPS}, i32(ceil(L / h)));
  let floorPx = select(1e9, a.z * H, a.z > 0.0);
  let band = max(0.15 * L, 12.0);
  let k = 6.283185307 / max(spacing * 12.0, 200.0);
  let mag = select(min(1.0, abs(flow)), 1.0, flow == 0.0);
  let p0 = uv * vec2f(W, H);
  for (var j = 1; j <= ${DRIP_MAX_STEPS}; j = j + 1) {
    if (j > steps) { break; }
    let yy = p0.y + f32(j) * h;
    if (yy > H) { break; }
    if (textureSampleLevel(texData, texSampler, vec2f(p0.x, yy) * texel, 0.0).a > ${DRIP_HIT_ALPHA}) { return color; }
  }
  var p = p0;
  var t = 0.0;
  for (var i = 1; i <= ${DRIP_MAX_STEPS}; i = i + 1) {
    if (i > steps) { break; }
    let turn = smoothstep(floorPx - band, floorPx, p.y) * mag;
    var side = select(-1.0, 1.0, p.x >= W * 0.5);
    if (flow > 0.0) { side = 1.0; } else if (flow < 0.0) { side = -1.0; }
    let phase = dripNoise(p.x / (spacing * 3.0), seed + 7.0) * 6.283185307;
    let vx = sway * k * cos(k * p.y + phase) * (1.0 - turn) + side * turn;
    let vy = 1.0 - ${DRIP_FLOOR_TURN} * turn;
    let len = sqrt(vx * vx + vy * vy);
    p = p - vec2f(vx, vy) / len * h;
    t = t + h;
    if (p.x < 0.0 || p.y < 0.0 || p.x > W || p.y > H) { continue; }
    var s = textureSampleLevel(texData, texSampler, p * texel, 0.0);
    if (s.a > ${DRIP_HIT_ALPHA}) {
      let deep = textureSampleLevel(texData, texSampler, (p - vec2f(vx, vy) / len * ${DRIP_RIM_PX}) * texel, 0.0);
      if (deep.a > s.a) { s = deep; }
      let Lx = L * (1.0 - variance + variance * smoothstep(0.2, 0.9, dripNoise(p.x / spacing, seed)));
      if (t > Lx) { return color; }
      let fade = 1.0 - smoothstep(Lx * ${DRIP_HEAD}, Lx, t);
      // Opaque stream in the origin's straight colour (see the CPU twin).
      let sc = select(s.rgb, s.rgb / s.a, u.srcPremultiplied > 0.5);
      if (u.srcPremultiplied > 0.5) {
        let kk = 1.0 - color.a;
        return vec4f(color.rgb + sc * fade * kk, color.a + fade * kk);
      }
      let oa = color.a + fade * (1.0 - color.a);
      if (oa <= 1e-6) { return vec4f(0.0); }
      return vec4f((color.rgb * color.a + sc * fade * (1.0 - color.a)) / oa, oa);
    }
  }
  return color;
}
`;
