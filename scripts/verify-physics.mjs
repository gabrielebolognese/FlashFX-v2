// Acceptance harness for the pure physics math (B21). Bundles physics/{forces,velocity}.ts and asserts
// with node:assert: magnet/spring/jiggle forces + handoff-velocity derivation (incl. the near-frame-0
// sample-count fix). The Rapier bake that applies these runs in the browser (WASM) - not here.
//   node scripts/verify-physics.mjs   (or: npm run verify:physics)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'physics-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol = 1e-4) => Math.abs(a - b) <= tol;

async function bundle(entry, name) {
  const outfile = join(tmp, name);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}

try {
  const F = await bundle('src/physics/forces.ts', 'forces.mjs');
  const V = await bundle('src/physics/velocity.ts', 'velocity.mjs');
  const { magnetForce, springForce, dampedSpringStep } = F;
  const { deriveVelocityFromEvaluator, velocityFromMagnitudeAngle, velocityToMagnitudeAngle } = V;

  check('magnetForce: attracts toward the point (strength>0), repels (<0)', () => {
    const attract = magnetForce({ x: 0, y: 0 }, { x: 100, y: 0, strength: 500, radius: 0 });
    assert.ok(attract.x > 0 && near(attract.y, 0), 'pulled to +x');
    const repel = magnetForce({ x: 0, y: 0 }, { x: 100, y: 0, strength: -500, radius: 0 });
    assert.ok(repel.x < 0, 'pushed away');
  });

  check('magnetForce: radius falloff -> zero at/after the radius', () => {
    const m = { x: 100, y: 0, strength: 500, radius: 100 };
    assert.ok(magnetForce({ x: 60, y: 0 }, m).x > 0, 'inside radius pulls');
    assert.ok(near(magnetForce({ x: -50, y: 0 }, m).x, 0), 'beyond radius (dist 150 > 100) = 0');
  });

  check('springForce: zero at rest length; pulls when stretched; pushes when compressed', () => {
    const a = { x: 0, y: 0 }, b = { x: 100, y: 0 };
    assert.ok(near(springForce(a, b, 100, 10, 0).x, 0), 'at rest = 0');
    assert.ok(springForce(a, b, 50, 10, 0).x > 0, 'stretched (dist 100 > rest 50) pulls a toward b (+x)');
    assert.ok(springForce(a, b, 150, 10, 0).x < 0, 'compressed (dist 100 < rest 150) pushes apart (-x)');
  });

  check('springForce: damping opposes closing velocity', () => {
    const a = { x: 0, y: 0 }, b = { x: 100, y: 0 };
    // b moving toward a (relative velocity along axis negative) -> damping subtracts
    const undamped = springForce(a, b, 100, 10, 0, { x: 0, y: 0 }, { x: 0, y: 0 }).x;
    const damped = springForce(a, b, 100, 10, 5, { x: 0, y: 0 }, { x: -20, y: 0 }).x;
    assert.ok(damped < undamped, `damping changes the force (${damped} < ${undamped})`);
  });

  check('dampedSpringStep converges to the target (soft-body jiggle settles)', () => {
    let s = { pos: { x: 120, y: -40 }, vel: { x: 0, y: 0 } };
    const target = { x: 0, y: 0 };
    for (let i = 0; i < 600; i++) s = dampedSpringStep(s.pos, s.vel, target, 150, 18, 1 / 60);
    assert.ok(Math.hypot(s.pos.x, s.pos.y) < 1, `settled near target, |pos|=${Math.hypot(s.pos.x, s.pos.y)}`);
    assert.ok(Math.hypot(s.vel.x, s.vel.y) < 1, 'velocity damped out');
  });

  check('velocity <-> magnitude/angle round-trips', () => {
    for (const [mag, ang] of [[300, 0], [150, 90], [200, 217]]) {
      const v = velocityFromMagnitudeAngle(mag, ang);
      const back = velocityToMagnitudeAngle(v);
      assert.ok(near(back.magnitude, mag, 1e-3), `mag ${mag}`);
      assert.ok(near(((back.angleDeg % 360) + 360) % 360, ((ang % 360) + 360) % 360, 1e-3), `ang ${ang}`);
    }
  });

  check('deriveVelocity from a linear-motion evaluator (and the near-frame-0 sample fix)', () => {
    const evalr = (_id, f) => ({ x: f * 10, y: 0, rotation: 0, width: 0, height: 0 }); // 10px/frame
    const fps = 30;
    // mid-timeline: 3 samples -> 10px/frame / (1/30 s) = 300 px/s
    assert.ok(near(deriveVelocityFromEvaluator('L', 10, fps, 3, evalr).x, 300, 1e-3));
    // near frame 0 (handoff 1): only 1 sample available; the FIX divides by 1, not the window (3) -> 300, not 100
    assert.ok(near(deriveVelocityFromEvaluator('L', 1, fps, 3, evalr).x, 300, 1e-3), 'sample-count fix');
    // handoff 0: no samples -> 0
    assert.ok(near(deriveVelocityFromEvaluator('L', 0, fps, 3, evalr).x, 0));
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ physics harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
