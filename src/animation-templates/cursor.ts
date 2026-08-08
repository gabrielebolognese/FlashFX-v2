import { createPolygonLayer, createGroupLayer } from '../core/factory';
import type { GroupLayer, Layer, PathVertex, ShapeLayer, Vec2, Vec4 } from '../core/types';
import { setKeys, LINEAR, EASE_OUT, type KeyStep } from './kit';

// Cursor engine — the crux of the recursive-editor demo. A fake cursor fails in five specific ways;
// this bakes fixes for all five into position/scale keyframes so the motion reads as a real hand:
//   1. Path shape   — quadratic bezier, control point offset perpendicular ~8–12% of distance,
//                     arc direction alternates each move.
//   2. Velocity     — ballistic (fast start, long decel): ~70% of distance in the first ~38% of time.
//   3. Overshoot    — longer moves pass the target 4–8px then correct back over ~120ms (≈60% of moves).
//   4. Dwell        — sits 100–180ms after arriving before the click; click = scale pop to 0.92; the UI
//                     response is emitted 2–3 frames LATER (the caller uses the returned click frame).
//   5. Never still  — sub-pixel (~0.4px) low-frequency noise even while parked.
// Authored as a waypoint sequence you drive imperatively, so retiming is editing numbers.

const FPS = 30;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Classic pointer-arrow outline (tip at local origin), ~20px.
const ARROW_PTS: Vec2[] = [[0, 0], [0, 17], [4.5, 13], [7.5, 19.5], [10, 18.5], [7, 12], [12, 12]];
function corners(pts: Vec2[]): PathVertex[] {
  return pts.map((p) => ({ position: p, handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' as const }));
}

export type CursorIcon = 'arrow' | 'hand' | 'razor' | 'resize';

export interface CursorRig {
  group: GroupLayer;
  layers: Layer[];
  icons: Record<CursorIcon, ShapeLayer>;
  iconKeys: Record<CursorIcon, KeyStep[]>;
  posKeys: KeyStep[];
  scaleKeys: KeyStep[];
  pos: Vec2;
  frame: number;
  arcSign: number;
  rand: () => number;
  current: CursorIcon;
}

function iconShape(kind: CursorIcon, color: Vec4): ShapeLayer {
  // Each icon is a small polygon at the cursor's local origin; only one is opaque at a time.
  if (kind === 'razor') return createPolygonLayer('razor', 6, 4, corners([[0, 0], [3, 0], [10, 16], [7, 16]]), true, color, 600);
  if (kind === 'resize') return createPolygonLayer('resize', 0, 8, corners([[0, 5], [7, 0], [7, 3], [17, 3], [17, 0], [24, 5], [17, 10], [17, 7], [7, 7], [7, 10]]), true, color, 600);
  if (kind === 'hand') return createPolygonLayer('hand', 2, 2, corners([[0, 6], [3, 6], [3, 0], [6, 0], [6, 6], [9, 6], [9, 2], [12, 2], [12, 14], [2, 14]]), true, color, 600);
  return createPolygonLayer('arrow', 0, 0, corners(ARROW_PTS), true, color, 600);
}

/** Build a cursor: a group of four stacked icons (arrow shown), positioned at `start`. */
export function makeCursor(name: string, color: Vec4, start: Vec2, seed: number): CursorRig {
  const group = createGroupLayer(name, start[0], start[1], 600);
  const kinds: CursorIcon[] = ['arrow', 'hand', 'razor', 'resize'];
  const icons = {} as Record<CursorIcon, ShapeLayer>;
  const iconKeys = {} as Record<CursorIcon, KeyStep[]>;
  const layers: Layer[] = [];
  for (const k of kinds) {
    const s = iconShape(k, color);
    s.parentId = group.id;
    if (s.shape.type === 'polygon') s.shape.strokeColor = [0.05, 0.06, 0.09, 1];
    icons[k] = s;
    iconKeys[k] = [{ f: 0, v: k === 'arrow' ? 1 : 0 }];
    layers.push(s);
  }
  return { group, layers, icons, iconKeys, posKeys: [{ f: 0, v: start }], scaleKeys: [{ f: 0, v: [1, 1] }], pos: start, frame: 0, arcSign: 1, rand: mulberry32(seed), current: 'arrow' };
}

/** Idle in place with sub-pixel noise for `ms`. */
export function park(cur: CursorRig, ms: number): void {
  const frames = Math.round((ms / 1000) * FPS);
  for (let f = 6; f <= frames; f += 6 + Math.floor(cur.rand() * 4)) {
    cur.posKeys.push({ f: cur.frame + f, v: [cur.pos[0] + (cur.rand() - 0.5) * 0.8, cur.pos[1] + (cur.rand() - 0.5) * 0.8], ease: LINEAR });
  }
  cur.frame += frames;
  cur.posKeys.push({ f: cur.frame, v: [cur.pos[0], cur.pos[1]], ease: LINEAR });
}

/** Swap the visible icon on a single frame with a tiny scale pop. */
export function setIcon(cur: CursorRig, kind: CursorIcon): void {
  if (kind === cur.current) return;
  const f = cur.frame;
  cur.iconKeys[cur.current].push({ f: f - 1, v: 1 }, { f, v: 0 });
  cur.iconKeys[kind].push({ f: f - 1, v: 0 }, { f, v: 1 });
  cur.scaleKeys.push({ f: f - 1, v: [1, 1] }, { f: f + 1, v: [1.15, 1.15], ease: EASE_OUT }, { f: f + 3, v: [1, 1], ease: EASE_OUT });
  cur.current = kind;
}

/** Ballistic bezier move to `to`, optional overshoot-and-correct. */
export function moveTo(cur: CursorRig, to: Vec2, opts: { overshoot?: boolean } = {}): void {
  const from = cur.pos;
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const dist = Math.hypot(dx, dy) || 1;
  const durMs = clamp(190 + dist * 0.32, 220, 450) * (0.9 + cur.rand() * 0.18);
  const durF = Math.max(4, Math.round((durMs / 1000) * FPS));
  const px = -dy / dist, py = dx / dist;                 // perpendicular unit
  const arc = dist * (0.08 + cur.rand() * 0.04) * cur.arcSign;
  cur.arcSign *= -1;
  const cx = from[0] + dx * 0.5 + px * arc, cy = from[1] + dy * 0.5 + py * arc;
  const over = !!opts.overshoot && dist > 260 && cur.rand() < 0.75 ? 4 + cur.rand() * 4 : 0;
  const ux = dx / dist, uy = dy / dist;
  const tgt: Vec2 = [to[0] + ux * over, to[1] + uy * over];
  for (let f = 1; f <= durF; f++) {
    const t = f / durF;
    const p = 1 - Math.pow(1 - t, 2.6);                  // ballistic ease-out
    const bx = (1 - p) * (1 - p) * from[0] + 2 * (1 - p) * p * cx + p * p * tgt[0];
    const by = (1 - p) * (1 - p) * from[1] + 2 * (1 - p) * p * cy + p * p * tgt[1];
    cur.posKeys.push({ f: cur.frame + f, v: [bx + (cur.rand() - 0.5) * 0.8, by + (cur.rand() - 0.5) * 0.8], ease: LINEAR });
  }
  cur.frame += durF;
  cur.pos = tgt;
  if (over > 0) {
    const corrF = Math.max(3, Math.round((110 / 1000) * FPS));
    for (let f = 1; f <= corrF; f++) {
      const p = 1 - Math.pow(1 - f / corrF, 2);
      cur.posKeys.push({ f: cur.frame + f, v: [tgt[0] + (to[0] - tgt[0]) * p, tgt[1] + (to[1] - tgt[1]) * p], ease: LINEAR });
    }
    cur.frame += corrF;
    cur.pos = to;
  }
}

/** Dwell, then click (scale pop). Returns the frame the UI should respond ~2–3 frames after. */
export function click(cur: CursorRig): number {
  const dwellF = Math.round(((100 + cur.rand() * 80) / 1000) * FPS);
  park(cur, (dwellF / FPS) * 1000);
  const cf = cur.frame;
  cur.scaleKeys.push({ f: cf - 1, v: [1, 1] }, { f: cf + 1, v: [0.92, 0.92], ease: EASE_OUT }, { f: cf + 3, v: [1, 1], ease: EASE_OUT });
  cur.frame += 4;
  return cf + 2; // UI response fires here (the 2-frame gap that reads as software)
}

/** Finalize: commit the accumulated keyframes onto the cursor's layers. Call once at the end. */
export function commit(cur: CursorRig): Layer[] {
  setKeys(cur.group.transform.position, cur.posKeys);
  setKeys(cur.group.transform.scale, cur.scaleKeys);
  for (const k of Object.keys(cur.iconKeys) as CursorIcon[]) setKeys(cur.icons[k].transform.opacity, cur.iconKeys[k]);
  return [cur.group, ...cur.layers];
}
