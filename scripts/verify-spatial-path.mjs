// Acceptance harness for the spatial motion-path engine (B3a: position keyframes travel arcs).
// Bundles the pure leaf module core/positionPath.ts with esbuild and asserts with node:assert.
//   node scripts/verify-spatial-path.mjs   (or: npm run verify:spatial-path)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'spatial-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const nearV = (a, b, eps = 1e-4) => near(a[0], b[0], eps) && near(a[1], b[1], eps);
const distV = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

try {
  const outfile = join(tmp, 'positionPath.mjs');
  await build({ entryPoints: ['src/core/positionPath.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { cubicBezierVec2, pointAtArcFraction, positionOnSegment, autoSpatialTangents, segmentArcLength, framesFromCumLengths } = await import(pathToFileURL(outfile).href);

  const P0 = [0, 0], P1 = [0, 100], P2 = [100, 100], P3 = [100, 0]; // an arch

  check('cubicBezierVec2 hits its endpoints', () => {
    assert.ok(nearV(cubicBezierVec2(P0, P1, P2, P3, 0), P0));
    assert.ok(nearV(cubicBezierVec2(P0, P1, P2, P3, 1), P3));
  });

  check('pointAtArcFraction hits its endpoints', () => {
    assert.ok(nearV(pointAtArcFraction(P0, P1, P2, P3, 0), P0));
    assert.ok(nearV(pointAtArcFraction(P0, P1, P2, P3, 1), P3));
  });

  check('pointAtArcFraction gives ~constant speed (equal fractions = equal distances)', () => {
    const pts = [];
    for (let i = 0; i <= 10; i++) pts.push(pointAtArcFraction(P0, P1, P2, P3, i / 10));
    const segs = [];
    for (let i = 1; i < pts.length; i++) segs.push(distV(pts[i - 1], pts[i]));
    const min = Math.min(...segs), max = Math.max(...segs);
    assert.ok(max / min < 1.5, `arc-length steps should be near-equal, got ratio ${(max / min).toFixed(2)}`);
    // Sanity: raw-parameter sampling on this arch is markedly less uniform (proves reparam matters).
    const raw = [];
    for (let i = 0; i <= 10; i++) raw.push(cubicBezierVec2(P0, P1, P2, P3, i / 10));
    const rsegs = [];
    for (let i = 1; i < raw.length; i++) rsegs.push(distV(raw[i - 1], raw[i]));
    assert.ok(Math.max(...rsegs) / Math.min(...rsegs) > max / min, 'arc-length must be more uniform than raw t');
  });

  check('positionOnSegment: no tangents → straight line', () => {
    const a = [0, 0], b = [100, 40];
    assert.ok(nearV(positionOnSegment(a, b, undefined, undefined, 0.5), [50, 20]));
    assert.ok(nearV(positionOnSegment(a, b, undefined, undefined, 0), a));
    assert.ok(nearV(positionOnSegment(a, b, undefined, undefined, 1), b));
  });

  check('positionOnSegment: tangents bend the path off the straight line, endpoints exact', () => {
    const a = [0, 0], b = [100, 0];
    const mid = positionOnSegment(a, b, [0, 80], [0, 80], 0.5); // both handles pull upward → arc above the line
    assert.ok(Math.abs(mid[1]) > 20, `curved midpoint should leave the straight line, got y=${mid[1]}`);
    assert.ok(nearV(positionOnSegment(a, b, [0, 80], [0, 80], 0), a));
    assert.ok(nearV(positionOnSegment(a, b, [0, 80], [0, 80], 1), b));
  });

  check('autoSpatialTangents: middle keyframe → smooth (in/out collinear & opposite)', () => {
    const t = autoSpatialTangents([0, 0], [100, 0], [100, 100]); // an L corner
    const cross = t.in[0] * t.out[1] - t.in[1] * t.out[0];
    assert.ok(Math.abs(cross) < 1e-6, `in/out should be collinear (smooth), cross=${cross}`);
    const dot = t.in[0] * t.out[0] + t.in[1] * t.out[1];
    assert.ok(dot < 0, 'in and out point in opposite directions across the keyframe');
  });

  check('autoSpatialTangents: endpoint (missing neighbour) → zero tangent on that side', () => {
    const start = autoSpatialTangents(null, [0, 0], [100, 0]);
    assert.ok(nearV(start.in, [0, 0]), 'first keyframe has no incoming tangent');
    assert.ok(distV(start.out, [0, 0]) > 1, 'first keyframe has an outgoing tangent');
    const endT = autoSpatialTangents([0, 0], [100, 0], null);
    assert.ok(nearV(endT.out, [0, 0]), 'last keyframe has no outgoing tangent');
  });

  check('segmentArcLength: straight = euclidean; curved > straight', () => {
    assert.ok(near(segmentArcLength([0, 0], [100, 0]), 100, 1e-6));
    assert.ok(segmentArcLength([0, 0], [100, 0], [0, 80], [0, 80]) > 100, 'a bowed segment is longer than the chord');
  });

  check('framesFromCumLengths: equal-length segments → equal frame spacing', () => {
    const f = framesFromCumLengths([0, 25, 50, 75, 100], 0, 100);
    assert.deepEqual(f.map((x) => Math.round(x)), [0, 25, 50, 75, 100]);
  });

  check('framesFromCumLengths: frames are proportional to distance (constant speed when roved)', () => {
    const cum = [0, 10, 70, 90]; // uneven distances
    const f = framesFromCumLengths(cum, 0, 90);
    assert.deepEqual(f.map((x) => Math.round(x)), [0, 10, 70, 90]); // frame == distance here (total 90 over span 90)
    // distance-per-frame is constant across every segment after roving
    const speeds = [];
    for (let i = 1; i < cum.length; i++) speeds.push((cum[i] - cum[i - 1]) / (f[i] - f[i - 1]));
    for (let i = 1; i < speeds.length; i++) assert.ok(near(speeds[i], speeds[0], 1e-6), 'speed must be constant across segments');
  });

  check('framesFromCumLengths: endpoints anchored to t0/t1, degenerate path → even spacing', () => {
    const f = framesFromCumLengths([0, 3, 9, 12], 10, 40);
    assert.ok(near(f[0], 10) && near(f[f.length - 1], 40));
    const flat = framesFromCumLengths([0, 0, 0, 0], 0, 30); // zero-length → even
    assert.deepEqual(flat.map((x) => Math.round(x)), [0, 10, 20, 30]);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ spatial-path harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
