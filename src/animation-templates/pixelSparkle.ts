// B54 - "8-bit sparkle": stepped, seeded squares that flicker and wander around a target box (r07 f5-55
// lime squares around "Video editors!", f926-975 around "Use my code"). Pure: `planPixelSparkle` is a
// function of the options only (house mulberry32 seeded per (seed, square, step); no Math.random /
// Date), and `buildPixelSparkle` turns the plan into ordinary editable layers: a group at the box
// centre holding `count` square shape layers, each with HOLD keys on position + opacity, one per step
// where its state changes. The agent runtime commits the result as ONE undo step (applyLayerEdits).
//
// Cells: a grid of `blockSize` squares aligned to the box's top-left corner; the ring is every cell
// inside the box grown by `margin` that does not overlap the box itself (the word stays clean). Each
// step every square is on with probability `density`; an on square keeps wandering: with probability
// `wander` it steps to a ring cell adjacent to its previous one (clusters crawl around the word),
// otherwise it jumps to a random ring cell.

import { createGroupLayer, createKeyframe, createRectangleLayer } from '../core/factory';
import type { GroupLayer, Keyframe, ShapeLayer, Vec2, Vec4 } from '../core/types';

export interface PixelSparkleOptions {
  /** Target box, comp px, top-left origin. */
  box: { x: number; y: number; width: number; height: number };
  color: Vec4;
  /** Squares (layers). Default 12. */
  count?: number;
  /** Square edge px (the grid cell). Default 16. */
  blockSize?: number;
  /** Ring width outside the box, px. Default 3 blocks. */
  margin?: number;
  startFrame: number;
  durationFrames: number;
  /** Frames per flicker step. Default 2. */
  stepFrames?: number;
  /** Probability a square is on in a step (0..1). Default 0.6. */
  density?: number;
  /** Probability an on square crawls to a neighbouring cell instead of jumping (0..1). Default 0.65. */
  wander?: number;
  seed?: number;
  name?: string;
}

export interface PixelSparkleStep {
  frame: number;
  /** Cell centre in comp px, or null when the square is off this step. */
  at: Vec2 | null;
}

export interface PixelSparklePlan {
  /** Ring cell centres (comp px), in a deterministic order. */
  cells: Vec2[];
  /** squares[k] = the square's state per step (steps start at startFrame, every stepFrames). */
  squares: PixelSparkleStep[][];
  stepFrames: number;
  startFrame: number;
  endFrame: number;
  blockSize: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mix3 = (seed: number, a: number, b: number) => ((seed >>> 0) ^ Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca77)) >>> 0;

const fin = (v: number | undefined, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** The ring of grid cells around the box (centres, comp px). */
export function sparkleRingCells(box: PixelSparkleOptions['box'], blockSize: number, margin: number): Vec2[] {
  const s = Math.max(1, blockSize);
  const m = Math.max(s, margin);
  const i0 = Math.floor(-m / s), i1 = Math.ceil((box.width + m) / s) - 1;
  const j0 = Math.floor(-m / s), j1 = Math.ceil((box.height + m) / s) - 1;
  const cells: Vec2[] = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x0 = i * s, y0 = j * s;
    const overlaps = x0 < box.width && x0 + s > 0 && y0 < box.height && y0 + s > 0;
    if (overlaps) continue;
    cells.push([box.x + x0 + s / 2, box.y + y0 + s / 2]);
  }
  return cells;
}

