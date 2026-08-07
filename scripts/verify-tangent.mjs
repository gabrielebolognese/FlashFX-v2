// Acceptance harness for the pure tangent-handle mirroring core (core/tangent.ts).
// Run: node scripts/verify-tangent.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'tangent-verify-'));
const outfile = join(tmp, 'tangent.mjs');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

try {
  await build({ entryPoints: ['src/core/tangent.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { computeOppositeHandle, defaultHandleMode } = await import(pathToFileURL(outfile).href);

  check('defaultHandleMode: corner→independent, smooth/bezier→mirrored', () => {
    assert.equal(defaultHandleMode('corner'), 'independent');
    assert.equal(defaultHandleMode('smooth'), 'mirrored');
    assert.equal(defaultHandleMode('bezier'), 'mirrored');
  });
  check('independent → null (opposite untouched)', () => {
    assert.equal(computeOppositeHandle('independent', [10, 0], [0, -5]), null);
  });
  check('mirrored → equal-and-opposite (angle + length)', () => {
    assert.deepEqual(computeOppositeHandle('mirrored', [10, 0], [0, -5]), [-10, 0]);
    assert.deepEqual(computeOppositeHandle('mirrored', [3, 4], [1, 1]), [-3, -4]);
  });
  check('angle → opposite angle, keeps the opposite handle length', () => {
    // dragged along +x (len 10); opposite currently length 5 → new opposite [-5,0].
    const r = computeOppositeHandle('angle', [10, 0], [0, -5]);
    assert.ok(near(r[0], -5) && near(r[1], 0), `got ${r}`);
    // length preserved
    assert.ok(near(Math.hypot(r[0], r[1]), 5));
  });
  check('angle: collinear-opposite direction, arbitrary vectors', () => {
    // dragged (3,4) len 5; opposite len 10 → new opposite = (-3,-4)/5*10 = (-6,-8).
    const r = computeOppositeHandle('angle', [3, 4], [0, 10]);
    assert.ok(near(r[0], -6) && near(r[1], -8), `got ${r}`);
  });
  check('degenerate zero-length → falls back to a plain mirror', () => {
    const a = computeOppositeHandle('angle', [0, 0], [0, -5]);
    assert.ok(near(a[0], 0) && near(a[1], 0), `got ${a}`);
    const b = computeOppositeHandle('angle', [10, 0], [0, 0]);
    assert.ok(near(b[0], -10) && near(b[1], 0), `got ${b}`);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
