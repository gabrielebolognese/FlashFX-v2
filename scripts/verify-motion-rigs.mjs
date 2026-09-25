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
  const { addAnticipation, addFollowThrough, buildSquashStretch, shiftKeyframes,
    springFollow, springParamsFromControls, buildSecondaryTracks } = M;

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

  // ── B32-secondary: spring-follow / secondary motion ──
  check('springFollow: constant target settles to and holds the constant', () => {
    const p = springParamsFromControls(0.5, 0.2);
    const out = springFollow(new Array(60).fill(5), p);
    assert.equal(out.length, 60);
    assert.ok(near(out[0], 5, 1e-9), 'starts at the target (no initial snap)');
    assert.ok(near(out[59], 5, 1e-6), 'holds the constant');
  });

  check('springFollow: a step is LAGGED then converges to the step value', () => {
    const p = springParamsFromControls(0.5, 0); // critically damped
    const target = [...new Array(5).fill(0), ...new Array(120).fill(100)];
    const out = springFollow(target, p);
    // right after the step it hasn't arrived yet (lag)
    assert.ok(out[6] < 100 && out[6] > 0, `lags right after the step (${out[6].toFixed(2)})`);
    // it converges by the end
    assert.ok(near(out[out.length - 1], 100, 0.5), `converges to the step (${out[out.length - 1].toFixed(2)})`);
  });

  check('springFollow: critically damped does NOT overshoot; bouncy DOES', () => {
    const step = [...new Array(3).fill(0), ...new Array(160).fill(100)];
    const crit = springFollow(step, springParamsFromControls(0.5, 0));   // zeta=1
    const bouncy = springFollow(step, springParamsFromControls(0.5, 1));  // zeta=0.25
    assert.ok(Math.max(...crit) <= 100 + 1e-6, `critically damped stays <= target (max ${Math.max(...crit).toFixed(2)})`);
    assert.ok(Math.max(...bouncy) > 100 + 1, `bouncy overshoots (max ${Math.max(...bouncy).toFixed(2)})`);
    // never diverges
    assert.ok(bouncy.every((v) => Number.isFinite(v) && v < 1000), 'stable, no blow-up');
  });

  check('springFollow: more lag = slower approach; empty -> []', () => {
    const step = [...new Array(3).fill(0), ...new Array(40).fill(100)];
    const low = springFollow(step, springParamsFromControls(0.0, 0));  // snappy
    const high = springFollow(step, springParamsFromControls(1.0, 0)); // heavy lag
    assert.ok(low[10] > high[10], `less lag arrives sooner (${low[10].toFixed(1)} > ${high[10].toFixed(1)})`);
    assert.deepEqual(springFollow([], springParamsFromControls(0.5, 0)), []);
  });

  check('springParamsFromControls: more lag -> smaller stiffness; damping = 2*zeta*sqrt(k)', () => {
    const a = springParamsFromControls(0, 0), b = springParamsFromControls(1, 0);
    assert.ok(a.stiffness > b.stiffness, 'more lag lowers stiffness');
    assert.ok(a.stiffness > 0 && b.stiffness > 0, 'stiffness stays positive');
    assert.ok(near(a.damping, 2 * 1 * Math.sqrt(a.stiffness), 1e-9), 'critically damped at bounce=0');
  });

  check('buildSecondaryTracks: n samples -> n pos+rot keyframes at startFrame+i, offset applied', () => {
    const parentPos = new Array(20).fill([10, 20]); // static parent
    const parentRot = new Array(20).fill(30);
    const { position, rotation } = buildSecondaryTracks(parentPos, parentRot, 100, {
      ...springParamsFromControls(0.5, 0), offset: [3, -4], rotOffset: 5,
    });
    assert.equal(position.length, 20); assert.equal(rotation.length, 20);
    assert.equal(position[0].frame, 100); assert.equal(position[19].frame, 119);
    // static parent -> child sits at parent+offset every frame
    assert.deepEqual(position[10].value, [13, 16], 'position = followed + offset');
    assert.ok(near(rotation[10].value, 35, 1e-6), 'rotation = followed + rotOffset');
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ motion-rigs harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
