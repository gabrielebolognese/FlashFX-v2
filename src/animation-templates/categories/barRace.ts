import type { Layer, Vec2, Vec4 } from '../../core/types';
import type { AnimationTemplate } from '../types';
import { group, box, label, assemble, setKeys, SPRING, EASE_OUT, LINEAR } from '../kit';

// Animated bar-chart RACE. The mechanic that's hard everywhere else is the reordering: a bar's
// vertical slot is rank(index, time), and when two bars cross, one rises a slot and the other drops,
// settling with an overshoot instead of snapping. In AE this needs a script that BAKES keyframes (so
// the data stops being editable). Here the rank/sort is computed per sampled frame in the builder and
// baked too — visually identical, but note: this baked template is NOT the live/editable version.
// The truly-live one needs the data-bound Cloner to render (not wired yet) or a dedicated data layer.
//
// Structure: one row-group per entity (owns the rank-driven Y, spring on crossings); a bar rect
// parented to it and grown from its LEFT edge (local x = width/2, width = value/max·chartW) so growth
// needs no position compensation; a name label + a per-digit odometer value counter that ride the
// row. maxValue rescales over time, so bars AND gridlines respond together.

interface Row { name: string; color: Vec4; v: number[] }
const DATA: Row[] = [
  { name: 'PYTHON', color: [0.3, 0.55, 0.85, 1], v: [45, 58, 70, 85, 98] },
  { name: 'JAVASCRIPT', color: [0.95, 0.8, 0.2, 1], v: [60, 64, 66, 72, 82] },
  { name: 'JAVA', color: [0.9, 0.45, 0.25, 1], v: [70, 62, 55, 50, 48] },
  { name: 'C++', color: [0.45, 0.55, 0.75, 1], v: [50, 52, 54, 58, 61] },
  { name: 'GO', color: [0.35, 0.75, 0.8, 1], v: [12, 28, 42, 58, 74] },
  { name: 'RUST', color: [0.8, 0.45, 0.3, 1], v: [8, 20, 38, 56, 76] },
  { name: 'PHP', color: [0.5, 0.45, 0.7, 1], v: [48, 42, 36, 30, 26] },
  { name: 'RUBY', color: [0.85, 0.3, 0.3, 1], v: [40, 34, 28, 24, 20] },
];

const STOPS = [30, 100, 170, 240, 310]; // frame of each data column
const RACE_START = STOPS[0], RACE_END = STOPS[STOPS.length - 1];
const DUR = 350;

const CHART_X = -560;   // bars' fixed left edge (local)
const CHART_W = 1080;   // full-scale bar width
const TOP = -300;       // y of rank 0
const ROW_H = 76;
const BAR_H = 54;
const GRIDLINES = [20, 40, 60, 80, 100];
const AXIS: Vec4 = [0.3, 0.34, 0.42, 1];
const BG: Vec4 = [0.09, 0.1, 0.14, 1];
const CHAR: Vec4 = [0.92, 0.94, 0.98, 1];

function valueAt(row: Row, f: number): number {
  if (f <= RACE_START) return row.v[0];
  if (f >= RACE_END) return row.v[row.v.length - 1];
  const seg = (f - RACE_START) / ((RACE_END - RACE_START) / (STOPS.length - 1));
  const i = Math.floor(seg);
  const t = seg - i;
  return row.v[i] + (row.v[i + 1] - row.v[i]) * t;
}
function maxAt(f: number): number {
  let m = 0;
  for (const r of DATA) m = Math.max(m, valueAt(r, f));
  return Math.ceil(m / 10) * 10; // nice ceiling → axis rescales in steps
}
function rankAt(idx: number, f: number): number {
  const vals = DATA.map((r, i) => ({ i, val: valueAt(r, f) }));
  vals.sort((a, b) => b.val - a.val || a.i - b.i);
  return vals.findIndex((e) => e.i === idx);
}

// Per-digit odometer: a strip of 0–9 that slides so the current digit sits at the window, neighbours
// faint. Baked coarsely (on digit change) to keep the keyframe count sane.
function odometer(parentId: string, x: number, digitOf: (f: number) => number | null): Layer[] {
  const H = 30;
  const strip = group('digit', [x, 0]);
  strip.parentId = parentId;
  const yKeys: { f: number; v: Vec2; ease?: typeof SPRING }[] = [];
  const opByDigit: { f: number; v: number }[][] = Array.from({ length: 10 }, () => []);
  let prev = -99;
  for (let f = 0; f <= DUR; f += 6) {
    const d = digitOf(f);
    if (d === prev) continue;
    prev = d ?? -99;
    yKeys.push({ f, v: [x, d == null ? 0 : -d * H], ease: SPRING });
    for (let k = 0; k < 10; k++) {
      const vis = d == null ? 0 : (k === d ? 1 : Math.abs(k - d) === 1 ? 0.16 : 0);
      opByDigit[k].push({ f, v: vis });
    }
  }
  setKeys(strip.transform.position, yKeys);
  const out: Layer[] = [strip];
  for (let k = 0; k < 10; k++) {
    const dt = label(String(k), [0, k * H - 9], { size: 30, weight: 700, color: CHAR });
    dt.parentId = strip.id;
    setKeys(dt.transform.opacity, opByDigit[k]);
    out.push(dt);
  }
  return out;
}

