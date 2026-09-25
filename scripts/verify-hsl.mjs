// Acceptance harness for the HSL secondary math (src/core/effects/hsl.ts) - the pure twin of the B15-gpu
// HSL WGSL case. Pins the RGB<->HSL round-trip, hue/sat/lightness adjust, and the hue-range gate (secondary
// correction) so the shader can't drift. The shader render is browser-only; this proves the colour math.
// No test runner in this repo (see CLAUDE.md); bundles the real TS with esbuild + node:assert.
// Run: node scripts/verify-hsl.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'hsl-verify-'));
const outfile = join(tmp, 'hsl.mjs');

let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const nearArr = (a, b, tol = 1e-6) => a.every((v, i) => near(v, b[i], tol));

try {
  await build({
    entryPoints: ['src/core/effects/hsl.ts'],
    outfile, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent',
  });
  const { rgbToHsl, hslToRgb, hueDistance, hslRangeMask, applyHslAdjust } = await import(pathToFileURL(outfile).href);

  check('rgbToHsl: known colours', () => {
    assert.ok(nearArr(rgbToHsl(0, 0, 0), [0, 0, 0]));       // black
    assert.ok(nearArr(rgbToHsl(1, 1, 1), [0, 0, 1]));       // white
    assert.ok(nearArr(rgbToHsl(1, 0, 0), [0, 1, 0.5]));     // red: h0
    assert.ok(near(rgbToHsl(0, 1, 0)[0], 1 / 3));           // green: h=1/3
    assert.ok(near(rgbToHsl(0, 0, 1)[0], 2 / 3));           // blue: h=2/3
    assert.ok(near(rgbToHsl(0.5, 0.5, 0.5)[1], 0));         // grey: s=0
  });

  check('RGB->HSL->RGB round-trips over a grid', () => {
    for (let r = 0; r <= 1.0001; r += 0.25)
      for (let g = 0; g <= 1.0001; g += 0.25)
        for (let b = 0; b <= 1.0001; b += 0.25) {
          const [h, s, l] = rgbToHsl(r, g, b);
          assert.ok(nearArr(hslToRgb(h, s, l), [r, g, b], 1e-6), `round-trip ${r},${g},${b}`);
        }
  });

  check('hueDistance wraps circularly (0..0.5)', () => {
    assert.ok(near(hueDistance(0.1, 0.2), 0.1));
    assert.ok(near(hueDistance(0.05, 0.95), 0.1)); // wraps across 0
    assert.ok(near(hueDistance(0, 0.5), 0.5));     // max
  });

  check('hslRangeMask: global when width >= 1; gated otherwise', () => {
    assert.equal(hslRangeMask(0.7, { hueShift: 0, satScale: 1, lightAdd: 0, rangeWidth: 1 }), 1);
    const g = { hueShift: 0, satScale: 1, lightAdd: 0, rangeCenter: 0.0, rangeWidth: 0.1, rangeSoftness: 0.05 };
    assert.ok(near(hslRangeMask(0.0, g), 1), 'centre fully in band');
    assert.ok(near(hslRangeMask(0.5, g), 0), 'opposite hue fully out');
  });

  check('applyHslAdjust: identity adjust is a no-op', () => {
    const out = applyHslAdjust(0.6, 0.3, 0.2, { hueShift: 0, satScale: 1, lightAdd: 0 });
    assert.ok(nearArr(out, [0.6, 0.3, 0.2], 1e-6));
  });

  check('applyHslAdjust: a half-turn hue shift rotates red toward cyan', () => {
    // red (h0) + 0.5 turn -> cyan (h=0.5). saturation/lightness preserved.
    const out = applyHslAdjust(1, 0, 0, { hueShift: 0.5, satScale: 1, lightAdd: 0 });
    const [h, s, l] = rgbToHsl(out[0], out[1], out[2]);
    assert.ok(near(h, 0.5, 1e-4), `hue rotated to ~0.5 (got ${h})`);
    assert.ok(near(s, 1, 1e-4) && near(l, 0.5, 1e-4), 'sat/lightness kept');
  });

  check('applyHslAdjust: satScale 0 desaturates to grey; lightAdd brightens', () => {
    const grey = applyHslAdjust(1, 0, 0, { hueShift: 0, satScale: 0, lightAdd: 0 });
    assert.ok(near(grey[0], grey[1], 1e-6) && near(grey[1], grey[2], 1e-6), 'desaturated to grey');
    const bright = applyHslAdjust(0.4, 0.4, 0.4, { hueShift: 0, satScale: 1, lightAdd: 0.2 });
    assert.ok(bright[0] > 0.4, 'lightAdd brightens');
  });

  check('applyHslAdjust: hue-range gate only touches in-band pixels (secondary)', () => {
    // shift ONLY reds (band around hue 0). A red pixel changes; a blue pixel does not.
    const opts = { hueShift: 0.3, satScale: 1, lightAdd: 0, rangeCenter: 0, rangeWidth: 0.08, rangeSoftness: 0.03 };
    const red = applyHslAdjust(1, 0, 0, opts);
    assert.ok(!nearArr(red, [1, 0, 0], 1e-3), 'red (in band) is changed');
    const blue = applyHslAdjust(0, 0, 1, opts);
    assert.ok(nearArr(blue, [0, 0, 1], 1e-6), 'blue (out of band) untouched');
  });

  console.log(`\nhsl: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
