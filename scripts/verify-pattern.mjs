// Acceptance harness for the procedural pattern engine (Phase 1, pure parts).
// Proves the field math is finite/bounded/deterministic, presets parse, and a generativePattern layer
// survives the validation whitelist round-trip (the strip-guard). The GPU/CPU RENDER is browser-only.
//   node scripts/verify-pattern.mjs   (or: npm run verify:pattern)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'pattern-verify-'));
const outfile = join(tmp, 'bundle.mjs');
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

try {
  await build({
    stdin: {
      contents: `
        export { patternValue, samplePalette } from './src/patterns/patterns';
        export { parsePatternConfig, serializePatternConfig } from './src/patterns/config';
        export { PATTERN_PRESETS, DEFAULT_PATTERN } from './src/patterns/presets';
        export { PATTERN_TYPES } from './src/patterns/types';
        export { createGenerativePatternLayer } from './src/core/factory';
        export { validateComposition } from './src/project-system/services/validation';
      `,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  const m = await import(pathToFileURL(outfile).href);
  const { patternValue, samplePalette, parsePatternConfig, serializePatternConfig, PATTERN_PRESETS, DEFAULT_PATTERN, PATTERN_TYPES, createGenerativePatternLayer, validateComposition } = m;

  console.log('Procedural pattern engine — acceptance\n');

  check('parse: bad/empty JSON falls back to a complete default config', () => {
    for (const bad of ['', '{bad', 'null', '42']) {
      const c = parsePatternConfig(bad);
      assert.ok(PATTERN_TYPES.includes(c.type));
      assert.ok(Array.isArray(c.palette) && c.palette.length >= 2);
      assert.ok(Number.isFinite(c.scale) && Number.isFinite(c.speed));
    }
  });

  check('parse: a serialized config round-trips', () => {
    for (const p of PATTERN_PRESETS) {
      const c = parsePatternConfig(serializePatternConfig(p.config));
      assert.equal(c.type, p.config.type);
      assert.equal(c.palette.length, p.config.palette.length);
    }
  });

  for (const type of PATTERN_TYPES) {
    check(`${type}: field is finite and in [0,1] across the frame + over time`, () => {
      const cfg = { ...DEFAULT_PATTERN, type };
      for (const t of [0, 0.7, 3.4, 12.1]) {
        for (let i = 0; i < 60; i++) {
          const u = (i % 10) / 9, v = Math.floor(i / 10) / 9;
          const val = patternValue(cfg, u, v, 1.777, t);
          assert.ok(Number.isFinite(val), `finite @ ${type}`);
          assert.ok(val >= 0 && val <= 1, `bounded @ ${type}: ${val}`);
        }
      }
    });
  }

  check('field is deterministic (same inputs → same output)', () => {
    for (const type of PATTERN_TYPES) {
      const cfg = { ...DEFAULT_PATTERN, type };
      assert.equal(patternValue(cfg, 0.31, 0.72, 1.6, 2.5), patternValue(cfg, 0.31, 0.72, 1.6, 2.5));
    }
  });

  check('palette sampling returns valid rgb and honours the endpoints', () => {
    const stops = DEFAULT_PATTERN.palette;
    for (const v of [0, 0.25, 0.5, 0.9, 1]) {
      const c = samplePalette(stops, v, true);
      assert.equal(c.length, 3);
      for (const ch of c) assert.ok(Number.isFinite(ch) && ch >= 0 && ch <= 1);
    }
    assert.deepEqual(samplePalette(stops, -1, false), stops[0].color);
    assert.deepEqual(samplePalette(stops, 2, false), stops[stops.length - 1].color);
  });

  check('generativePattern layer survives the validation whitelist round-trip', () => {
    const layer = createGenerativePatternLayer('Pattern 1', 960, 540, serializePatternConfig(DEFAULT_PATTERN), 90);
    const validated = validateComposition({ layers: [layer] });
    assert.equal(validated.layers.length, 1, 'layer not stripped');
    const out = validated.layers[0];
    assert.equal(out.type, 'generativePattern');
    assert.equal(out.generativePattern.configJSON, layer.generativePattern.configJSON, 'config preserved');
  });

  console.log(`\n✅ ${passed} checks passed`);
} catch (err) {
  console.error('\n❌ verification failed:\n', err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
