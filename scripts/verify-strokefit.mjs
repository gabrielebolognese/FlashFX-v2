// Acceptance harness for the stroke-fit core (core/strokeFit.ts).
// Run: node scripts/verify-strokefit.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'strokefit-verify-'));
const outfile = join(tmp, 'sf.mjs');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// evaluate the fitted path's cubic segments to check it passes near the samples
function bezier(p0, c1, c2, p3, t) {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1]];
}
function nearestOnPath(verts, p) {
  let best = Infinity;
  for (let i = 0; i < verts.length - 1; i++) {
    const A = verts[i], B = verts[i + 1];
    const p0 = A.position, c1 = [A.position[0] + A.handleOut[0], A.position[1] + A.handleOut[1]];
    const c2 = [B.position[0] + B.handleIn[0], B.position[1] + B.handleIn[1]], p3 = B.position;
    for (let s = 0; s <= 40; s++) { const q = bezier(p0, c1, c2, p3, s / 40); best = Math.min(best, Math.hypot(q[0] - p[0], q[1] - p[1])); }
  }
  return best;
}

try {
  await build({ entryPoints: ['src/core/strokeFit.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { fitStroke } = await import(pathToFileURL(outfile).href);

  check('straight stroke → 2 corner points', () => {
    const s = Array.from({ length: 20 }, (_, i) => [i * 5, 0]);
    const { vertices } = fitStroke(s, { tolerance: 2 });
    assert.equal(vertices.length, 2);
    assert.ok(vertices.every((v) => v.vertexType === 'corner' && v.handleOut[0] === 0 && v.handleOut[1] === 0));
  });

  check('noisy near-straight → few points, endpoints preserved', () => {
    const s = Array.from({ length: 40 }, (_, i) => [i * 3, (i % 2 ? 0.4 : -0.4)]); // sub-tolerance jitter
    const { vertices } = fitStroke(s, { tolerance: 3 });
    assert.ok(vertices.length <= 3, `got ${vertices.length}`);
    assert.ok(near(vertices[0].position[0], 0, 1e-6));
    assert.ok(near(vertices[vertices.length - 1].position[0], 117, 1));
  });

  check('smooth arc → few bezier points that pass near every sample', () => {
    const s = [];
    for (let i = 0; i <= 40; i++) { const a = (Math.PI / 2) * (i / 40); s.push([100 * Math.cos(a), 100 * Math.sin(a)]); }
    const { vertices } = fitStroke(s, { tolerance: 2.5 });
    assert.ok(vertices.length <= 4, `got ${vertices.length} vertices`);
    for (const p of s) assert.ok(nearestOnPath(vertices, p) <= 2.5 * 1.5, `sample ${p} too far`);
    // interior anchors are smooth joints
    if (vertices.length > 2) assert.equal(vertices[1].vertexType, 'smooth');
  });

  check('closed stroke merges endpoints (no coincident duplicate)', () => {
    const s = [];
    for (let i = 0; i <= 40; i++) { const a = 2 * Math.PI * (i / 40); s.push([50 * Math.cos(a), 50 * Math.sin(a)]); }
    const { vertices, closed } = fitStroke(s, { tolerance: 2.5, closed: true });
    assert.equal(closed, true);
    const first = vertices[0], last = vertices[vertices.length - 1];
    assert.ok(Math.hypot(first.position[0] - last.position[0], first.position[1] - last.position[1]) > 1, 'no duplicate coincident anchor');
    assert.ok(!(first.handleIn[0] === 0 && first.handleIn[1] === 0), 'first carries an incoming handle from the closing segment');
  });

  check('deterministic', () => {
    const s = [[0, 0], [10, 12], [25, 8], [40, 20], [60, 5]];
    assert.deepEqual(fitStroke(s, { tolerance: 2 }), fitStroke(s, { tolerance: 2 }));
  });

  check('no -0 in any emitted coord/handle', () => {
    const s = Array.from({ length: 20 }, (_, i) => [i * 5, 0]);
    for (const v of fitStroke(s, { tolerance: 2 }).vertices) {
      for (const arr of [v.position, v.handleIn, v.handleOut]) for (const n of arr) assert.ok(!Object.is(n, -0));
    }
  });

  check('straight option → exactly [corner(first), corner(last)] ignoring interior noise', () => {
    const s = [[0, 0], [10, 40], [20, -30], [30, 5], [40, 0]];
    const { vertices } = fitStroke(s, { tolerance: 2, straight: true });
    assert.equal(vertices.length, 2);
    assert.deepEqual(vertices[0].position, [0, 0]);
    assert.deepEqual(vertices[1].position, [40, 0]);
  });

  check('too-few samples → empty', () => {
    assert.deepEqual(fitStroke([]).vertices, []);
    assert.deepEqual(fitStroke([[5, 5]]).vertices, []);
  });

  check('corner mode → RDP polyline of corners', () => {
    const s = [[0, 0], [10, 0.2], [20, -0.1], [30, 0], [40, 40], [50, 80]];
    const { vertices } = fitStroke(s, { tolerance: 2, mode: 'corner' });
    assert.ok(vertices.every((v) => v.vertexType === 'corner'));
    assert.ok(vertices.length >= 2 && vertices.length < s.length);
  });

  check('relative handles reconstruct absolute controls', () => {
    const s = [];
    for (let i = 0; i <= 30; i++) { const a = (Math.PI / 2) * (i / 30); s.push([80 * Math.cos(a), 80 * Math.sin(a)]); }
    const { vertices } = fitStroke(s, { tolerance: 2 });
    const v0 = vertices[0];
    const absCtrl = [v0.position[0] + v0.handleOut[0], v0.position[1] + v0.handleOut[1]];
    assert.ok(Number.isFinite(absCtrl[0]) && Number.isFinite(absCtrl[1]));
    assert.ok(v0.handleOut[0] !== 0 || v0.handleOut[1] !== 0); // arc start has an outgoing handle
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
