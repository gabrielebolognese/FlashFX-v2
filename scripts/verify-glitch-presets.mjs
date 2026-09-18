// Acceptance harness for the B14 glitch presets (pure data). Bundles core/effects/glitchPresets.ts +
// the effect registry and asserts every preset references a REAL effect with the right param count,
// and that the shared apply returns a safe deep clone. The glitch effects themselves already render
// frame-pure via existing IMAGE_SHADER cases; pixel-sort / true datamosh are B14-gpu.
//   node scripts/verify-glitch-presets.mjs   (or: npm run verify:glitch-presets)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'glitch-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

async function bundle(entry, name) {
  const outfile = join(tmp, name);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}

try {
  const G = await bundle('src/core/effects/glitchPresets.ts', 'glitchPresets.mjs');
  const S = await bundle('src/core/effects/stylizePresets.ts', 'stylizePresets.mjs');
  const R = await bundle('src/core/effects/effectRegistry.ts', 'effectRegistry.mjs');
  const { GLITCH_PRESETS } = G;
  const { applyStylizePreset } = S;
  const { EFFECT_DEFS } = R;
  const byType = new Map(EFFECT_DEFS.map((d) => [d.type, d]));

  check('at least 6 glitch presets, unique names, >=1 effect each', () => {
    assert.ok(GLITCH_PRESETS.length >= 6);
    const names = GLITCH_PRESETS.map((p) => p.name);
    assert.equal(new Set(names).size, names.length, 'names unique');
    for (const p of GLITCH_PRESETS) { assert.ok(p.name && p.label); assert.ok(p.effects.length >= 1); }
  });

  check('every preset effect is a REAL registry effect with matching paramCount + finite params', () => {
    for (const p of GLITCH_PRESETS) {
      for (const e of p.effects) {
        const def = byType.get(e.type);
        assert.ok(def, `${p.name}: effect type ${e.type} exists`);
        assert.equal(e.params.length, def.paramCount, `${p.name}/${def.id}: params == paramCount`);
        for (const v of e.params) assert.ok(Number.isFinite(v));
        assert.equal(e.enabled, true);
      }
    }
  });

  check('applyStylizePreset deep-clones a glitch preset (mutation-safe)', () => {
    const a = applyStylizePreset(GLITCH_PRESETS[0]);
    a[0].params[0] = 999; a[0].enabled = false;
    assert.notEqual(GLITCH_PRESETS[0].effects[0].params[0], 999);
    assert.equal(GLITCH_PRESETS[0].effects[0].enabled, true);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ glitch-presets harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
