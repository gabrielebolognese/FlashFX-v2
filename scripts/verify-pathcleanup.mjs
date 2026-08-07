// Acceptance harness for the path-cleanup core (core/pathCleanup.ts): heal + join.
// Run: node scripts/verify-pathcleanup.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'pathcleanup-verify-'));
const outfile = join(tmp, 'pc.mjs');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const vert = (x, y, hi = [0, 0], ho = [0, 0], type = 'corner') => ({ position: [x, y], handleIn: hi, handleOut: ho, vertexType: type });

// local cubic eval to check heal result
function evalCubic(a, b, t) {
  const p1 = [a.position[0] + a.handleOut[0], a.position[1] + a.handleOut[1]];
  const p2 = [b.position[0] + b.handleIn[0], b.position[1] + b.handleIn[1]];
  const u = 1 - t;
  const c0 = u * u * u, c1 = 3 * u * u * t, c2 = 3 * u * t * t, c3 = t * t * t;
  return [
    c0 * a.position[0] + c1 * p1[0] + c2 * p2[0] + c3 * b.position[0],
    c0 * a.position[1] + c1 * p1[1] + c2 * p2[1] + c3 * b.position[1],
  ];
}

try {
  await build({ entryPoints: ['src/core/pathCleanup.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { healDeleteVertex, reversePath, shouldClosePath, concatPaths } = await import(pathToFileURL(outfile).href);

  // ── heal ──
  const nrm = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  check('heal a curved mid-point → refit A→C cubic keeps endpoint tangents + bulges toward B', () => {
    // A(corner) — B(bezier) — C(corner) — D, remove B (index 1).
    const B = vert(50, 50, [-10, 0], [10, 0], 'bezier');
    const verts = [vert(0, 0), B, vert(100, 0), vert(100, 100)];
    const out = healDeleteVertex(verts, 1, true);
    assert.equal(out.length, 3);
    // endpoints A(0,0)/C(100,0) are fixed; both grow bezier handles.
    assert.deepEqual(out[0].position, [0, 0]);
    assert.deepEqual(out[1].position, [100, 0]);
    assert.equal(out[0].vertexType, 'bezier');
    assert.equal(out[1].vertexType, 'bezier');
    // Schneider fit preserves the outgoing/incoming tangent DIRECTIONS (A,C were corners
    // → chord fallbacks B−A and B−C), only solving handle lengths.
    const dOut = nrm(out[0].handleOut), dIn = nrm(out[1].handleIn);
    const eOut = nrm([50, 50]), eIn = nrm([-50, 50]);
    assert.ok(near(dOut[0], eOut[0]) && near(dOut[1], eOut[1]), `out dir ${dOut} vs ${eOut}`);
    assert.ok(near(dIn[0], eIn[0]) && near(dIn[1], eIn[1]), `in dir ${dIn} vs ${eIn}`);
    // The refit still bulges toward where B was (positive y), staying in a sane range.
    const p = evalCubic(out[0], out[1], 0.5);
    assert.ok(p[1] > 10 && p[1] < 60, `healed midpoint should bulge toward B, got ${p}`);
  });
  check('heal a plain corner (all straight) → point just dropped, no handles grown', () => {
    const verts = [vert(0, 0), vert(50, 0), vert(100, 0), vert(100, 100)];
    const out = healDeleteVertex(verts, 1, true);
    assert.equal(out.length, 3);
    assert.deepEqual(out[0].handleOut, [0, 0]);
    assert.deepEqual(out[1].handleIn, [0, 0]);
  });
  check('heal returns null when the path would be too short', () => {
    assert.equal(healDeleteVertex([vert(0, 0), vert(10, 0)], 0, false), null);
  });
  check('heal an OPEN endpoint just trims it', () => {
    const verts = [vert(0, 0, [0, 0], [10, 10], 'bezier'), vert(50, 0), vert(100, 0)];
    const out = healDeleteVertex(verts, 0, false); // open endpoint
    assert.equal(out.length, 2);
    assert.deepEqual(out.map((v) => v.position), [[50, 0], [100, 0]]);
  });

  // ── reverse ──
  check('reversePath reverses order and swaps handles', () => {
    const r = reversePath([vert(0, 0, [1, 1], [2, 2]), vert(10, 0, [3, 3], [4, 4])]);
    assert.deepEqual(r[0].position, [10, 0]);
    assert.deepEqual(r[0].handleIn, [4, 4]);  // was handleOut
    assert.deepEqual(r[0].handleOut, [3, 3]); // was handleIn
  });

  // ── shouldClose ──
  check('shouldClosePath: endpoints selected → true; closed → false', () => {
    const verts = [vert(0, 0), vert(50, 0), vert(50, 50)];
    assert.equal(shouldClosePath(verts, false, [0, 2]), true);
    assert.equal(shouldClosePath(verts, false, [1]), false);
    assert.equal(shouldClosePath(verts, true, [0, 2]), false);
    assert.equal(shouldClosePath(verts, false, []), true); // whole path
  });

  // ── concat ──
  check('concatPaths joins nearest endpoints (a→b), no merge when apart', () => {
    const a = [vert(0, 0), vert(50, 0)];
    const b = [vert(60, 0), vert(100, 0)];
    const out = concatPaths(a, b);
    assert.deepEqual(out.map((v) => v.position), [[0, 0], [50, 0], [60, 0], [100, 0]]);
  });
  check('concatPaths reverses b to connect the nearest ends', () => {
    // a ends at (50,0); b runs (100,0)→(55,0). Nearest to a.end is b.end (55) → reverse b.
    const a = [vert(0, 0), vert(50, 0)];
    const b = [vert(100, 0), vert(55, 0)];
    const out = concatPaths(a, b);
    assert.deepEqual(out.map((v) => v.position), [[0, 0], [50, 0], [55, 0], [100, 0]]);
  });
  check('concatPaths merges coincident junction anchors', () => {
    const a = [vert(0, 0), vert(50, 0)];
    const b = [vert(50, 0), vert(90, 0)]; // starts exactly where a ends
    const out = concatPaths(a, b);
    assert.equal(out.length, 3); // junction merged
    assert.deepEqual(out.map((v) => v.position), [[0, 0], [50, 0], [90, 0]]);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
