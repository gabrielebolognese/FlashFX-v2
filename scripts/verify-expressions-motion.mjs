// Acceptance harness for the procedural-motion expression maths (B7). Bundles the pure leaf module
// src/expressions/motion.ts (no worker globals) and asserts with node:assert. The worker wiring
// (loopOut/loopIn('offset'), bounce(), valueAtTime/delay/posterizeTime scope fns) delegates to these.
//   node scripts/verify-expressions-motion.mjs   (or: npm run verify:expressions-motion)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'exprmotion-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

async function bundle(entry, name) {
  const outfile = join(tmp, name);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}

const kf = (frame, value) => ({ frame, value });

try {
  const M = await bundle('src/expressions/motion.ts', 'motion.mjs');
  const { interpolateKeyframesAt, loopOffset, inertialBounce, posterizeTimeSeconds } = M;

  // --- interpolateKeyframesAt ---
  check('interpolateKeyframesAt: linear between keys, clamps outside the keyed range', () => {
    const kfs = [kf(0, 0), kf(10, 100)];
    assert.ok(near(interpolateKeyframesAt(kfs, 5), 50));
    assert.ok(near(interpolateKeyframesAt(kfs, -3), 0));   // clamp to first
    assert.ok(near(interpolateKeyframesAt(kfs, 999), 100)); // clamp to last
  });
  check('interpolateKeyframesAt: empty → 0, single → that value, vec2 per component', () => {
    assert.equal(interpolateKeyframesAt([], 5), 0);
    assert.deepEqual(interpolateKeyframesAt([kf(3, [7, 9])], 100), [7, 9]);
    assert.deepEqual(interpolateKeyframesAt([kf(0, [0, 0]), kf(10, [100, 20])], 5), [50, 10]);
  });

  // --- loopOffset (loopOut/loopIn 'offset') ---
  check('loopOffset: continuous at BOTH boundaries (E(last)=lastVal, E(first)=firstVal)', () => {
    const kfs = [kf(0, 0), kf(10, 100)];
    assert.ok(near(loopOffset(kfs, 10), 100), 'at last frame equals last value');
    assert.ok(near(loopOffset(kfs, 0), 0), 'at first frame equals first value');
  });
  check('loopOffset: each period adds the segment delta D (accumulates forward)', () => {
    const kfs = [kf(0, 0), kf(10, 100)]; // D = 100, range = 10
    // A linear ramp continues as a straight line: E(f) = f*10.
    assert.ok(near(loopOffset(kfs, 15), 150));
    assert.ok(near(loopOffset(kfs, 25), 250));
    assert.ok(near(loopOffset(kfs, 20), 200)); // exact period multiple → firstVal + 2D
  });
  check('loopOffset: extrapolates backward too (E(first - range) = firstVal - D)', () => {
    const kfs = [kf(0, 0), kf(10, 100)];
    assert.ok(near(loopOffset(kfs, -5), -50));
    assert.ok(near(loopOffset(kfs, -10), -100));
  });
  check('loopOffset: non-flat segment accumulates on top of the in-cycle shape', () => {
    // 0→0 then a bump to 30 at mid, back to 60 at end. D = 60. In cycle 2, add 60.
    const kfs = [kf(0, 0), kf(5, 30), kf(10, 60)];
    // frame 12 → n=1, fLocal=2 → interp(2)= (2/5)*30 = 12; +1*60 = 72
    assert.ok(near(loopOffset(kfs, 12), 72));
  });
  check('loopOffset: vec2 accumulates per component', () => {
    const kfs = [kf(0, [0, 5]), kf(10, [100, 25])]; // D = [100, 20]
    assert.deepEqual(loopOffset(kfs, 15), [150, 35]); // interp(5)=[50,15] +1*[100,20]
  });
  check('loopOffset: <2 keys or zero range is a safe no-op', () => {
    assert.equal(loopOffset([kf(3, 7)], 99), 7);
    assert.equal(loopOffset([kf(3, 7), kf(3, 9)], 99), 9); // range 0 → last value
  });

  // --- inertialBounce (spring overshoot) ---
  const bkf = [kf(0, 0), kf(10, 100)]; // incoming velocity is positive
  check('inertialBounce: inside the keyed range returns the authored value untouched', () => {
    assert.equal(inertialBounce(bkf, 5, 999, 30), 999);
    assert.equal(inertialBounce(bkf, 10, 999, 30), 999); // boundary is still authored
  });
  check('inertialBounce: continuous just past the last key (overshoot ≈ 0 at t→0)', () => {
    const v = inertialBounce(bkf, 10.001, 100, 30);
    assert.ok(near(v, 100, 0.5), `expected ~100, got ${v}`);
  });
  check('inertialBounce: positive incoming velocity overshoots ABOVE the last value', () => {
    const v = inertialBounce(bkf, 13, 100, 30, 2, 4, 0.1); // first positive hump of the sine
    assert.ok(v > 100, `expected overshoot >100, got ${v}`);
  });
  check('inertialBounce: decays back to the last value over time', () => {
    const v = inertialBounce(bkf, 100, 100, 30); // dt = 3s → e^(12) kills the oscillation
    assert.ok(near(v, 100, 1e-3), `expected settle ~100, got ${v}`);
  });
  check('inertialBounce: negative incoming velocity undershoots BELOW the last value', () => {
    const down = [kf(0, 100), kf(10, 0)]; // velocity negative
    const v = inertialBounce(down, 13, 0, 30, 2, 4, 0.1);
    assert.ok(v < 0, `expected undershoot <0, got ${v}`);
  });
  check('inertialBounce: <2 keys is a no-op (returns value)', () => {
    assert.equal(inertialBounce([kf(0, 5)], 50, 42, 30), 42);
  });

  // --- posterizeTimeSeconds ---
  check('posterizeTimeSeconds: snaps to a coarse staircase; rate ≤ 0 is a no-op', () => {
    assert.ok(near(posterizeTimeSeconds(1.04, 12), Math.floor(1.04 * 12) / 12)); // 12/12 = 1.0
    assert.ok(near(posterizeTimeSeconds(1.0, 12), 1.0));
    assert.ok(near(posterizeTimeSeconds(2.7, 0), 2.7));  // no-op
    assert.ok(near(posterizeTimeSeconds(2.7, -5), 2.7)); // no-op
  });
  check('posterizeTimeSeconds: monotonic non-decreasing in time', () => {
    let prev = -Infinity;
    for (let t = 0; t <= 3; t += 0.031) {
      const s = posterizeTimeSeconds(t, 8);
      assert.ok(s >= prev, 'staircase must not go backward');
      prev = s;
    }
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ expressions-motion harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
