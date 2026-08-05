// Acceptance harness for the pure master-clock timing math (engine/masterClockMath.ts).
// The heart of the audio-master playback rework: elapsed/frame math with the
// picture-vs-scheduling output-latency split, rate scaling, and loop folding.
// Run: node scripts/verify-masterclock.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'masterclock-verify-'));
const outfile = join(tmp, 'mc.mjs');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

try {
  await build({ entryPoints: ['src/engine/masterClockMath.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { elapsedCompSeconds, frameFloat, applyLoop, selectClockTime, monotonic } = await import(pathToFileURL(outfile).href);

  const anchor = { anchorFrame: 0, anchorTime: 100 };

  check('scheduling elapsed = raw elapsed × rate (no latency)', () => {
    assert.ok(near(elapsedCompSeconds(anchor, 101, { fps: 30, rate: 1, outputLatencySec: 0.02 }, false), 1.0));
    assert.ok(near(elapsedCompSeconds(anchor, 101, { fps: 30, rate: 2, outputLatencySec: 0.02 }, false), 2.0));
  });

  check('picture elapsed subtracts output latency', () => {
    // (101 - 100 - 0.02) * 1 = 0.98
    assert.ok(near(elapsedCompSeconds(anchor, 101, { fps: 30, rate: 1, outputLatencySec: 0.02 }, true), 0.98));
  });

  check('frameFloat: scheduling vs picture differ by latency×fps', () => {
    const sched = frameFloat(anchor, 101, { fps: 30, rate: 1, outputLatencySec: 0.02 }, false);
    const pict = frameFloat(anchor, 101, { fps: 30, rate: 1, outputLatencySec: 0.02 }, true);
    assert.ok(near(sched, 30));       // 1.0s × 30
    assert.ok(near(pict, 29.4));      // 0.98s × 30
    assert.ok(near(sched - pict, 0.02 * 30)); // picture is 'latency' behind
  });

  check('frameFloat respects a non-zero anchor frame + rate', () => {
    const f = frameFloat({ anchorFrame: 300, anchorTime: 50 }, 51, { fps: 24, rate: 0.5, outputLatencySec: 0 }, false);
    assert.ok(near(f, 300 + 0.5 * 24)); // 312
  });

  check('applyLoop folds into [0, duration)', () => {
    assert.equal(applyLoop(35, 30, true), 5);
    assert.equal(applyLoop(29, 30, true), 29);
    assert.equal(applyLoop(60, 30, true), 0);
    assert.equal(applyLoop(-5, 30, true), 25); // reverse / pre-anchor wraps
    assert.equal(applyLoop(35, 30, false), 35); // no-op when not looping
    assert.equal(applyLoop(35, 0, true), 35);   // no-op on empty duration
  });

  check('selectClockTime picks ctx time only when running', () => {
    assert.equal(selectClockTime(true, 12.5, 99), 12.5);
    assert.equal(selectClockTime(false, 12.5, 99), 99);
  });

  check('monotonic never goes backwards (coarsened-clock guard)', () => {
    assert.equal(monotonic(5, 6), 6);
    assert.equal(monotonic(7, 6), 7);
    assert.equal(monotonic(6, 6), 6);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
