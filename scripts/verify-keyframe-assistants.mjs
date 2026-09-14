// Acceptance harness for the keyframe assistants (B4b): The Smoother + The Wiggler.
// Bundles the pure module core/keyframeAssistants.ts and asserts with node:assert.
//   node scripts/verify-keyframe-assistants.mjs   (or: npm run verify:keyframe-assistants)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'kfassist-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

const kf = (frame, value) => ({ frame, value, interpolation: 'linear', handleIn: [0, 0], handleOut: [0, 0] });
const allFrames = (kfs) => new Set(kfs.map((k) => k.frame));
// Sum of squared second differences — a proxy for jitter/roughness of a value sequence.
const roughness = (vals) => {
  let s = 0;
  for (let i = 1; i < vals.length - 1; i++) { const d = vals[i + 1] - 2 * vals[i] + vals[i - 1]; s += d * d; }
  return s;
};

try {
  const outfile = join(tmp, 'keyframeAssistants.mjs');
  await build({ entryPoints: ['src/core/keyframeAssistants.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { smoothSelected, wiggleSelected } = await import(pathToFileURL(outfile).href);

  // A jittery number sequence.
  const jitter = [0, 12, -8, 15, -5, 18, -3, 20].map((v, i) => kf(i, v));
  const sel = allFrames(jitter);

  check('Smoother: reduces roughness (2nd-difference) of the values', () => {
    const out = smoothSelected(jitter, sel);
    assert.ok(roughness(out.map((k) => k.value)) < roughness(jitter.map((k) => k.value)) - 1e-6, 'should be smoother');
  });

  check('Smoother: pins the first and last selected keyframes (endpoints unchanged)', () => {
    const out = smoothSelected(jitter, sel);
    assert.ok(near(out[0].value, jitter[0].value));
    assert.ok(near(out[out.length - 1].value, jitter[jitter.length - 1].value));
  });

  check('Smoother: needs ≥3 selected; a 2-keyframe selection is a no-op', () => {
    const two = [kf(0, 0), kf(10, 100)];
    assert.deepEqual(smoothSelected(two, allFrames(two)), two);
  });

  check('Smoother: vec2 smooths per component', () => {
    const v = [kf(0, [0, 0]), kf(1, [50, -50]), kf(2, [0, 0])];
    const out = smoothSelected(v, allFrames(v));
    assert.deepEqual(out[1].value, [0.25 * 0 + 0.5 * 50 + 0.25 * 0, 0.25 * 0 + 0.5 * -50 + 0.25 * 0]); // [25, -25]
    assert.deepEqual(out[0].value, [0, 0]); // endpoint pinned
  });

  const flat = Array.from({ length: 9 }, (_, i) => kf(i, 100)); // a held value to wiggle
  const flatSel = allFrames(flat);

  check('Wiggler: seed-deterministic — same (selection, amplitude, seed) → identical output', () => {
    const a = wiggleSelected(flat, flatSel, 20, 42);
    const b = wiggleSelected(flat, flatSel, 20, 42);
    assert.deepEqual(a.map((k) => k.value), b.map((k) => k.value));
  });

  check('Wiggler: different seeds → different output', () => {
    const a = wiggleSelected(flat, flatSel, 20, 1);
    const b = wiggleSelected(flat, flatSel, 20, 2);
    assert.ok(a.some((k, i) => !near(k.value, b[i].value)), 'seeds should diverge');
  });

  check('Wiggler: every interior value stays within ±amplitude of the base; endpoints pinned', () => {
    const amp = 20;
    const out = wiggleSelected(flat, flatSel, amp, 7);
    assert.ok(near(out[0].value, 100) && near(out[out.length - 1].value, 100), 'endpoints pinned');
    let moved = 0;
    for (let i = 1; i < out.length - 1; i++) {
      assert.ok(Math.abs(out[i].value - 100) <= amp + 1e-9, `interior ${i} within bound`);
      if (!near(out[i].value, 100)) moved++;
    }
    assert.ok(moved > 0, 'interior keyframes actually moved');
  });

  check('Wiggler: vec2 X and Y get independent noise (not lockstep)', () => {
    const v = Array.from({ length: 6 }, (_, i) => kf(i, [100, 100]));
    const out = wiggleSelected(v, allFrames(v), 20, 5);
    const anyDiff = out.slice(1, -1).some((k) => !near(k.value[0] - 100, k.value[1] - 100));
    assert.ok(anyDiff, 'X and Y offsets should differ per keyframe');
  });

  check('Wiggler: amplitude 0 or <3 selected is a no-op', () => {
    assert.deepEqual(wiggleSelected(flat, flatSel, 0, 1), flat);
    const two = [kf(0, 0), kf(10, 100)];
    assert.deepEqual(wiggleSelected(two, allFrames(two), 20, 1), two);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ keyframe-assistants harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
