// Acceptance harness for Cutout + Shadow geometry (pure). Bundles engine/cutout-shadow/shadowGeometry.ts
// and asserts with node:assert. Reuses the Background Removal alpha mask (no second segmentation) - the
// bounds/contact/drop-offset/ground-projection math is verified here; the blur/tint/composite is
// browser-gated.
//   node scripts/verify-shadow-geometry.mjs   (or: npm run verify:shadow-geometry)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'shadow-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

// build a w*h single-channel alpha buffer with an opaque rect [x0,x1]x[y0,y1]
function rectAlpha(w, h, x0, y0, x1, y1) {
  const a = new Uint8ClampedArray(w * h);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) a[y * w + x] = 255;
  return a;
}

try {
  const outfile = join(tmp, 'shadowGeometry.mjs');
  await build({ entryPoints: ['src/engine/cutout-shadow/shadowGeometry.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const M = await import(pathToFileURL(outfile).href);
  const { alphaBounds, contactCenterX, dropShadowOffset, groundShadowParams, softnessBlurPx } = M;

  check('alphaBounds finds the opaque bbox; empty mask -> not found', () => {
    const b = alphaBounds(rectAlpha(100, 100, 20, 30, 60, 80), 100, 100);
    assert.ok(b.found && b.minX === 20 && b.minY === 30 && b.maxX === 60 && b.maxY === 80);
    assert.equal(b.width, 41); assert.equal(b.height, 51);
    const empty = alphaBounds(new Uint8ClampedArray(100 * 100), 100, 100);
    assert.equal(empty.found, false);
  });

  check('alphaBounds respects the threshold (faint pixels excluded)', () => {
    const a = new Uint8ClampedArray(10 * 10); a[5 * 10 + 5] = 4; // below default threshold 8
    assert.equal(alphaBounds(a, 10, 10).found, false);
    a[5 * 10 + 5] = 200;
    assert.ok(alphaBounds(a, 10, 10).found);
  });

  check('contactCenterX = mean x of the bottom band (offset subject leans its contact)', () => {
    // subject wide at top, but only the right side touches the bottom
    const w = 100, h = 100; const a = rectAlpha(w, h, 10, 10, 90, 60);
    for (let y = 61; y <= 80; y++) for (let x = 70; x <= 90; x++) a[y * w + x] = 255; // right-side leg to the floor
    const b = alphaBounds(a, w, h);
    const cx = contactCenterX(a, w, h, b);
    assert.ok(cx > 70 && cx < 91, `contact center ${cx} should sit under the right-side leg`);
  });

  check('dropShadowOffset: direction sign + downward + resolution scaling', () => {
    const left = dropShadowOffset(0, 50, 2000, 2000);
    const right = dropShadowOffset(100, 50, 2000, 2000);
    const straight = dropShadowOffset(50, 50, 2000, 2000);
    assert.ok(left.dx < 0 && right.dx > 0, 'direction 0 -> left, 100 -> right');
    assert.ok(near(straight.dx, 0, 1e-6), 'direction 50 -> straight down');
    assert.ok(left.dy > 0 && right.dy > 0 && straight.dy > 0, 'shadow casts downward');
    // resolution-relative
    assert.ok(dropShadowOffset(50, 100, 6000, 6000).dy > dropShadowOffset(50, 100, 600, 600).dy * 5);
    // distance monotonic
    assert.ok(dropShadowOffset(50, 80, 2000, 2000).dy > dropShadowOffset(50, 20, 2000, 2000).dy);
  });

  check('groundShadowParams: flip (negative scaleY), length grows with distance, shear follows direction', () => {
    const b = alphaBounds(rectAlpha(200, 200, 40, 20, 160, 150), 200, 200);
    const cx = 100;
    const near0 = groundShadowParams(b, cx, 50, 20);
    const far = groundShadowParams(b, cx, 50, 90);
    assert.ok(near0.scaleY < 0 && far.scaleY < 0, 'scaleY negative = flipped onto the floor');
    assert.ok(Math.abs(far.scaleY) > Math.abs(near0.scaleY), 'more distance = longer shadow');
    assert.ok(near0.pivotY === b.maxY && near0.pivotX === cx, 'anchored at the contact point');
    assert.ok(groundShadowParams(b, cx, 0, 50).shearX < 0 && groundShadowParams(b, cx, 100, 50).shearX > 0);
    assert.ok(near(groundShadowParams(b, cx, 50, 50).shearX, 0, 1e-6), 'direction 50 -> no slant');
  });

  check('softnessBlurPx: 0 -> 0, grows with softness + resolution', () => {
    assert.equal(softnessBlurPx(0, 2000, 2000), 0);
    assert.ok(softnessBlurPx(80, 2000, 2000) > softnessBlurPx(20, 2000, 2000));
    assert.ok(softnessBlurPx(100, 6000, 6000) > softnessBlurPx(100, 600, 600));
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ shadow-geometry harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
