// Acceptance harness for mask reveal wipes (B10a). Bundles the pure core/maskReveal.ts and asserts
// with node:assert. Rendering is unchanged — this only computes keyframe values for the mask's
// existing (animatable) position/size, which the shipping mask shader already draws.
//   node scripts/verify-mask-reveal.mjs   (or: npm run verify:mask-reveal)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'maskreveal-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const nearV = (p, q, eps = 1e-9) => Math.abs(p[0] - q[0]) <= eps && Math.abs(p[1] - q[1]) <= eps;

async function bundle(entry, name) {
  const outfile = join(tmp, name);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}

try {
  const M = await bundle('src/core/maskReveal.ts', 'maskReveal.mjs');
  const { buildMaskReveal, MASK_REVEAL_KINDS } = M;
  const center = [100, 60];
  const size = [200, 120]; // hw=100, hh=60

  check('every kind ends at the current (fully-revealed) mask, over [start, start+dur]', () => {
    for (const { id } of MASK_REVEAL_KINDS) {
      const k = buildMaskReveal(id, center, size, 10, 30);
      assert.equal(k.position[0].frame, 10);
      assert.equal(k.position[1].frame, 40);
      assert.equal(k.size[1].frame, 40);
      assert.ok(nearV(k.position[1].value, center), `${id} end pos`);
      assert.ok(nearV(k.size[1].value, size), `${id} end size`);
    }
  });

  check('irisIn: starts collapsed at the center (size 0)', () => {
    const k = buildMaskReveal('irisIn', center, size, 0, 30);
    assert.ok(nearV(k.size[0].value, [0, 0]));
    assert.ok(nearV(k.position[0].value, center));
  });

  check('wipeRight: full-height sliver anchored to the LEFT edge, grows across', () => {
    const k = buildMaskReveal('wipeRight', center, size, 0, 30);
    assert.ok(nearV(k.size[0].value, [0, 120]), 'width 0, full height');
    assert.ok(nearV(k.position[0].value, [0, 60]), 'left edge = cx - hw = 0'); // 100-100
    // the left edge stays put: startLeft (posX - width/2) == endLeft
    const startLeft = k.position[0].value[0] - k.size[0].value[0] / 2;
    const endLeft = k.position[1].value[0] - k.size[1].value[0] / 2;
    assert.ok(Math.abs(startLeft - endLeft) < 1e-9, 'left edge anchored');
  });

  check('wipeLeft: sliver anchored to the RIGHT edge', () => {
    const k = buildMaskReveal('wipeLeft', center, size, 0, 30);
    assert.ok(nearV(k.position[0].value, [200, 60]), 'right edge = cx + hw = 200');
    const startRight = k.position[0].value[0] + k.size[0].value[0] / 2;
    const endRight = k.position[1].value[0] + k.size[1].value[0] / 2;
    assert.ok(Math.abs(startRight - endRight) < 1e-9, 'right edge anchored');
  });

  check('wipeDown: full-width sliver anchored to the TOP edge', () => {
    const k = buildMaskReveal('wipeDown', center, size, 0, 30);
    assert.ok(nearV(k.size[0].value, [200, 0]), 'full width, height 0');
    const startTop = k.position[0].value[1] - k.size[0].value[1] / 2;
    const endTop = k.position[1].value[1] - k.size[1].value[1] / 2;
    assert.ok(Math.abs(startTop - endTop) < 1e-9, 'top edge anchored');
  });

  check('wipeUp: sliver anchored to the BOTTOM edge', () => {
    const k = buildMaskReveal('wipeUp', center, size, 0, 30);
    const startBottom = k.position[0].value[1] + k.size[0].value[1] / 2;
    const endBottom = k.position[1].value[1] + k.size[1].value[1] / 2;
    assert.ok(Math.abs(startBottom - endBottom) < 1e-9, 'bottom edge anchored');
  });

  check('reveal grows (start area < end area) for every kind', () => {
    for (const { id } of MASK_REVEAL_KINDS) {
      const k = buildMaskReveal(id, center, size, 0, 30);
      const a0 = k.size[0].value[0] * k.size[0].value[1];
      const a1 = k.size[1].value[0] * k.size[1].value[1];
      assert.ok(a0 < a1, `${id} must grow`);
    }
  });

  check('zero/negative duration still yields a valid 1-frame span', () => {
    const k = buildMaskReveal('irisIn', center, size, 5, 0);
    assert.equal(k.position[1].frame, 6); // max(1, dur)
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ mask-reveal harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
