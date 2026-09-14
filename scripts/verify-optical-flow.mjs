// Acceptance harness for the optical-flow retiming helpers (B6a). Bundles the pure module
// core/opticalFlow.ts and asserts with node:assert. The WGSL flow estimator + warp are B6b
// (WebGPU, browser-verified only).
//   node scripts/verify-optical-flow.mjs   (or: npm run verify:optical-flow)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'flow-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

try {
  const outfile = join(tmp, 'opticalFlow.mjs');
  await build({ entryPoints: ['src/core/opticalFlow.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { warpT, flowFieldKey, shouldWarp } = await import(pathToFileURL(outfile).href);

  check('warpT clamps to [0,1]', () => {
    assert.ok(near(warpT(0.3), 0.3));
    assert.ok(near(warpT(-1), 0));
    assert.ok(near(warpT(2), 1));
  });

  check('flowFieldKey: stable, and distinct per pair / resolution / quality', () => {
    const a = flowFieldKey('vid1', 10, 11, 1920, 1080, 1);
    assert.equal(a, flowFieldKey('vid1', 10, 11, 1920, 1080, 1)); // stable
    assert.notEqual(a, flowFieldKey('vid1', 11, 10, 1920, 1080, 1)); // ordered pair matters
    assert.notEqual(a, flowFieldKey('vid1', 10, 11, 960, 540, 1));   // resolution
    assert.notEqual(a, flowFieldKey('vid1', 10, 11, 1920, 1080, 2)); // quality
    assert.notEqual(a, flowFieldKey('vid2', 10, 11, 1920, 1080, 1)); // asset
  });

  check('shouldWarp: only flow mode, between two distinct frames, with real mix', () => {
    assert.equal(shouldWarp('flow', 10, 11, 0.5), true);
    assert.equal(shouldWarp('mix', 10, 11, 0.5), false);   // mix mode → no warp
    assert.equal(shouldWarp('flow', 10, 10, 0.5), false);  // same frame
    assert.equal(shouldWarp('flow', 10, undefined, 0.5), false); // no pair
    assert.equal(shouldWarp('flow', 10, 11, 0), false);    // exact frame (mix 0)
    assert.equal(shouldWarp(undefined, 10, 11, 0.5), false);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ optical-flow harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
