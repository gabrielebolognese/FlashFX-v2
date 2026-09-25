// Acceptance harness for the B14-gpu spatial glitch math (src/core/effects/glitchGpu.ts) - the pure twin
// of the pixel-sort + datamosh WGSL cases. Pins luma, the hash21 determinism/range (frame-purity), the
// bounded block displacement + gate, and the pixel-sort selection rule so the shader can't drift from a
// proven spec. The shader RENDER itself is browser-only; this proves the math. No test runner in this repo
// (see CLAUDE.md); bundles the real TS with esbuild + node:assert. Run: node scripts/verify-glitch-gpu.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'glitchgpu-verify-'));
const outfile = join(tmp, 'glitchgpu.mjs');

let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

try {
  await build({
    entryPoints: ['src/core/effects/glitchGpu.ts'],
    outfile, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent',
  });
  const { luma709, hash21, moshOffset, pixelSortLuma } = await import(pathToFileURL(outfile).href);

  check('luma709 is Rec.709 and monotonic', () => {
    assert.ok(near(luma709(0, 0, 0), 0));
    assert.ok(near(luma709(1, 1, 1), 1));
    assert.ok(near(luma709(1, 0, 0), 0.2126));
    assert.ok(luma709(0, 1, 0) > luma709(1, 0, 0)); // green weighted highest
  });

  check('hash21 is deterministic and in [0,1)', () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 1.7, y = (i % 7) * 3.1;
      const a = hash21(x, y), b = hash21(x, y);
      assert.equal(a, b, 'same input -> same output (frame-pure)');
      assert.ok(a >= 0 && a < 1, `in [0,1): ${a}`);
    }
  });

  check('hash21 varies across inputs (not a constant)', () => {
    const s = new Set();
    for (let i = 0; i < 64; i++) s.add(hash21(i, i * 2).toFixed(6));
    assert.ok(s.size > 40, `distinct values across cells (${s.size}/64)`);
  });

  check('moshOffset: amount 0 -> no displacement and gate off (a no-op)', () => {
    const m = moshOffset(3, 5, 2, 0);
    assert.ok(near(m.dx, 0) && near(m.dy, 0), 'zero offset');
    assert.equal(m.gate, 0, 'gate off at amount 0 (step(1, hg) with hg<1)');
  });

  check('moshOffset: displacement is bounded and deterministic; more amount -> more gated blocks', () => {
    let openLow = 0, openHigh = 0;
    for (let cx = 0; cx < 24; cx++) for (let cy = 0; cy < 14; cy++) {
      const m = moshOffset(cx, cy, 4, 1);
      assert.ok(Math.hypot(m.dx, m.dy) <= 0.15 + 1e-9, 'offset magnitude <= 0.15');
      assert.deepEqual(m, moshOffset(cx, cy, 4, 1), 'deterministic');
      if (moshOffset(cx, cy, 4, 0.2).gate === 1) openLow++;
      if (moshOffset(cx, cy, 4, 0.9).gate === 1) openHigh++;
    }
    assert.ok(openHigh > openLow, `higher amount corrupts more blocks (${openHigh} > ${openLow})`);
  });

  check('moshOffset: a new time seed changes the field (frame-to-frame corruption)', () => {
    const a = moshOffset(5, 5, 10, 1);
    const b = moshOffset(5, 5, 11, 1);
    assert.notDeepEqual(a, b, 'different seed -> different offset/gate');
  });

  check('pixelSortLuma: carries the brightest above-gate neighbour; else keeps current', () => {
    // a bright neighbour above gate wins
    assert.ok(near(pixelSortLuma(0.4, [0.2, 0.9, 0.5], 0.5), 0.9));
    // all neighbours below gate -> keep current
    assert.ok(near(pixelSortLuma(0.4, [0.1, 0.2, 0.3], 0.5), 0.4));
    // current already brightest -> unchanged
    assert.ok(near(pixelSortLuma(0.95, [0.6, 0.9, 0.8], 0.5), 0.95));
    // empty window -> current
    assert.ok(near(pixelSortLuma(0.4, [], 0.5), 0.4));
  });

  console.log(`\nglitch-gpu: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
