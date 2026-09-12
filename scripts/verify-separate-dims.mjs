// Acceptance harness for Separate Dimensions (B3c). Bundles the pure module core/separateDimensions.ts
// (split / merge / per-axis scalar eval) and asserts with node:assert.
//   node scripts/verify-separate-dims.mjs   (or: npm run verify:separate-dims)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'sepdim-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// Minimal keyframe factory for the tests.
const kf = (frame, value, o = {}) => ({ frame, value, interpolation: 'linear', handleIn: [0, 0], handleOut: [0, 0], ...o });

try {
  const outfile = join(tmp, 'separateDimensions.mjs');
  await build({ entryPoints: ['src/core/separateDimensions.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { evalScalarKeyframes, splitDimensions, mergeDimensions } = await import(pathToFileURL(outfile).href);

  check('evalScalarKeyframes: empty → default; before first → default; endpoints exact', () => {
    assert.equal(evalScalarKeyframes([], 42, 5), 42);
    assert.equal(evalScalarKeyframes([kf(10, 100)], 42, 5), 42); // before the only key → default
    assert.equal(evalScalarKeyframes([kf(10, 100)], 42, 20), 100); // at/after → the key
    const two = [kf(0, 0), kf(10, 100)];
    assert.ok(near(evalScalarKeyframes(two, 0, 0), 0));
    assert.ok(near(evalScalarKeyframes(two, 0, 10), 100));
    assert.ok(near(evalScalarKeyframes(two, 0, 5), 50)); // linear midpoint
  });

  check('evalScalarKeyframes: hold keyframe stays flat until the next key', () => {
    const held = [kf(0, 0, { interpolation: 'hold' }), kf(10, 100)];
    assert.equal(evalScalarKeyframes(held, 0, 5), 0);
    assert.equal(evalScalarKeyframes(held, 0, 9.999), 0);
    assert.equal(evalScalarKeyframes(held, 0, 10), 100);
  });

  const combined = [
    kf(0, [0, 0]),
    kf(10, [100, 40], { interpolation: 'bezier', handleOut: [0.42, 0], handleIn: [0.58, 1] }),
    kf(20, [200, 0]),
  ];

  check('splitDimensions: preserves each axis value, frames, and easing', () => {
    const { x, y } = splitDimensions(combined);
    assert.deepEqual(x.map((k) => k.frame), [0, 10, 20]);
    assert.deepEqual(x.map((k) => k.value), [0, 100, 200]);
    assert.deepEqual(y.map((k) => k.value), [0, 40, 0]);
    assert.equal(x[1].interpolation, 'bezier');
    assert.deepEqual(x[1].handleOut, [0.42, 0]); // per-axis easing carried over
  });

  check('splitDimensions: per-axis eval matches the combined component at every frame (byte-stable)', () => {
    const { x, y } = splitDimensions(combined);
    // Reference: evaluate each component of the combined list by scalarizing that component.
    const refX = combined.map((k) => ({ ...k, value: k.value[0] }));
    const refY = combined.map((k) => ({ ...k, value: k.value[1] }));
    for (let f = 0; f <= 20; f += 0.5) {
      assert.ok(near(evalScalarKeyframes(x, 0, f), evalScalarKeyframes(refX, 0, f)), `X mismatch at ${f}`);
      assert.ok(near(evalScalarKeyframes(y, 0, f), evalScalarKeyframes(refY, 0, f)), `Y mismatch at ${f}`);
    }
  });

  check('independence: X and Y curves with DIFFERENT frames evaluate independently', () => {
    const X = [kf(0, 0), kf(20, 200)];       // X keys at 0,20
    const Y = [kf(0, 0), kf(5, 50), kf(20, 50)]; // Y keys at 0,5,20
    assert.ok(near(evalScalarKeyframes(X, 0, 5), 50)); // X interpolates 0..200 over 0..20 → 50 at f=5
    assert.ok(near(evalScalarKeyframes(Y, 0, 5), 50)); // Y hit its own keyframe at f=5
    assert.ok(near(evalScalarKeyframes(Y, 0, 10), 50)); // Y flat 5..20; X still climbing
    assert.ok(near(evalScalarKeyframes(X, 0, 10), 100));
  });

  check('mergeDimensions: union of frames, exact per-axis value at each', () => {
    const X = [kf(0, 0), kf(10, 100)];
    const Y = [kf(0, 0), kf(5, 50), kf(10, 0)];
    const merged = mergeDimensions(X, Y, 0, 0);
    assert.deepEqual(merged.map((k) => k.frame), [0, 5, 10]); // union, sorted
    assert.deepEqual(merged[1].value, [evalScalarKeyframes(X, 0, 5), 50]); // frame 5: X sampled, Y exact
    assert.deepEqual(merged[2].value, [100, 0]);
  });

  check('round-trip: split → merge is byte-stable at the original keyframe frames', () => {
    const { x, y } = splitDimensions(combined);
    const merged = mergeDimensions(x, y, 0, 0);
    assert.deepEqual(merged.map((k) => k.frame), [0, 10, 20]);
    // At every original frame the recoupled value equals the original position exactly.
    for (let i = 0; i < combined.length; i++) {
      assert.ok(near(merged[i].value[0], combined[i].value[0]) && near(merged[i].value[1], combined[i].value[1]), `frame ${combined[i].frame} not preserved`);
    }
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ separate-dims harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
