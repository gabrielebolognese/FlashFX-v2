// Acceptance harness for Face Blur mask geometry + normalization (pure). Bundles
// engine/face-blur/faceMask.ts and asserts with node:assert. The mask math (ellipse/rect from a box,
// coverage, resolution-relative strength, selection helpers) is verified here; face DETECTION (Shape
// Detection API / manual regions) and the canvas pixel treatment are browser-gated.
//   node scripts/verify-face-mask.mjs   (or: npm run verify:face-mask)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'facemask-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

const F = (id, x, y, w, h, confidence = 1, manual = false) => ({ id, x, y, w, h, confidence, manual });

try {
  const outfile = join(tmp, 'faceMask.mjs');
  await build({ entryPoints: ['src/engine/face-blur/faceMask.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const M = await import(pathToFileURL(outfile).href);
  const { ellipseMask, coveredRect, blurRadiusPx, pixelBlockPx, featherPx, relevantFaces, autoSelect, invertSelection, confidenceTier } = M;

  check('ellipseMask centres on the box; coverage scales the radii', () => {
    const box = F('a', 0.4, 0.3, 0.2, 0.24);
    const m1 = ellipseMask(box, 1000, 1000, 1.0);
    assert.ok(near(m1.cx, 500) && near(m1.cy, 420));
    assert.ok(near(m1.rx, 100) && near(m1.ry, 120));
    const m15 = ellipseMask(box, 1000, 1000, 1.5);
    assert.ok(near(m15.rx, 150) && near(m15.ry, 180), 'coverage 1.5 expands 50%');
    const m05 = ellipseMask(box, 1000, 1000, 0.5);
    assert.ok(near(m05.rx, 50), 'coverage 0.5 contracts');
  });

  check('coverage clamps to 0.5..1.5', () => {
    const box = F('a', 0.4, 0.3, 0.2, 0.2);
    const huge = ellipseMask(box, 1000, 1000, 5);
    assert.ok(near(huge.rx, 150), 'clamped to 1.5');
  });

  check('coveredRect is the expanded axis-aligned box', () => {
    const r = coveredRect(F('a', 0.4, 0.3, 0.2, 0.2), 1000, 1000, 1.0);
    assert.ok(near(r.x, 400) && near(r.y, 300) && near(r.w, 200) && near(r.h, 200));
  });

  check('blur radius is resolution-relative (same strength scales with image size)', () => {
    const small = blurRadiusPx(72, 500, 500);
    const big = blurRadiusPx(72, 6000, 6000);
    assert.ok(big > small * 5, `big=${big} should dwarf small=${small}`);
    // and monotonic in strength
    assert.ok(blurRadiusPx(90, 2000, 2000) > blurRadiusPx(30, 2000, 2000));
    assert.ok(blurRadiusPx(0, 2000, 2000) >= 1);
  });

  check('pixel block is resolution-relative, monotonic, and capped', () => {
    assert.ok(pixelBlockPx(80, 6000, 6000) > pixelBlockPx(80, 800, 800));
    assert.ok(pixelBlockPx(90, 2000, 2000) > pixelBlockPx(20, 2000, 2000));
    assert.ok(pixelBlockPx(100, 2000, 2000) <= 2000 / 6 + 1, 'capped');
    assert.ok(pixelBlockPx(1, 2000, 2000) >= 2, 'floor');
  });

  check('feather 0 -> 0px (solid redaction default); grows with amount', () => {
    assert.equal(featherPx(0, 2000, 2000), 0);
    assert.ok(featherPx(50, 2000, 2000) > 0);
    assert.ok(featherPx(100, 4000, 4000) > featherPx(100, 1000, 1000));
  });

  check('relevantFaces separates tiny/low-confidence from the main subjects', () => {
    const faces = [
      F('big', 0.4, 0.3, 0.25, 0.3, 0.98),
      F('tiny', 0.9, 0.9, 0.02, 0.02, 0.9),      // too small
      F('unsure', 0.1, 0.1, 0.2, 0.2, 0.3),       // low confidence
      F('drawn', 0.5, 0.5, 0.01, 0.01, 1, true),  // manual -> always relevant
    ];
    const { relevant, minor } = relevantFaces(faces);
    const ids = relevant.map((f) => f.id).sort();
    assert.deepEqual(ids, ['big', 'drawn']);
    assert.equal(minor.length, 2);
  });

  check('autoSelect picks high-confidence relevant faces (+ manual)', () => {
    const faces = [F('a', 0.3, 0.3, 0.2, 0.2, 0.98), F('b', 0.6, 0.3, 0.2, 0.2, 0.61), F('m', 0.5, 0.5, 0.01, 0.01, 1, true)];
    const sel = autoSelect(faces).sort();
    assert.deepEqual(sel, ['a', 'm']); // b (0.61) is below 0.7 threshold -> "possible face", not auto-selected
  });

  check('invertSelection flips over the full id set', () => {
    assert.deepEqual(invertSelection(['a', 'c'], ['a', 'b', 'c', 'd']).sort(), ['b', 'd']);
    assert.deepEqual(invertSelection([], ['a', 'b']).sort(), ['a', 'b']);
    assert.deepEqual(invertSelection(['a', 'b'], ['a', 'b']), []);
  });

  check('confidenceTier maps to high/medium/low', () => {
    assert.equal(confidenceTier(0.95), 'high');
    assert.equal(confidenceTier(0.7), 'medium');
    assert.equal(confidenceTier(0.4), 'low');
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ face-mask harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
