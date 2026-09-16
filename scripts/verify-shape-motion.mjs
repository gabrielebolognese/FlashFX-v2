// Acceptance harness for the pure path-modifier operators (B8a): Trim / Offset / Roughen.
// Bundles src/core/shapeModifiers.ts (leaf, imports only core/bend) and asserts with node:assert.
// Rendering of the resulting PathVertex[] goes through the existing polygon tessellator (unchanged).
//   node scripts/verify-shape-motion.mjs   (or: npm run verify:shape-motion)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'shapemotion-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const nearV = (p, q, eps = 1e-4) => near(p[0], q[0], eps) && near(p[1], q[1], eps);

async function bundle(entry, name) {
  const outfile = join(tmp, name);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}

const cv = (x, y) => ({ position: [x, y], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' });
// Axis-aligned square, CW in this Y-down space: (0,0)→(20,0)→(20,20)→(0,20). Perimeter = 80.
const square = () => [cv(0, 0), cv(20, 0), cv(20, 20), cv(0, 20)];
const line = () => [cv(0, 0), cv(100, 0)];
const bbox = (vs) => {
  let m = [Infinity, Infinity], M = [-Infinity, -Infinity];
  for (const v of vs) { m = [Math.min(m[0], v.position[0]), Math.min(m[1], v.position[1])]; M = [Math.max(M[0], v.position[0]), Math.max(M[1], v.position[1])]; }
  return { min: m, max: M };
};

try {
  const S = await bundle('src/core/shapeModifiers.ts', 'shapeModifiers.mjs');
  const { trimPath, offsetPath, roughenPath, applyResolvedModifiers, puckerBloat, morphPaths, evalPathKeyframes, dashPath, repeaterTransforms } = S;

  // ── Trim ──
  check('trim: full window (0→1) returns the ORIGINAL vertices (byte-identical, keeps beziers)', () => {
    const sq = square();
    const r = trimPath(sq, true, 0, 1, 0);
    assert.equal(r.vertices.length, 4);
    assert.equal(r.closed, true);
    assert.deepEqual(r.vertices, sq);
  });
  check('trim: empty window (0→0) draws nothing', () => {
    const r = trimPath(square(), true, 0, 0, 0);
    assert.equal(r.vertices.length, 0);
  });
  check('trim: first quarter of the square is exactly the first side (0,0)→(20,0)', () => {
    const r = trimPath(square(), true, 0, 0.25, 0); // 25% of 80 = 20 = one side
    assert.equal(r.closed, false);
    assert.ok(nearV(r.vertices[0].position, [0, 0]));
    assert.ok(nearV(r.vertices[r.vertices.length - 1].position, [20, 0]));
  });
  check('trim: open straight line, 0→0.5 ends at the midpoint', () => {
    const r = trimPath(line(), false, 0, 0.5, 0);
    assert.equal(r.closed, false);
    assert.ok(nearV(r.vertices[0].position, [0, 0]));
    assert.ok(nearV(r.vertices[r.vertices.length - 1].position, [50, 0]));
    assert.ok(r.vertices.length > 2, 'flattened polyline has interior points');
  });
  check('trim: offset wraps across the seam on a closed path', () => {
    // window [0,0.25] shifted by 0.9375 (=75/80): starts 15 up the last side at (0,5), wraps through the
    // seam (0,0) and ends 15 along the first side at (15,0).
    const r = trimPath(square(), true, 0, 0.25, 0.9375);
    assert.ok(nearV(r.vertices[0].position, [0, 5]), `start ${r.vertices[0].position}`);
    assert.ok(nearV(r.vertices[r.vertices.length - 1].position, [15, 0]), `end ${r.vertices[r.vertices.length - 1].position}`);
  });
  check('trim: order-independent (start>end normalizes to the same window)', () => {
    const a = trimPath(square(), true, 0.25, 0.5, 0);
    const b = trimPath(square(), true, 0.5, 0.25, 0);
    assert.ok(nearV(a.vertices[0].position, b.vertices[0].position));
    assert.ok(nearV(a.vertices[a.vertices.length - 1].position, b.vertices[b.vertices.length - 1].position));
  });

  // ── Offset ──
  check('offset: outset (+5) grows every side of the square by exactly 5', () => {
    const r = offsetPath(square(), true, 5);
    const b = bbox(r);
    assert.ok(nearV(b.min, [-5, -5]), `min ${b.min}`);
    assert.ok(nearV(b.max, [25, 25]), `max ${b.max}`);
  });
  check('offset: inset (−5) shrinks every side by 5', () => {
    const b = bbox(offsetPath(square(), true, -5));
    assert.ok(nearV(b.min, [5, 5]));
    assert.ok(nearV(b.max, [15, 15]));
  });
  check('offset: amount 0 is identity; vertex count preserved', () => {
    const sq = square();
    const r = offsetPath(sq, true, 0);
    assert.equal(r.length, 4);
    for (let i = 0; i < 4; i++) assert.ok(nearV(r[i].position, sq[i].position));
  });
  check('offset: miter limit caps a sharp corner (no infinite spike)', () => {
    // A very sharp spike vertex; with a small miter limit the offset stays bounded.
    const spike = [cv(0, 0), cv(100, 1), cv(0, 2)]; // near-degenerate angle at the tip
    const r = offsetPath(spike, false, 5, 4);
    for (const v of r) assert.ok(Number.isFinite(v.position[0]) && Number.isFinite(v.position[1]));
    // tip moves by at most amount*miterLimit from the original
    const d = Math.hypot(r[1].position[0] - 100, r[1].position[1] - 1);
    assert.ok(d <= 5 * 4 + 1e-6, `tip moved ${d}, cap ${20}`);
  });

  // ── Roughen ──
  check('roughen: deterministic per seed; different seed → different result', () => {
    const a1 = roughenPath(square(), true, 3, 42);
    const a2 = roughenPath(square(), true, 3, 42);
    const b = roughenPath(square(), true, 3, 99);
    assert.deepEqual(a1.vertices, a2.vertices);
    assert.notDeepEqual(a1.vertices, b.vertices);
  });
  check('roughen: amount 0 is a no-op (positions unchanged)', () => {
    const sq = square();
    const r = roughenPath(sq, true, 0, 42);
    assert.equal(r.vertices.length, 4);
    for (let i = 0; i < 4; i++) assert.ok(nearV(r.vertices[i].position, sq[i].position));
  });
  check('roughen: displacement is bounded by amount (bbox grows ≤ amount)', () => {
    const amt = 3;
    const b = bbox(roughenPath(square(), true, amt, 7).vertices);
    assert.ok(b.min[0] >= 0 - amt - 1e-6 && b.min[1] >= 0 - amt - 1e-6);
    assert.ok(b.max[0] <= 20 + amt + 1e-6 && b.max[1] <= 20 + amt + 1e-6);
  });
  check('roughen: closed path stays closed and does not duplicate the seam vertex', () => {
    const r = roughenPath(square(), true, 3, 7, 8);
    assert.equal(r.closed, true);
    // last point must not equal the first (no dangling duplicate)
    assert.ok(!nearV(r.vertices[0].position, r.vertices[r.vertices.length - 1].position, 1e-9));
  });

  // ── Stack ──
  check('applyResolvedModifiers: empty stack is identity', () => {
    const sq = square();
    const r = applyResolvedModifiers(sq, true, []);
    assert.deepEqual(r.vertices, sq);
    assert.equal(r.closed, true);
  });
  check('applyResolvedModifiers: trim → offset composes in order', () => {
    const r = applyResolvedModifiers(square(), true, [
      { type: 'trim', start: 0, end: 0.5, offset: 0 },
      { type: 'offset', amount: 2 },
    ]);
    assert.equal(r.closed, false);
    assert.ok(r.vertices.length >= 2);
    for (const v of r.vertices) assert.ok(Number.isFinite(v.position[0]) && Number.isFinite(v.position[1]));
  });
  check('applyResolvedModifiers: a trim to empty short-circuits the rest safely', () => {
    const r = applyResolvedModifiers(square(), true, [
      { type: 'trim', start: 0, end: 0, offset: 0 },
      { type: 'offset', amount: 2 },
    ]);
    assert.equal(r.vertices.length, 0);
  });

  // ── Pucker & Bloat (B8b) ──
  check('puckerBloat: amount 0 is identity (original vertices)', () => {
    const sq = square();
    const r = puckerBloat(sq, true, 0);
    assert.equal(r.vertices.length, 4);
    for (let i = 0; i < 4; i++) assert.ok(nearV(r.vertices[i].position, sq[i].position));
  });
  check('puckerBloat: bloat (+) bows every edge OUTWARD, anchors stay put', () => {
    const r = puckerBloat(square(), true, 4);
    const b = bbox(r.vertices);
    // bottom edge midpoint pushed to y ≈ -4, top edge to y ≈ 24; corners unchanged so 0 and 20 remain
    assert.ok(near(b.min[1], -4, 0.05), `min y ${b.min[1]}`);
    assert.ok(near(b.max[1], 24, 0.05), `max y ${b.max[1]}`);
    // an original anchor (0,0) is still present (zero displacement there)
    assert.ok(r.vertices.some((v) => nearV(v.position, [0, 0], 1e-6)), 'anchor preserved');
  });
  check('puckerBloat: pucker (−) bows edges INWARD (mirror sign of bloat)', () => {
    const b = bbox(puckerBloat(square(), true, -4).vertices);
    // edges cave in: bottom midpoint to +4, top to 16 — bbox still bounded by the fixed corners [0,20]
    assert.ok(b.min[1] >= -1e-6 && b.max[1] <= 20 + 1e-6);
  });

  // ── Morph / keyframable path (B8b) ──
  const bigSquare = () => [cv(-10, -10), cv(30, -10), cv(30, 30), cv(-10, 30)]; // same center (10,10), 2× size
  check('morphPaths: t=0 ≈ resampled A, t=1 ≈ resampled B (endpoints)', () => {
    const a0 = morphPaths(square(), true, bigSquare(), true, 0);
    const a1 = morphPaths(square(), true, bigSquare(), true, 1);
    // A starts at (0,0); B starts at (-10,-10)
    assert.ok(nearV(a0.vertices[0].position, [0, 0]));
    assert.ok(nearV(a1.vertices[0].position, [-10, -10]));
  });
  check('morphPaths: identical poses morph to themselves at any t', () => {
    const r = morphPaths(square(), true, square(), true, 0.5);
    // corner (0,0) resampled is still present at t=0.5 (both poses identical)
    assert.ok(r.vertices.some((v) => nearV(v.position, [0, 0], 1e-6)));
  });
  check('morphPaths: midpoint of two concentric squares is the halfway square', () => {
    const r = morphPaths(square(), true, bigSquare(), true, 0.5);
    // (0,0) [A] ↔ (-10,-10) [B] → midpoint (-5,-5); the first resampled point sits there
    assert.ok(nearV(r.vertices[0].position, [-5, -5]), `got ${r.vertices[0].position}`);
    // centered on the shared centroid (10,10) either way
    const b = bbox(r.vertices);
    assert.ok(near((b.min[0] + b.max[0]) / 2, 10, 0.5));
  });

  const kf = (frame, verts, closed = true, interpolation) => ({ frame, vertices: verts, closed, ...(interpolation ? { interpolation } : {}) });
  check('evalPathKeyframes: AT a pose returns its ORIGINAL vertices (beziers intact)', () => {
    const kfs = [kf(0, square()), kf(10, bigSquare())];
    const at0 = evalPathKeyframes(kfs, 0);
    assert.equal(at0.vertices.length, 4); // original 4-vertex square, NOT resampled
    assert.ok(nearV(at0.vertices[0].position, [0, 0]));
    const at10 = evalPathKeyframes(kfs, 10);
    assert.equal(at10.vertices.length, 4);
  });
  check('evalPathKeyframes: BETWEEN poses returns a morphed polyline', () => {
    const kfs = [kf(0, square()), kf(10, bigSquare())];
    const mid = evalPathKeyframes(kfs, 5);
    assert.ok(mid.vertices.length > 4, 'morph is a denser polyline');
    assert.ok(nearV(mid.vertices[0].position, [-5, -5]), `t=0.5 start ${mid.vertices[0].position}`);
  });
  check('evalPathKeyframes: clamps outside the range to the nearest pose', () => {
    const kfs = [kf(0, square()), kf(10, bigSquare())];
    assert.ok(nearV(evalPathKeyframes(kfs, -5).vertices[0].position, [0, 0]));
    assert.ok(nearV(evalPathKeyframes(kfs, 99).vertices[0].position, [-10, -10]));
  });
  check('evalPathKeyframes: hold interpolation freezes a pose until the next', () => {
    const kfs = [kf(0, square(), true, 'hold'), kf(10, bigSquare())];
    const mid = evalPathKeyframes(kfs, 5);
    assert.equal(mid.vertices.length, 4); // held → original square, no morph
    assert.ok(nearV(mid.vertices[0].position, [0, 0]));
  });
  check('evalPathKeyframes: different vertex counts morph (square → triangle)', () => {
    const tri = [cv(10, -10), cv(30, 30), cv(-10, 30)];
    const kfs = [kf(0, square()), kf(10, tri)];
    const mid = evalPathKeyframes(kfs, 5);
    for (const v of mid.vertices) assert.ok(Number.isFinite(v.position[0]) && Number.isFinite(v.position[1]));
    assert.ok(mid.vertices.length >= 8);
  });

  check('applyResolvedModifiers: puckerBloat composes in the stack', () => {
    const r = applyResolvedModifiers(square(), true, [{ type: 'puckerBloat', amount: 3 }]);
    assert.ok(r.vertices.length > 4);
    assert.ok(r.vertices.some((v) => nearV(v.position, [0, 0], 1e-6)), 'anchor kept');
  });

  // ── Dashed strokes (B8c) ──
  check('dashPath: [10,10] on a 100-long line yields 5 dashes at 0,20,40,60,80', () => {
    const d = dashPath(line(), false, [10, 10], 0);
    assert.equal(d.length, 5);
    assert.ok(nearV(d[0][0].position, [0, 0]));
    assert.ok(nearV(d[0][d[0].length - 1].position, [10, 0]));
    assert.ok(nearV(d[1][0].position, [20, 0]));
  });
  check('dashPath: dashOffset shifts the pattern along the path', () => {
    const d = dashPath(line(), false, [10, 10], 10); // starts in the "off" gap → first dash at 10
    assert.ok(nearV(d[0][0].position, [10, 0]), `first dash start ${d[0][0].position}`);
    assert.ok(nearV(d[0][d[0].length - 1].position, [20, 0]));
  });
  check('dashPath: empty / zero pattern returns the whole path as one contour', () => {
    assert.equal(dashPath(line(), false, [], 0).length, 1);
    assert.equal(dashPath(line(), false, [0, 0], 0).length, 1);
  });
  check('dashPath: odd-length array is doubled (SVG rule) — [5] behaves like [5,5]', () => {
    const a = dashPath(line(), false, [5], 0);
    const b = dashPath(line(), false, [5, 5], 0);
    assert.equal(a.length, b.length);
    assert.ok(nearV(a[1][0].position, b[1][0].position));
  });
  check('dashPath: on-dash lengths match the pattern (each ~10 long)', () => {
    const d = dashPath(line(), false, [10, 10], 0);
    for (const dash of d) {
      const p0 = dash[0].position, p1 = dash[dash.length - 1].position;
      assert.ok(near(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), 10, 1e-3));
    }
  });
  check('dashPath: closed square with [20,20] dashes the perimeter (2 on-segments of len 20)', () => {
    const d = dashPath(square(), true, [20, 20], 0); // perimeter 80 → on at [0,20],[40,60]
    assert.equal(d.length, 2);
  });

  // ── In-shape Repeater (B8d) ──
  check('repeaterTransforms: count 0 → none; count 1 → a single identity copy', () => {
    assert.equal(repeaterTransforms(0, 10, 0, 0, 1, 1, 1).length, 0);
    const one = repeaterTransforms(1, 10, 5, 30, 2, 1, 0.5);
    assert.equal(one.length, 1);
    assert.deepEqual(one[0], { dx: 0, dy: 0, rotation: 0, scale: 1, opacity: 1 });
  });
  check('repeaterTransforms: linear array marches by the offset each copy', () => {
    const r = repeaterTransforms(3, 10, 0, 0, 1, 1, 1);
    assert.ok(nearV([r[0].dx, r[0].dy], [0, 0]));
    assert.ok(nearV([r[1].dx, r[1].dy], [10, 0]));
    assert.ok(nearV([r[2].dx, r[2].dy], [20, 0]));
  });
  check('repeaterTransforms: rotation fans copies into a radial array (10 offset, 90°/copy → unit square)', () => {
    const r = repeaterTransforms(4, 10, 0, 90, 1, 1, 1);
    assert.ok(nearV([r[0].dx, r[0].dy], [0, 0]));
    assert.ok(nearV([r[1].dx, r[1].dy], [10, 0]));
    assert.ok(nearV([r[2].dx, r[2].dy], [10, 10]));
    assert.ok(nearV([r[3].dx, r[3].dy], [0, 10]));
    assert.deepEqual(r.map((c) => c.rotation), [0, 90, 180, 270]);
  });
  check('repeaterTransforms: scale accumulates multiplicatively (spiral growth)', () => {
    const r = repeaterTransforms(3, 10, 0, 0, 2, 1, 1);
    assert.deepEqual(r.map((c) => c.scale), [1, 2, 4]);
    assert.ok(nearV([r[1].dx, r[1].dy], [10, 0])); // step 0 contributes scale 1 * 10
    assert.ok(nearV([r[2].dx, r[2].dy], [30, 0])); // + step 1 contributes scale 2 * 10
  });
  check('repeaterTransforms: opacity ramps start→end across copies', () => {
    const r = repeaterTransforms(3, 0, 0, 0, 1, 1, 0);
    assert.ok(near(r[0].opacity, 1) && near(r[1].opacity, 0.5) && near(r[2].opacity, 0));
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ shape-motion harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
