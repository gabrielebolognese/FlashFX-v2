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
  const { trimPath, offsetPath, roughenPath, applyResolvedModifiers } = S;

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

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ shape-motion harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