function build(ctx: { center: Vec2 }): Layer[] {
  const g = group('Bar Chart Race', ctx.center);
  const c: Layer[] = [];
  c.push(box([0, 0], 2000, 1200, BG));

  // Axis: gridlines + value labels that slide as max rescales (all from the same maxAt()).
  for (const gv of GRIDLINES) {
    const line = box([0, 24], 3, 720, AXIS);
    const lbl = label(String(gv), [0, -350], { size: 22, weight: 600, color: AXIS });
    const lk: { f: number; v: Vec2 }[] = [];
    const llk: { f: number; v: Vec2 }[] = [];
    const ok: { f: number; v: number }[] = [];
    for (let f = 0; f <= DUR; f += 6) {
      const m = maxAt(f);
      const x = CHART_X + (gv / m) * CHART_W;
      lk.push({ f, v: [x, 24] });
      llk.push({ f, v: [x, -350] });
      ok.push({ f, v: gv <= m ? 1 : 0 }); // fade out when above the current max
    }
    setKeys(line.transform.position, lk);
    setKeys(line.transform.opacity, ok);
    setKeys(lbl.transform.position, llk);
    setKeys(lbl.transform.opacity, ok);
    c.push(line, lbl);
  }

  // One row per entity.
  DATA.forEach((row, idx) => {
    const rowG = group(row.name, [CHART_X, TOP]);

    // Rank-driven Y: hold, then spring to the new slot on each crossing (the moment that sells it).
    const yk: { f: number; v: Vec2; ease?: typeof SPRING }[] = [{ f: RACE_START, v: [CHART_X, TOP + rankAt(idx, RACE_START) * ROW_H], ease: LINEAR }];
    let prevRank = rankAt(idx, RACE_START);
    for (let f = RACE_START + 2; f <= RACE_END; f += 2) {
      const rk = rankAt(idx, f);
      if (rk !== prevRank) {
        yk.push({ f, v: [CHART_X, TOP + prevRank * ROW_H], ease: LINEAR });   // hold at old slot
        yk.push({ f: f + 12, v: [CHART_X, TOP + rk * ROW_H], ease: SPRING });  // spring into new slot
        prevRank = rk;
      }
    }
    setKeys(rowG.transform.position, yk);
    // Staggered intro fade (grid-index stagger).
    setKeys(rowG.transform.opacity, [{ f: idx * 4, v: 0 }, { f: idx * 4 + 10, v: 1, ease: EASE_OUT }]);
    c.push(rowG);

    // Bar grown from the left edge: local x = width/2, width = value/max·chartW (keyframed at stops).
    const bar = box([0, 0], 10, BAR_H, row.color);
    bar.motionBlur = true; // weight on the reorder swaps
    bar.parentId = rowG.id;
    const wk: { f: number; v: number; ease?: typeof EASE_OUT }[] = [{ f: idx * 4, v: 0 }];
    const pk: { f: number; v: Vec2; ease?: typeof EASE_OUT }[] = [{ f: idx * 4, v: [0, 0] }];
    for (const sf of STOPS) {
      const w = (valueAt(row, sf) / maxAt(sf)) * CHART_W;
      wk.push({ f: sf, v: w, ease: EASE_OUT });
      pk.push({ f: sf, v: [w / 2, 0], ease: EASE_OUT });
    }
    if (bar.type === 'shape' && bar.shape.type === 'rectangle') setKeys(bar.shape.width, wk);
    setKeys(bar.transform.position, pk);
    c.push(bar);

    // Name label to the left of the bars, riding the row.
    const nm = label(row.name, [-20, -12], { size: 24, weight: 700, color: CHAR, align: 'right' });
    nm.parentId = rowG.id;
    c.push(nm);

    // Value counter that follows the bar's right end (two-digit per-digit odometer).
    const counter = group('counter', [0, 0]);
    counter.parentId = rowG.id;
    const ck: { f: number; v: Vec2 }[] = [];
    for (let f = 0; f <= DUR; f += 6) {
      const w = (valueAt(row, f) / maxAt(f)) * CHART_W;
      ck.push({ f, v: [w + 34, 0] });
    }
    setKeys(counter.transform.position, ck);
    c.push(counter);
    c.push(...odometer(counter.id, -18, (f) => { const v = Math.round(valueAt(row, f)); return v >= 10 ? Math.floor(v / 10) % 10 : null; }));
    c.push(...odometer(counter.id, 14, (f) => Math.round(valueAt(row, f)) % 10));
  });

  return assemble(g, c, DUR);
}

export const barChartRace: AnimationTemplate = {
  id: 'bar-chart-race',
  name: 'Bar Chart Race',
  category: 'showcase',
  description: 'Ranked bars overtake and reorder with an overshoot settle; per-digit counters roll; the axis rescales live.',
  tags: ['bar chart race', 'ranking', 'data', 'reorder', 'overtake', 'counter', 'showcase', 'infographic'],
  durationFrames: DUR,
  authorFps: 30,
  build,
};