/** The flicker schedule: pure in the options (same options = same plan, whatever order it is asked in). */
export function planPixelSparkle(opts: PixelSparkleOptions): PixelSparklePlan {
  const blockSize = Math.max(1, fin(opts.blockSize, 16));
  const margin = Math.max(blockSize, fin(opts.margin, blockSize * 3));
  const count = Math.max(1, Math.min(200, Math.round(fin(opts.count, 12))));
  const stepFrames = Math.max(1, Math.round(fin(opts.stepFrames, 2)));
  const density = Math.min(1, Math.max(0, fin(opts.density, 0.6)));
  const wander = Math.min(1, Math.max(0, fin(opts.wander, 0.65)));
  const seed = Math.round(fin(opts.seed, 1)) >>> 0;
  const startFrame = Math.round(opts.startFrame);
  const endFrame = startFrame + Math.max(1, Math.round(opts.durationFrames));
  const cells = sparkleRingCells(opts.box, blockSize, margin);
  const key = (c: Vec2) => `${Math.round(c[0] * 8)},${Math.round(c[1] * 8)}`;
  const index = new Map(cells.map((c, i) => [key(c), i]));
  const neighbours = (ci: number): number[] => {
    const [x, y] = cells[ci];
    const out: number[] = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const n = index.get(key([x + dx * blockSize, y + dy * blockSize]));
      if (n !== undefined) out.push(n);
    }
    return out;
  };
  const squares: PixelSparkleStep[][] = [];
  for (let k = 0; k < count; k++) {
    const steps: PixelSparkleStep[] = [];
    let prev = -1;
    for (let s = 0, f = startFrame; f < endFrame; s++, f += stepFrames) {
      const rand = mulberry32(mix3(seed, k, s));
      const on = cells.length > 0 && rand() < density;
      const r2 = rand(), r3 = rand();
      if (!on) { steps.push({ frame: f, at: null }); continue; }
      let ci: number;
      const nb = prev >= 0 ? neighbours(prev) : [];
      if (nb.length > 0 && r2 < wander) ci = nb[Math.floor(r3 * nb.length)];
      else ci = Math.floor(r3 * cells.length);
      prev = ci;
      steps.push({ frame: f, at: [cells[ci][0], cells[ci][1]] });
    }
    squares.push(steps);
  }
  return { cells, squares, stepFrames, startFrame, endFrame, blockSize };
}

/**
 * The plan as layers: [group, ...squares]. The group sits at the box centre (move / scale / parent it
 * to move the whole sparkle); each square's position is relative to it. Hold keys only where a square's
 * state changes; off = opacity 0 (it keeps its last cell).
 */
export function buildPixelSparkle(opts: PixelSparkleOptions): { group: GroupLayer; squares: ShapeLayer[]; plan: PixelSparklePlan } {
  const plan = planPixelSparkle(opts);
  const { box } = opts;
  const c: Vec2 = [box.x + box.width / 2, box.y + box.height / 2];
  const group = createGroupLayer(opts.name ?? 'Pixel sparkle', c[0], c[1], plan.endFrame);
  group.inPoint = plan.startFrame;
  group.outPoint = plan.endFrame;
  const squares: ShapeLayer[] = plan.squares.map((steps, k) => {
    const firstOn = steps.find((st) => st.at)?.at ?? plan.cells[0] ?? c;
    const sq = createRectangleLayer(`Sparkle ${k + 1}`, firstOn[0] - c[0], firstOn[1] - c[1], plan.blockSize, plan.blockSize, [...opts.color] as Vec4, plan.endFrame);
    sq.parentId = group.id;
    sq.inPoint = plan.startFrame;
    sq.outPoint = plan.endFrame;
    const pos: Keyframe[] = [];
    const op: Keyframe[] = [];
    let lastAt: Vec2 = firstOn;
    let lastOn: boolean | null = null;
    for (const st of steps) {
      const on = st.at !== null;
      if (on && st.at && (st.at[0] !== lastAt[0] || st.at[1] !== lastAt[1] || pos.length === 0)) {
        pos.push(createKeyframe(st.frame, [st.at[0] - c[0], st.at[1] - c[1]], 'hold'));
        lastAt = st.at;
      }
      if (on !== lastOn) {
        op.push(createKeyframe(st.frame, on ? 1 : 0, 'hold'));
        lastOn = on;
      }
    }
    if (pos.length > 0) sq.transform.position = { ...sq.transform.position, keyframes: pos };
    sq.transform.opacity = { ...sq.transform.opacity, defaultValue: 0, keyframes: op };
    return sq;
  });
  return { group, squares, plan };
}
