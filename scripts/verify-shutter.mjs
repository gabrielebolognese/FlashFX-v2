// Acceptance harness for composition motion-blur shutter maths (B4a). Bundles the pure module
// core/shutter.ts and asserts with node:assert. (The blur shader itself is WebGPU — browser-verified.)
//   node scripts/verify-shutter.mjs   (or: npm run verify:shutter)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'shutter-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

try {
  const outfile = join(tmp, 'shutter.mjs');
  await build({ entryPoints: ['src/core/shutter.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { effectiveShutterAngle, shutterPhaseFraction, DEFAULT_SHUTTER_ANGLE } = await import(pathToFileURL(outfile).href);

  check('defaults: 180° comp × 180° layer = 180° (the classic filmic default)', () => {
    assert.equal(DEFAULT_SHUTTER_ANGLE, 180);
    assert.ok(near(effectiveShutterAngle(undefined, undefined), 180));
    assert.ok(near(effectiveShutterAngle(180, 180), 180));
  });

  check('NON-BREAKING: comp 180° reproduces the per-layer shutter exactly for any layer value', () => {
    for (const l of [0, 45, 90, 180, 270, 360]) assert.ok(near(effectiveShutterAngle(180, l), l), `layer ${l}`);
    // Absent comp angle (legacy comps) behaves the same.
    for (const l of [0, 90, 180, 360]) assert.ok(near(effectiveShutterAngle(undefined, l), l));
  });

  check('comp angle is the global master (scales all layers); layer is a relative factor', () => {
    assert.ok(near(effectiveShutterAngle(90, 180), 90));   // comp 90 halves the neutral layer
    assert.ok(near(effectiveShutterAngle(180, 90), 90));   // layer 90 is a 0.5× factor
    assert.ok(near(effectiveShutterAngle(360, 90), 180));  // 360 × (90/180)
  });

  check('effective shutter clamps to [0,360]', () => {
    assert.ok(near(effectiveShutterAngle(360, 360), 360)); // 360×2 → clamped
    assert.ok(near(effectiveShutterAngle(0, 180), 0));
    assert.ok(near(effectiveShutterAngle(-90, 180), 0));
  });

  check('shutter phase: 0 centres (default), negative trails, positive leads; guards angle 0', () => {
    assert.ok(near(shutterPhaseFraction(0, 180), 0));
    assert.ok(near(shutterPhaseFraction(undefined, 180), 0));
    assert.ok(near(shutterPhaseFraction(-90, 180), -0.5)); // trailing half a window
    assert.ok(near(shutterPhaseFraction(90, 180), 0.5));   // leading
    assert.ok(near(shutterPhaseFraction(90, 0), 0));       // degenerate angle → no offset
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ shutter harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
