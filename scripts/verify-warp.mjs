// Acceptance harness for B24 (pure): puppet mesh warp (pin-based inverse-distance deformation) + the
// deform presets (validated against the registry). The mesh RENDER (warped texture) is B24-render; the
// warp effects the presets use already render.
//   node scripts/verify-warp.mjs   (or: npm run verify:warp)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'warp-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol = 1e-4) => Math.abs(a - b) <= tol;

async function bundle(entry, name) {
  const outfile = join(tmp, name);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}

try {
  const P = await bundle('src/core/warp/puppet.ts', 'puppet.mjs');
  const D = await bundle('src/core/effects/deformPresets.ts', 'deformPresets.mjs');
  const R = await bundle('src/core/effects/effectRegistry.ts', 'effectRegistry.mjs');
  const { warpPoint, buildWarpMesh, warpMesh } = P;
  const { DEFORM_PRESETS } = D;
  const { EFFECT_DEFS } = R;
  const byType = new Map(EFFECT_DEFS.map((d) => [d.type, d]));

  check('no pins -> identity', () => {
    assert.deepEqual(warpPoint([12, -7], []), [12, -7]);
  });

  check('single pin -> uniform translate by (pos - rest)', () => {
    const pins = [{ rest: [0, 0], pos: [50, 20] }];
    for (const p of [[0, 0], [100, -30], [-40, 60]]) {
      const w = warpPoint(p, pins);
      assert.ok(near(w[0], p[0] + 50) && near(w[1], p[1] + 20), `translate ${p}`);
    }
  });

  check('a point on a pin rest lands on that pin pos', () => {
    const pins = [{ rest: [10, 10], pos: [80, -20] }, { rest: [-40, 30], pos: [-40, 90] }];
    const w = warpPoint([10, 10], pins);
    assert.ok(near(w[0], 80) && near(w[1], -20), 'landed on pin A pos');
    const w2 = warpPoint([-40, 30], pins);
    assert.ok(near(w2[0], -40) && near(w2[1], 90), 'landed on pin B pos');
  });

  check('two pins blend by inverse distance (nearer pin dominates)', () => {
    const pins = [{ rest: [-100, 0], pos: [-100, -50] }, { rest: [100, 0], pos: [100, 50] }];
    // point near the left pin -> mostly the left pin's offset (dy ~ -50)
    const left = warpPoint([-90, 0], pins);
    assert.ok(left[1] < -20, `near-left leans to left offset (dy=${left[1] - 0})`);
    const right = warpPoint([90, 0], pins);
    assert.ok(right[1] > 20, 'near-right leans to right offset');
    // exact midpoint -> symmetric offsets cancel in y
    const mid = warpPoint([0, 0], pins);
    assert.ok(near(mid[1], 0, 1e-6), `midpoint symmetric (dy=${mid[1]})`);
  });

  check('buildWarpMesh grid size + warpMesh applies pins, leaves rest mesh intact', () => {
    const mesh = buildWarpMesh(200, 100, 4, 2);
    assert.equal(mesh.vertices.length, (4 + 1) * (2 + 1));
    assert.deepEqual(mesh.vertices[0], [-100, -50]); // top-left corner
    const pins = [{ rest: [0, 0], pos: [0, 40] }];
    const warped = warpMesh(mesh, pins);
    assert.equal(warped.vertices.length, mesh.vertices.length);
    assert.notDeepEqual(warped.vertices[0], mesh.vertices[0], 'a vertex moved');
    assert.deepEqual(mesh.vertices[0], [-100, -50], 'rest mesh unchanged');
  });

  check('every deform preset references a real warp effect with matching paramCount', () => {
    assert.ok(DEFORM_PRESETS.length >= 6);
    for (const p of DEFORM_PRESETS) {
      assert.ok(p.name && p.label && p.effects.length >= 1);
      for (const e of p.effects) {
        const def = byType.get(e.type);
        assert.ok(def, `${p.name}: effect ${e.type} exists`);
        assert.equal(e.params.length, def.paramCount, `${p.name}/${def.id}: paramCount`);
      }
    }
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ warp harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
