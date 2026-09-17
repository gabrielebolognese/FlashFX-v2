// Acceptance harness for freeform path-mask resolution (B10c foundation). Bundles the pure
// core/maskPath.ts (which reuses B8b evalPathKeyframes) and asserts with node:assert. The freeform
// coverage SHADER that draws an arbitrary mask outline is the browser-gated step; the evaluation math
// here is proven.
//   node scripts/verify-mask-path.mjs   (or: npm run verify:mask-path)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'maskpath-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

async function bundle(entry, name) {
  const outfile = join(tmp, name);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}

const cv = (x, y) => ({ position: [x, y], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' });
const square = () => [cv(0, 0), cv(20, 0), cv(20, 20), cv(0, 20)];
const big = () => [cv(-10, -10), cv(30, -10), cv(30, 30), cv(-10, 30)];
const kf = (frame, verts) => ({ frame, vertices: verts, closed: true });

try {
  const M = await bundle('src/core/maskPath.ts', 'maskPath.mjs');
  const { resolveMaskVertices, resolveMaskFeathers } = M;

  check('static path (no keyframes) → the vertices unchanged', () => {
    const v = square();
    const r = resolveMaskVertices(v, undefined, 10);
    assert.equal(r.length, 4);
    assert.deepEqual(r[0].position, [0, 0]);
  });

  check('no vertices and no keyframes → empty outline', () => {
    assert.deepEqual(resolveMaskVertices(undefined, undefined, 0), []);
  });

  check('animated path: AT a pose returns its original vertices (via evalPathKeyframes)', () => {
    const kfs = [kf(0, square()), kf(10, big())];
    assert.equal(resolveMaskVertices(undefined, kfs, 0).length, 4);
    assert.equal(resolveMaskVertices(undefined, kfs, 10).length, 4);
  });

  check('animated path: BETWEEN poses returns a morphed (denser) outline', () => {
    const kfs = [kf(0, square()), kf(10, big())];
    const mid = resolveMaskVertices(undefined, kfs, 5);
    assert.ok(mid.length > 4, 'morph is a denser polyline');
  });

  check('feathers: absent → a uniform fallback array of the vertex count', () => {
    assert.deepEqual(resolveMaskFeathers(undefined, 4, 3), [3, 3, 3, 3]);
    assert.deepEqual(resolveMaskFeathers([], 3, 5), [5, 5, 5]);
  });

  check('feathers: per-vertex values, clamped ≥0 and padded to the vertex count with the fallback', () => {
    assert.deepEqual(resolveMaskFeathers([2, -4, 8], 4, 1), [2, 0, 8, 1]); // -4→0, missing 4th→fallback 1
  });

  check('feathers: negative fallback clamps to 0', () => {
    assert.deepEqual(resolveMaskFeathers(undefined, 2, -9), [0, 0]);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ mask-path harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
