// B81 - 3D card swarm layout (r10 S10: about 16 flat UI cards + 12 prompt pills at different depths).
//
// PURE and frame-independent: a seeded function of its spec, no Math.random / Date, so the same spec
// returns byte-identical output (JSON) every time and on every machine. It only decides WHERE each card
// sits (centre inside a box / ellipsoid volume, local to the volume centre), how it is turned (camera
// facing + a small random tilt), how big it is and which look it gets. The layers themselves are built by
// animation-templates/cardSwarm.ts; the agent action is agent.addCardSwarm (src/agent/runtime.ts).
//
// Placement: rejection sampling with a bounded attempt count per card (best-candidate fallback). A card is
// accepted when its centre is at least `minSpacing` px (3D, Euclidean) from every placed centre; when no
// candidate passes in `maxAttempts`, the candidate with the largest clearance is used and counted in
// `relaxed` (never an infinite loop, never a card outside the volume).

import { mulberry32 } from './shapeModifiers';

export type SwarmVec3 = [number, number, number];

export type SwarmVolumeShape = 'box' | 'ellipsoid';

export interface SwarmVolume {
  /** Volume centre in comp px (z: + = away from the camera, the 2.5D convention). */
  center: SwarmVec3;
  /** Full extent [width, height, depth] in px (an ellipsoid's diameters). */
  size: SwarmVec3;
  shape: SwarmVolumeShape;
}

export interface SwarmItemKind {
  /** Free label carried to the output ("card", "pill"...). */
  kind: string;
  count: number;
  /** Card width range in px [min, max]. */
  width: [number, number];
  /** Height = width x aspect, aspect drawn from [min, max]. Ignored when `height` is set. */
  aspect?: [number, number];
  /** Fixed height in px (pills). */
  height?: number;
  /** Depth band as a fraction of the volume depth: 0 = the near face, 1 = the far face. Default [0, 1]. */
  depthRange?: [number, number];
  /** Share of "light" variants (0..1), the rest are "dark". Default 0.5. */
  lightShare?: number;
}

export interface CardSwarmSpec {
  seed: number;
  volume: SwarmVolume;
  kinds: SwarmItemKind[];
  /** Minimum centre-to-centre distance (px). Default {@link defaultMinSpacing}. */
  minSpacing?: number;
  /** Max random out-of-plane tilt in degrees (rotationX / rotationY), rotation Z gets 30 % of it. Default 8. */
  tilt?: number;
  /** Placement candidates per card before the best-candidate fallback. Default 80, clamped 1..1000. */
  maxAttempts?: number;
}

export interface SwarmCard {
  index: number;
  kind: string;
  /** Index within its kind (cycles sources / labels). */
  kindIndex: number;
  /** Centre, local to the volume centre (px). */
  position: SwarmVec3;
  /** [rotationX, rotationY, rotationZ] in degrees. */
  rotation: SwarmVec3;
  width: number;
  height: number;
  variant: 'light' | 'dark';
  /** Per-card random in [0, 1) for decoration choices (accent colour, bar lengths). */
  style: number;
}

export interface CardSwarmLayout {
  cards: SwarmCard[];
  minSpacing: number;
  /** Smallest centre-to-centre distance actually achieved (Infinity for < 2 cards). */
  minDistance: number;
  /** Cards placed by the best-candidate fallback (spacing could not be met in maxAttempts). */
  relaxed: number;
}

export const MAX_SWARM_ITEMS = 200;

/** Volume of the swarm region in px^3. */
export function swarmVolumeSize(v: SwarmVolume): number {
  const [w, h, d] = v.size;
  return v.shape === 'ellipsoid' ? (Math.PI / 6) * w * h * d : w * h * d;
}

/** Default spacing: 55 % of the edge of the cube each card would get if the volume were shared evenly. */
export function defaultMinSpacing(v: SwarmVolume, count: number): number {
  return 0.55 * Math.cbrt(swarmVolumeSize(v) / Math.max(1, count));
}

