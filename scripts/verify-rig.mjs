// Acceptance harness for the B25 rigging solvers (pure). Bundles core/rig/rigging.ts and asserts with
// node:assert: 2-bone IK (reachable/unreachable, bend side, exact segment lengths), FABRIK (reaches
// target + preserves lengths + fixed root), rubber-hose bezier, joystick pose blend. Driving layers
// from a rig is B25-rig.
//   node scripts/verify-rig.mjs   (or: npm run verify:rig)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'rig-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;
const d = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

try {
  const outfile = join(tmp, 'rigging.mjs');
  await build({ entryPoints: ['src/core/rig/rigging.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { solveTwoBone, solveFabrik, rubberHosePath, blendJoystick } = await import(pathToFileURL(outfile).href);

  check('2-bone IK: reachable target -> exact bone lengths, end on target', () => {
    const root = [0, 0], target = [80, 40];
    const r = solveTwoBone(root, target, 60, 60, 1);
    assert.ok(r.reachable);
    assert.ok(near(d(root, r.joint), 60, 1e-2), `len1 (${d(root, r.joint)})`);
    assert.ok(near(d(r.joint, target), 60, 1e-2), `len2 (${d(r.joint, target)})`);
    assert.ok(near(r.end[0], target[0], 1e-2) && near(r.end[1], target[1], 1e-2), 'end on target');
  });

  check('2-bone IK: bendSign flips the elbow to the other side', () => {
    const up = solveTwoBone([0, 0], [100, 0], 60, 60, 1);
    const down = solveTwoBone([0, 0], [100, 0], 60, 60, -1);
    assert.ok(Math.sign(up.joint[1]) !== Math.sign(down.joint[1]) || up.joint[1] !== down.joint[1], 'elbow mirrored');
    assert.ok(near(Math.abs(up.joint[1]), Math.abs(down.joint[1]), 1e-6), 'symmetric bend');
  });

  check('2-bone IK: unreachable target straightens toward it (end at max reach)', () => {
    const r = solveTwoBone([0, 0], [1000, 0], 60, 60, 1);
    assert.equal(r.reachable, false);
    assert.ok(near(r.end[0], 120, 1e-2) && near(r.end[1], 0, 1e-2), 'end at max reach along the line');
    assert.ok(near(d([0, 0], r.joint), 60, 1e-2), 'len1 preserved');
  });

  check('FABRIK: reaches a reachable target + preserves every segment length + fixed root', () => {
    const joints = [[0, 0], [40, 0], [80, 0], [120, 0]];
    const lengths = [40, 40, 40];
    const target = [70, 60];
    const out = solveFabrik(joints, lengths, target, 20, 0.1);
    assert.ok(near(out[0][0], 0, 1e-6) && near(out[0][1], 0, 1e-6), 'root fixed');
    for (let i = 0; i < lengths.length; i++) assert.ok(near(d(out[i], out[i + 1]), lengths[i], 1e-2), `seg ${i} length`);
    assert.ok(d(out[out.length - 1], target) < 0.5, `end reaches target (${d(out[out.length - 1], target)})`);
    // input not mutated
    assert.deepEqual(joints[3], [120, 0]);
  });

  check('FABRIK: unreachable target straightens the chain (lengths preserved)', () => {
    const joints = [[0, 0], [40, 0], [80, 0]];
    const lengths = [40, 40];
    const out = solveFabrik(joints, lengths, [500, 0], 20, 0.1);
    for (let i = 0; i < lengths.length; i++) assert.ok(near(d(out[i], out[i + 1]), lengths[i], 1e-2));
    assert.ok(near(out[2][0], 80, 1e-2), 'straightened along +x to max reach');
  });

  check('rubber hose: endpoints exact; bend 0 = straight; bend offsets the midpoint perpendicular', () => {
    const a = [0, 0], b = [100, 0];
    const straight = rubberHosePath(a, b, 0, 8);
    assert.deepEqual(straight[0], [0, 0]);
    assert.deepEqual(straight[straight.length - 1], [100, 0]);
    assert.ok(near(straight[4][1], 0, 1e-6), 'bend 0 stays on the axis');
    const bent = rubberHosePath(a, b, 40, 8);
    assert.ok(Math.abs(bent[4][1]) > 5, 'bent midpoint leaves the axis');
    assert.deepEqual(bent[0], [0, 0]);
    assert.deepEqual(bent[bent.length - 1], [100, 0]);
  });

  check('joystick blend: corners exact, centre averages', () => {
    const c = { tl: [0, 0], tr: [10, 0], bl: [0, 10], br: [10, 10] };
    assert.deepEqual(blendJoystick(0, 0, c), [0, 0]);
    assert.deepEqual(blendJoystick(1, 0, c), [10, 0]);
    assert.deepEqual(blendJoystick(0, 1, c), [0, 10]);
    assert.deepEqual(blendJoystick(1, 1, c), [10, 10]);
    assert.deepEqual(blendJoystick(0.5, 0.5, c), [5, 5]);
    assert.deepEqual(blendJoystick(-3, 5, c), [0, 10]); // clamps
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ rig harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
