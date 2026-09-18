// Acceptance harness for Color Match transfer (pure colour science). Bundles
// engine/color-match/colorTransfer.ts and asserts with node:assert. Conversions, statistics, the
// Reinhard transform, protection, strength interpolation and the UI readout are verified here; the
// per-pixel canvas apply + panel UI are browser-gated.
//   node scripts/verify-color-transfer.mjs   (or: npm run verify:color-transfer)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'colortransfer-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// build a flat RGBA buffer of one colour
function solid(r, g, b, n = 64) { const a = new Uint8ClampedArray(n * 4); for (let i = 0; i < n; i++) { a[i * 4] = r; a[i * 4 + 1] = g; a[i * 4 + 2] = b; a[i * 4 + 3] = 255; } return a; }
// two-tone buffer (to get non-zero std)
function twoTone(c0, c1, n = 64) { const a = new Uint8ClampedArray(n * 4); for (let i = 0; i < n; i++) { const c = i % 2 ? c1 : c0; a[i * 4] = c[0]; a[i * 4 + 1] = c[1]; a[i * 4 + 2] = c[2]; a[i * 4 + 3] = 255; } return a; }

try {
  const outfile = join(tmp, 'colorTransfer.mjs');
  await build({ entryPoints: ['src/engine/color-match/colorTransfer.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const M = await import(pathToFileURL(outfile).href);
  const { srgb8ToOklab, oklabToSrgb8, analyzePixels, combineStats, buildTransform, applyTransform, protectionFactor, autoReadout, describeLook } = M;

  check('OKLab round-trips sRGB within 1 code value', () => {
    for (const [r, g, b] of [[0, 0, 0], [255, 255, 255], [128, 64, 200], [10, 200, 90], [200, 150, 120]]) {
      const lab = srgb8ToOklab(r, g, b);
      const out = oklabToSrgb8(lab.L, lab.a, lab.b);
      assert.ok(near(out.r, r, 1) && near(out.g, g, 1) && near(out.b, b, 1), `${r},${g},${b} -> ${out.r},${out.g},${out.b}`);
    }
  });

  check('grey is (near) neutral in OKLab: a,b ~ 0, L ordered', () => {
    const dark = srgb8ToOklab(40, 40, 40); const light = srgb8ToOklab(210, 210, 210);
    assert.ok(Math.hypot(dark.a, dark.b) < 0.01 && Math.hypot(light.a, light.b) < 0.01);
    assert.ok(light.L > dark.L);
  });

  check('analyzePixels: solid colour -> zero std, mean matches the colour', () => {
    const s = analyzePixels(solid(200, 150, 120));
    assert.ok(near(s.L.std, 0, 1e-6) && near(s.a.std, 0, 1e-6));
    const ref = srgb8ToOklab(200, 150, 120);
    assert.ok(near(s.L.mean, ref.L, 1e-6) && near(s.a.mean, ref.a, 1e-6));
    assert.equal(s.count, 64);
  });

  check('transfer moves the target mean toward the reference mean', () => {
    const target = analyzePixels(twoTone([60, 70, 90], [120, 130, 150]));   // coolish
    const ref = analyzePixels(twoTone([150, 120, 80], [210, 180, 120]));     // warm
    const t = buildTransform(target, ref, 'exact');
    // apply to the target mean colour at full strength
    const mid = { L: target.L.mean, a: target.a.mean, b: target.b.mean };
    const out = applyTransform(mid, t, 1, 0);
    // b (warmth) should increase toward the reference's higher b mean
    assert.ok(out.b > mid.b, `out.b=${out.b} should exceed target mean b=${mid.b}`);
    assert.ok(Math.abs(out.b - ref.b.mean) < Math.abs(mid.b - ref.b.mean), 'closer to ref b mean');
  });

  check('match strength 0 = identity; interpolates to full', () => {
    const target = analyzePixels(twoTone([60, 70, 90], [120, 130, 150]));
    const ref = analyzePixels(twoTone([150, 120, 80], [210, 180, 120]));
    const t = buildTransform(target, ref, 'creative');
    const c = { L: 0.5, a: 0.02, b: -0.05 };
    const at0 = applyTransform(c, t, 0, 0);
    assert.ok(near(at0.L, c.L, 1e-9) && near(at0.a, c.a, 1e-9) && near(at0.b, c.b, 1e-9), 'strength 0 = identity');
    const at50 = applyTransform(c, t, 0.5, 0);
    const at100 = applyTransform(c, t, 1, 0);
    // halfway lies between identity and full
    assert.ok((at50.b - c.b) * (at100.b - c.b) >= 0 && Math.abs(at50.b - c.b) < Math.abs(at100.b - c.b) + 1e-9);
  });

  check('protection reduces the applied change (neutral + skin)', () => {
    const target = analyzePixels(twoTone([60, 70, 90], [120, 130, 150]));
    const ref = analyzePixels(twoTone([150, 120, 80], [210, 180, 120]));
    const t = buildTransform(target, ref, 'exact');
    const grey = srgb8ToOklab(128, 128, 128);
    const pNeutral = protectionFactor(grey, { skin: false, neutral: true });
    assert.ok(pNeutral > 0.9, `grey neutral protection=${pNeutral}`);
    const full = applyTransform(grey, t, 1, 0);
    const prot = applyTransform(grey, t, 1, pNeutral);
    assert.ok(Math.abs(prot.b - grey.b) < Math.abs(full.b - grey.b), 'protected grey moves less');

    const skin = srgb8ToOklab(220, 170, 140); // warm skin-ish
    assert.ok(protectionFactor(skin, { skin: true, neutral: false }) > 0.2, 'skin gets some protection');
    assert.ok(protectionFactor(srgb8ToOklab(20, 120, 220), { skin: true, neutral: false }) < 0.05, 'blue is not skin');
  });

  check('combineStats weights multiple references', () => {
    const a = analyzePixels(solid(200, 100, 80));
    const b = analyzePixels(solid(80, 120, 200));
    const eq = combineStats([{ stats: a, weight: 1 }, { stats: b, weight: 1 }]);
    const biasA = combineStats([{ stats: a, weight: 3 }, { stats: b, weight: 1 }]);
    // biased-to-A combined mean b should be closer to A's b mean than the equal blend
    assert.ok(Math.abs(biasA.b.mean - a.b.mean) < Math.abs(eq.b.mean - a.b.mean));
  });

  check('autoReadout + describeLook produce sane signs/tags', () => {
    const cool = analyzePixels(twoTone([60, 70, 110], [110, 120, 170]));
    const warm = analyzePixels(twoTone([160, 120, 70], [220, 180, 120]));
    const rd = autoReadout(cool, warm);
    assert.ok(rd.temperature > 0, `warming should be +temp, got ${rd.temperature}`);
    assert.equal(describeLook(warm).temperature, 'Warm');
    assert.equal(describeLook(cool).temperature, 'Cool');
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ color-transfer harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
