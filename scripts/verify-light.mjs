// Acceptance harness for B16 (pure): beam/lightning geometry (frame-pure seeded midpoint displacement
// + ribbon offset) and the light-effect presets (validated against the registry). The god-ray/flare
// effects already render; the beam's GPU/layer draw is B16-gpu.
//   node scripts/verify-light.mjs   (or: npm run verify:light)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'light-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

async function bundle(entry, name) {
  const outfile = join(tmp, name);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}

try {
  const B = await bundle('src/core/beam/beamGeometry.ts', 'beamGeometry.mjs');
  const LP = await bundle('src/core/effects/lightPresets.ts', 'lightPresets.mjs');
  const S = await bundle('src/core/effects/stylizePresets.ts', 'stylizePresets.mjs');
  const R = await bundle('src/core/effects/effectRegistry.ts', 'effectRegistry.mjs');
  const { straightBeam, lightningPath, ribbon } = B;
  const { LIGHT_PRESETS } = LP;
  const { applyStylizePreset } = S;
  const { EFFECT_DEFS } = R;
  const byType = new Map(EFFECT_DEFS.map((d) => [d.type, d]));

  const a = [0, 0], b = [100, 0];

  check('straightBeam is just the two endpoints', () => {
    assert.deepEqual(straightBeam(a, b), [[0, 0], [100, 0]]);
  });

  check('lightningPath keeps exact endpoints; count = 2^iterations + 1', () => {
    for (const it of [0, 1, 3, 5]) {
      const p = lightningPath(a, b, { iterations: it, amplitude: 20, seed: 7 });
      assert.deepEqual(p[0], [0, 0]);
      assert.deepEqual(p[p.length - 1], [100, 0]);
      assert.equal(p.length, Math.pow(2, it) + 1, `iterations ${it}`);
    }
  });

  check('amplitude 0 (or iterations 0) yields the straight segment', () => {
    assert.deepEqual(lightningPath(a, b, { iterations: 5, amplitude: 0, seed: 3 }), [[0, 0], [100, 0]]);
    assert.deepEqual(lightningPath(a, b, { iterations: 0, amplitude: 50, seed: 3 }), [[0, 0], [100, 0]]);
  });

  check('lightningPath is FRAME-PURE: same seed -> identical, different seed -> different', () => {
    const p1 = lightningPath(a, b, { iterations: 4, amplitude: 30, seed: 42 });
    const p2 = lightningPath(a, b, { iterations: 4, amplitude: 30, seed: 42 });
    assert.deepEqual(p1, p2, 'deterministic for a seed');
    const p3 = lightningPath(a, b, { iterations: 4, amplitude: 30, seed: 43 });
    assert.notDeepEqual(p1, p3, 'seed changes the bolt');
    // displacement is perpendicular -> interior points leave the y=0 axis
    assert.ok(p1.some((pt) => Math.abs(pt[1]) > 1), 'bolt zig-zags off-axis');
  });

  check('ribbon offsets a straight polyline by +/- half width perpendicular', () => {
    const r = ribbon([[0, 0], [10, 0]], 4);
    assert.ok(near(r.left[0][1], 2) && near(r.left[1][1], 2), 'left edge +2 in y');
    assert.ok(near(r.right[0][1], -2) && near(r.right[1][1], -2), 'right edge -2 in y');
    assert.equal(r.outline.length, 4, 'outline = 2 * points');
    // taper=1 pinches the ends to ~0 width
    const t = ribbon([[0, 0], [5, 0], [10, 0]], 8, 1);
    assert.ok(Math.abs(t.left[0][1]) < 0.01, 'tapered end ~0 width');
    assert.ok(Math.abs(t.left[1][1]) > 3, 'tapered middle keeps width');
  });

  check('every light preset references a REAL registry effect with matching paramCount', () => {
    assert.ok(LIGHT_PRESETS.length >= 5);
    for (const p of LIGHT_PRESETS) {
      assert.ok(p.name && p.label && p.effects.length >= 1);
      for (const e of p.effects) {
        const def = byType.get(e.type);
        assert.ok(def, `${p.name}: effect ${e.type} exists`);
        assert.equal(e.params.length, def.paramCount, `${p.name}/${def.id}: params == paramCount`);
      }
    }
    // deep-clone safety
    const c = applyStylizePreset(LIGHT_PRESETS[0]);
    c[0].params[0] = 999;
    assert.notEqual(LIGHT_PRESETS[0].effects[0].params[0], 999);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ light harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
