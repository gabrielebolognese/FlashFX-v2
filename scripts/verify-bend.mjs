// Acceptance harness for the Bend-tool math core (core/bend.ts).
// Run: node scripts/verify-bend.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'bend-verify-'));
const outfile = join(tmp, 'bend.mjs');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const vert = (x, y, hi = [0, 0], ho = [0, 0], type = 'corner') => ({ position: [x, y], handleIn: hi, handleOut: ho, vertexType: type });

try {
  await build({ entryPoints: ['src/core/bend.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { evalCubic, closestOnSegment, bendHandleDelta } = await import(pathToFileURL(outfile).href);

  check('evalCubic: straight segment midpoint at t=0.5', () => {
    const p = evalCubic(vert(0, 0), vert(100, 0), 0.5);
    assert.ok(near(p[0], 50) && near(p[1], 0), `got ${p}`);
  });
  check('closestOnSegment finds the nearest t', () => {
    const r = closestOnSegment([50, 5], vert(0, 0), vert(100, 0));
    assert.ok(Math.abs(r.t - 0.5) < 0.1, `t=${r.t}`);
    assert.ok(r.dist <= 5 + 1e-6);
  });
  check('bendHandleDelta makes the curve pass through the target at t', () => {
    const a = vert(0, 0), b = vert(100, 0);
    const t = 0.5, target = [50, 60];
    const h = bendHandleDelta(a, b, t, target);
    // apply h to both handles
    const a2 = { ...a, handleOut: [a.handleOut[0] + h[0], a.handleOut[1] + h[1]] };
    const b2 = { ...b, handleIn: [b.handleIn[0] + h[0], b.handleIn[1] + h[1]] };
    const p = evalCubic(a2, b2, t);
    assert.ok(near(p[0], 50) && near(p[1], 60), `curve point ${p} should equal target`);
  });
  check('bendHandleDelta works off-centre (t=0.25)', () => {
    const a = vert(0, 0), b = vert(80, 40);
    const t = 0.25, target = [10, 30];
    const h = bendHandleDelta(a, b, t, target);
    const a2 = { ...a, handleOut: [a.handleOut[0] + h[0], a.handleOut[1] + h[1]] };
    const b2 = { ...b, handleIn: [b.handleIn[0] + h[0], b.handleIn[1] + h[1]] };
    const p = evalCubic(a2, b2, t);
    assert.ok(near(p[0], 10) && near(p[1], 30), `got ${p}`);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
