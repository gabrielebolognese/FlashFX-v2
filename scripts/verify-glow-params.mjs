// Acceptance harness for the glow/light-finish param model (B12, pure). Bundles
// core/effects/glowParams.ts and asserts with node:assert. The param model (mode metadata, presets,
// clamping, resolution-relative radius) is verified here; the bloom pyramid / light-wrap / glint
// PASSES are browser-gated (B12-gpu).
//   node scripts/verify-glow-params.mjs   (or: npm run verify:glow-params)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'glow-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

try {
  const outfile = join(tmp, 'glowParams.mjs');
  await build({ entryPoints: ['src/core/effects/glowParams.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const M = await import(pathToFileURL(outfile).href);
  const { GLOW_MODES, GLOW_MODE_META, glowNeedsPyramid, clampGlow, GLOW_PRESETS, applyGlowPreset, glowRadiusPx } = M;

  check('GLOW_MODES has the four modes incl. bloom; only bloom needs the pyramid', () => {
    assert.deepEqual([...GLOW_MODES].sort(), ['bloom', 'image', 'inner', 'outer']);
    assert.equal(glowNeedsPyramid('bloom'), true);
    for (const m of ['image', 'outer', 'inner']) assert.equal(glowNeedsPyramid(m), false);
    for (const m of GLOW_MODES) assert.ok(GLOW_MODE_META[m].label.length > 0);
  });

  check('clampGlow bounds threshold/radius/intensity/lightWrap/glints', () => {
    const g = clampGlow({ enabled: true, mode: 'image', onlyGlow: false, color: [1, 1, 1, 1], intensity: -3, radius: -5, threshold: 2.4, lightWrap: 5, glints: 3.7, glintLength: 250 });
    assert.equal(g.intensity, 0);
    assert.equal(g.radius, 0);
    assert.equal(g.threshold, 1);
    assert.equal(g.lightWrap, 1);
    assert.equal(g.glints, 4);        // rounded
    assert.equal(g.glintLength, 100);
    // absent optionals stay absent
    const g2 = clampGlow({ enabled: true, mode: 'image', onlyGlow: false, color: [1, 1, 1, 1], intensity: 1, radius: 10, threshold: 0.5 });
    assert.equal(g2.lightWrap, undefined);
    assert.equal(g2.glints, undefined);
  });

  check('every preset applies to a valid, enabled, clamped glow', () => {
    assert.ok(GLOW_PRESETS.length >= 4);
    for (const p of GLOW_PRESETS) {
      const g = applyGlowPreset(p);
      assert.equal(g.enabled, true);
      assert.ok(g.threshold >= 0 && g.threshold <= 1, `${p.name} threshold`);
      assert.ok(g.radius >= 0 && g.intensity >= 0);
      assert.ok(GLOW_MODES.includes(g.mode), `${p.name} mode valid`);
      assert.ok(Array.isArray(g.color) && g.color.length === 4);
    }
    const neon = applyGlowPreset(GLOW_PRESETS.find((p) => p.name === 'neon'));
    assert.equal(neon.mode, 'outer');
    const bloom = applyGlowPreset(GLOW_PRESETS.find((p) => p.name === 'bloom'));
    assert.equal(bloom.mode, 'bloom');
  });

  check('applyGlowPreset overrides the base but keeps unspecified fields', () => {
    const base = { enabled: false, mode: 'inner', onlyGlow: true, color: [0, 0, 0, 1], intensity: 0.1, radius: 3, threshold: 0.9 };
    const g = applyGlowPreset({ name: 't', label: 'T', glow: { intensity: 2 } }, base);
    assert.equal(g.intensity, 2);      // overridden
    assert.equal(g.onlyGlow, true);    // kept from base
    assert.equal(g.enabled, true);     // always enabled
  });

  check('glowRadiusPx is resolution-relative to the short side (1080p reference)', () => {
    assert.ok(near(glowRadiusPx(20, 1920, 1080), 20));         // 1080 short side -> identity
    assert.ok(near(glowRadiusPx(20, 3840, 2160), 40));          // 2x
    assert.ok(near(glowRadiusPx(20, 1280, 720), 20 * 720 / 1080));
    assert.equal(glowRadiusPx(-5, 1920, 1080), 0);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ glow-params harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