/** True when a local point (relative to the centre) lies inside the volume (eps for float slack). */
export function insideSwarmVolume(v: SwarmVolume, p: SwarmVec3, eps = 1e-6): boolean {
  const [hw, hh, hd] = [v.size[0] / 2, v.size[1] / 2, v.size[2] / 2];
  if (v.shape === 'ellipsoid') {
    const q = (hw > 0 ? (p[0] / hw) ** 2 : 0) + (hh > 0 ? (p[1] / hh) ** 2 : 0) + (hd > 0 ? (p[2] / hd) ** 2 : 0);
    return q <= 1 + eps;
  }
  return Math.abs(p[0]) <= hw + eps && Math.abs(p[1]) <= hh + eps && Math.abs(p[2]) <= hd + eps;
}

/** Fold any number into a 32-bit seed (floats and negatives allowed). */
function seed32(seed: number): number {
  const s = Number.isFinite(seed) ? seed : 0;
  let h = Math.floor(s) ^ Math.round((s - Math.floor(s)) * 1e9);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

function checkSpec(spec: CardSwarmSpec): void {
  const { volume } = spec;
  if (!volume || !Array.isArray(volume.center) || volume.center.length !== 3 || !volume.center.every(Number.isFinite)) throw new Error('volume.center must be [x, y, z]');
  if (!Array.isArray(volume.size) || volume.size.length !== 3 || !volume.size.every((n) => Number.isFinite(n) && n >= 0)) throw new Error('volume.size must be [width, height, depth] (px, >= 0)');
  if (volume.shape !== 'box' && volume.shape !== 'ellipsoid') throw new Error('volume.shape must be "box" or "ellipsoid"');
  let total = 0;
  for (const k of spec.kinds) {
    if (!Number.isInteger(k.count) || k.count < 0) throw new Error(`${k.kind}: count must be an integer >= 0`);
    if (!(k.width[0] > 0 && k.width[1] >= k.width[0])) throw new Error(`${k.kind}: width must be [min, max] with 0 < min <= max`);
    if (k.height === undefined && !(k.aspect && k.aspect[0] > 0 && k.aspect[1] >= k.aspect[0])) throw new Error(`${k.kind}: aspect must be [min, max] with 0 < min <= max (or set height)`);
    if (k.height !== undefined && !(k.height > 0)) throw new Error(`${k.kind}: height must be > 0`);
    if (k.depthRange && !(k.depthRange[0] >= 0 && k.depthRange[1] <= 1 && k.depthRange[1] >= k.depthRange[0])) throw new Error(`${k.kind}: depthRange must be [a, b] with 0 <= a <= b <= 1`);
    total += k.count;
  }
  if (total > MAX_SWARM_ITEMS) throw new Error(`a swarm holds at most ${MAX_SWARM_ITEMS} cards (asked ${total})`);
}

/** One uniform candidate inside the volume, restricted to a depth band. Always returns an inside point. */
function sampleInVolume(v: SwarmVolume, band: [number, number], rnd: () => number): SwarmVec3 {
  const [hw, hh, hd] = [v.size[0] / 2, v.size[1] / 2, v.size[2] / 2];
  const zLo = -hd + band[0] * 2 * hd, zHi = -hd + band[1] * 2 * hd;
  if (v.shape === 'box') return [lerp(-hw, hw, rnd()), lerp(-hh, hh, rnd()), lerp(zLo, zHi, rnd())];
  // Ellipsoid: bounded rejection in the band's slab; the fallback pulls a sample inside.
  let last: SwarmVec3 = [0, 0, (zLo + zHi) / 2];
  for (let i = 0; i < 32; i++) {
    const p: SwarmVec3 = [lerp(-hw, hw, rnd()), lerp(-hh, hh, rnd()), lerp(zLo, zHi, rnd())];
    if (insideSwarmVolume(v, p, 0)) return p;
    last = p;
  }
  const q = Math.sqrt((hw > 0 ? (last[0] / hw) ** 2 : 0) + (hh > 0 ? (last[1] / hh) ** 2 : 0) + (hd > 0 ? (last[2] / hd) ** 2 : 0));
  const s = q > 0 ? 0.999 / q : 0;
  return [last[0] * s, last[1] * s, last[2] * s];
}

/**
 * Lay out a card swarm. Items are generated kind by kind (all of kinds[0], then kinds[1]...); each kind
 * keeps its own index so sources / labels can cycle per kind. Deterministic in `spec`.
 */
export function layoutCardSwarm(spec: CardSwarmSpec): CardSwarmLayout {
  checkSpec(spec);
  const { volume } = spec;
  const total = spec.kinds.reduce((s, k) => s + k.count, 0);
  const minSpacing = Math.max(0, spec.minSpacing ?? defaultMinSpacing(volume, total));
  const tilt = Math.max(0, Math.min(89, spec.tilt ?? 8));
  const attempts = Math.max(1, Math.min(1000, Math.round(spec.maxAttempts ?? 80)));
  const base = seed32(spec.seed);
  // Separate streams: placement retries never shift the look / size of later cards.
  const placeRnd = mulberry32(base ^ 0x9e3779b9);
  const styleRnd = mulberry32((base + 0x85ebca6b) >>> 0);

  const cards: SwarmCard[] = [];
  const placed: SwarmVec3[] = [];
  let relaxed = 0;
  let index = 0;
  for (const k of spec.kinds) {
    const band: [number, number] = k.depthRange ?? [0, 1];
    for (let ki = 0; ki < k.count; ki++) {
      // Style first (fixed number of draws per card).
      const width = lerp(k.width[0], k.width[1], styleRnd());
      const aspectT = styleRnd();
      const height = k.height ?? width * lerp(k.aspect![0], k.aspect![1], aspectT);
      const rx = (styleRnd() * 2 - 1) * tilt;
      const ry = (styleRnd() * 2 - 1) * tilt;
      const rz = (styleRnd() * 2 - 1) * tilt * 0.3;
      const variant: SwarmCard['variant'] = styleRnd() < (k.lightShare ?? 0.5) ? 'light' : 'dark';
      const style = styleRnd();

      let best: SwarmVec3 | null = null;
      let bestClear = -1;
      let accepted = false;
      for (let a = 0; a < attempts; a++) {
        const p = sampleInVolume(volume, band, placeRnd);
        let clear = Infinity;
        for (const q of placed) clear = Math.min(clear, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
        if (clear > bestClear) { bestClear = clear; best = p; }
        if (clear >= minSpacing) { accepted = true; break; }
      }
      if (!accepted) relaxed++;
      const pos: SwarmVec3 = [round3(best![0]), round3(best![1]), round3(best![2])];
      // Rounding must not push a boundary sample outside: clamp back in (box) / scale in (ellipsoid).
      if (!insideSwarmVolume(volume, pos, 0)) {
        if (volume.shape === 'box') for (let c = 0; c < 3; c++) pos[c] = Math.max(-volume.size[c] / 2, Math.min(volume.size[c] / 2, pos[c]));
        else for (let c = 0; c < 3; c++) pos[c] = round3(pos[c] * 0.999);
      }
      placed.push(pos);
      cards.push({ index, kind: k.kind, kindIndex: ki, position: pos, rotation: [round3(rx), round3(ry), round3(rz)], width: round3(width), height: round3(height), variant, style: round3(style) });
      index++;
    }
  }
  let minDistance = Infinity;
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    const a = placed[i], b = placed[j];
    minDistance = Math.min(minDistance, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  }
  return { cards, minSpacing, minDistance, relaxed };
}

/** World (comp) position of a local swarm point after the cluster yaw (about Y) then pitch (about X), the
 *  same order as the cluster's composeModel (Rz . Ry . Rx applied right to left: X first, then Y). */
export function swarmWorldPoint(center: SwarmVec3, local: SwarmVec3, yawDeg: number, pitchDeg = 0): SwarmVec3 {
  const ax = (pitchDeg * Math.PI) / 180, ay = (yawDeg * Math.PI) / 180;
  // Rx first.
  const y1 = local[1] * Math.cos(ax) - local[2] * Math.sin(ax);
  const z1 = local[1] * Math.sin(ax) + local[2] * Math.cos(ax);
  // Then Ry.
  const x2 = local[0] * Math.cos(ay) + z1 * Math.sin(ay);
  const z2 = -local[0] * Math.sin(ay) + z1 * Math.cos(ay);
  return [center[0] + x2, center[1] + y1, center[2] + z2];
}
