// Acceptance harness for the B32 motion-principle rigs (pure). Bundles core/motionRigs/motionRigs.ts
// and asserts with node:assert: anticipation (a counter-move before the action), follow-through (an
// overshoot ease into the rest pose), squash & stretch (volume-preserving scale from motion speed),
// and the keyframe frame-shift (staggered offset). Apply-to-selection + stagger ordering live in the
// store; echo/trails render is B32-render, secondary motion is B32-secondary.
//   node scripts/verify-motion-rigs.mjs   (or: npm run verify:motion-rigs)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'motionrigs-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
// minimal Keyframe factory matching the core shape
const K = (frame, value, interpolation = 'linear') => ({ frame, value, interpolation, handleIn: [0, 0], handleOut: [0, 0] });

try {
  const outfile = join(tmp, 'motionRigs.mjs');
  await build({ entryPoints: ['src/core/motionRigs/motionRigs.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const M = await import(pathToFileURL(outfile).href);
  const { addAnticipation, addFollowThrough, buildSquashStretch, shiftKeyframes } = M;

  check('addAnticipation: inserts a windup OPPOSITE the first move; <2 kfs unchanged', () => {
    assert.equal(addAnticipation([K(0, 0)]).length, 1, '<2 keyframes unchanged');
    const out = addAnticipation([K(0, 0), K(10, 100)], { amount: 0.25 });
    assert.equal(out.length, 3, 'one windup keyframe inserted');
    const windup = out[1];
    assert.ok(windup.frame > 0 && windup.frame < 10, 'windup sits inside the first segment');
    assert.ok(windup.value < 0, `windup dips opposite the upward move (${windup.value})`);
    assert.ok(near(windup.value, -25, 1e-6), 'windup = start - amount*(target-start)');
    // original poses preserved
    assert.equal(out[0].value, 0); assert.equal(out[2].value, 100);
  });

  check('addAnticipation: vec2 windup is per-component opposite the move', () => {
    const out = addAnticipation([K(0, [0, 0]), K(20, [100, -40])], { amount: 0.2 });
    assert.deepEqual(out[1].value, [-20, 8], 'per-component windup opposite the move');
  });

  check('addFollowThrough: sets an overshoot ease on the segment into the last pose; <2 unchanged', () => {
    assert.equal(addFollowThrough([K(0, 0)]).length, 1, '<2 unchanged');
    const out = addFollowThrough([K(0, 0), K(10, 100), K(20, 100)], 'elasticOut');
    assert.equal(out[1].easing, 'elasticOut', 'ease set on the pre-rest keyframe');
    assert.ok(!out[0].easing && !out[2].easing, 'other keyframes untouched');
    assert.equal(addFollowThrough([K(0, 0), K(10, 100)])[0].easing, 'backOut', 'default ease is backOut');
  });

  check('buildSquashStretch: rest -> baseline; motion stretches; volume preserved (sx*sy = base area)', () => {
    // a fast vertical move between frames 10..14
    const pos = [K(0, [500, 500]), K(10, [500, 500]), K(15, [500, 100]), K(30, [500, 100])];
    const base = [1, 1];
    const scales = buildSquashStretch(pos, 0, 30, { baseline: base, amount: 0.5 });
    assert.equal(scales.length, 31, 'one scale keyframe per frame');
    // frame 0..9 are at rest -> baseline
    assert.deepEqual(scales[0].value, [1, 1], 'at rest = baseline');
    // during the move (~frame 12) it stretches vertically (sy>1, sx<1)
    const moving = scales[12].value;
    assert.ok(moving[1] > 1 && moving[0] < 1, `vertical stretch (sx=${moving[0].toFixed(2)}, sy=${moving[1].toFixed(2)})`);
    // volume preserved on every frame
    for (const k of scales) assert.ok(near(k.value[0] * k.value[1], base[0] * base[1], 1e-6), 'sx*sy = baseline area');
  });

  check('buildSquashStretch: no motion -> all baseline; baseline scales through', () => {
    const still = [K(0, [0, 0]), K(20, [0, 0])];
    const scales = buildSquashStretch(still, 0, 10, { baseline: [2, 2], amount: 0.5 });
    for (const k of scales) assert.deepEqual(k.value, [2, 2], 'no speed -> exact baseline');
  });

  check('shiftKeyframes: frames shift by delta; clamped at 0; later wins on collision', () => {
    const out = shiftKeyframes([K(0, 10), K(5, 20), K(10, 30)], 4);
    assert.deepEqual(out.map((k) => k.frame), [4, 9, 14], 'all frames + delta');
    assert.equal(out[0].value, 10, 'values carried');
    const clamped = shiftKeyframes([K(0, 1), K(2, 2)], -5);
    assert.equal(clamped[clamped.length - 1].frame, 0, 'clamped at 0');
    // collision: (0) and (2) both map to 0 with delta -5 -> later original frame (2 -> value 2) wins
    assert.equal(clamped[clamped.length - 1].value, 2, 'later original wins on collision');
  });

  check('determinism: identical inputs -> identical output', () => {
    const kfs = [K(0, [0, 0]), K(12, [200, 50]), K(24, [200, 50])];
    assert.deepEqual(addAnticipation(kfs, { amount: 0.3 }), addAnticipation(kfs, { amount: 0.3 }));
    assert.deepEqual(buildSquashStretch(kfs, 0, 24, { amount: 0.4 }), buildSquashStretch(kfs, 0, 24, { amount: 0.4 }));
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ motion-rigs harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
