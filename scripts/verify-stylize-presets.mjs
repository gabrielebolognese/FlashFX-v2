// Acceptance harness for the B13 stylise presets (pure data). Bundles core/effects/stylizePresets.ts
// + the effect registry and asserts with node:assert that every preset references a REAL effect with
// the right param count, and that applyStylizePreset returns a safe deep clone. The effects themselves
// already render via existing IMAGE_SHADER cases; the one missing effect (vignette) is B13-gpu.
//   node scripts/verify-stylize-presets.mjs   (or: npm run verify:stylize-presets)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'stylize-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

async function bundle(entry, name) {
  const outfile = join(tmp, name);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}

try {
  const P = await bundle('src/core/effects/stylizePresets.ts', 'stylizePresets.mjs');
  const R = await bundle('src/core/effects/effectRegistry.ts', 'effectRegistry.mjs');
  const { STYLIZE_PRESETS, applyStylizePreset } = P;
  const { EFFECT_DEFS, getEffectDefByType } = R;
  const byType = new Map(EFFECT_DEFS.map((d) => [d.type, d]));

  check('at least 6 presets, each with a name/label and >=1 effect', () => {
    assert.ok(STYLIZE_PRESETS.length >= 6);
    for (const p of STYLIZE_PRESETS) {
      assert.ok(p.name && p.label, 'name+label');
      assert.ok(Array.isArray(p.effects) && p.effects.length >= 1, `${p.name} has effects`);
    }
    const names = STYLIZE_PRESETS.map((p) => p.name);
    assert.equal(new Set(names).size, names.length, 'names unique');
  });

  check('every preset effect references a REAL registry effect', () => {
    for (const p of STYLIZE_PRESETS) {
      for (const e of p.effects) {
        assert.ok(byType.has(e.type), `${p.name}: effect type ${e.type} exists in the registry`);
        assert.ok(getEffectDefByType(e.type), `${p.name}: getEffectDefByType(${e.type})`);
      }
    }
  });

  check('every preset effect has params matching the registry paramCount', () => {
    for (const p of STYLIZE_PRESETS) {
      for (const e of p.effects) {
        const def = byType.get(e.type);
        assert.equal(e.params.length, def.paramCount, `${p.name}/${def.id}: params ${e.params.length} == paramCount ${def.paramCount}`);
        for (const v of e.params) assert.ok(Number.isFinite(v), `${p.name}/${def.id}: finite param`);
        assert.equal(e.enabled, true);
      }
    }
  });

  check('applyStylizePreset returns a deep clone (mutation-safe)', () => {
    const p = STYLIZE_PRESETS[0];
    const a = applyStylizePreset(p);
    assert.notEqual(a, p.effects);
    assert.notEqual(a[0], p.effects[0]);
    assert.notEqual(a[0].params, p.effects[0].params);
    a[0].params[0] = 999; a[0].enabled = false;
    assert.notEqual(p.effects[0].params[0], 999, 'source params untouched');
    assert.equal(p.effects[0].enabled, true, 'source enabled untouched');
    // shape matches LayerEffect
    for (const e of a) { assert.equal(typeof e.type, 'number'); assert.equal(typeof e.enabled, 'boolean'); assert.ok(Array.isArray(e.params)); }
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ stylize-presets harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
