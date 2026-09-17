// Acceptance harness for the pure effect-stack helpers (B11a). Bundles core/effects/effectStack.ts
// and asserts with node:assert. Covers the ordered resolve (master switch + per-effect enable), the
// preset deep-clone, and the sanitizer. The GPU that draws the effects is unchanged.
//   node scripts/verify-effects.mjs   (or: npm run verify:effects)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'effects-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

async function bundle(entry, name) {
  const outfile = join(tmp, name);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}

const fx = (type, enabled, params) => ({ type, enabled, params });

try {
  const M = await bundle('src/core/effects/effectStack.ts', 'effectStack.mjs');
  const { resolveEffectStack, cloneEffectStack, sanitizeEffectStack } = M;

  check('resolve: preserves stack order and drops the enabled flag', () => {
    const r = resolveEffectStack([fx(100, true, [1]), fx(200, true, [2, 3]), fx(150, true, [])], true);
    assert.deepEqual(r, [{ type: 100, params: [1] }, { type: 200, params: [2, 3] }, { type: 150, params: [] }]);
  });

  check('resolve: per-effect enabled=false is skipped', () => {
    const r = resolveEffectStack([fx(100, true, [1]), fx(200, false, [2]), fx(150, true, [3])], true);
    assert.deepEqual(r.map((e) => e.type), [100, 150]);
  });

  check('resolve: master switch off disables the whole stack (B11a fix)', () => {
    assert.deepEqual(resolveEffectStack([fx(100, true, [1]), fx(200, true, [2])], false), []);
  });

  check('resolve: absent/empty stack → empty', () => {
    assert.deepEqual(resolveEffectStack(undefined, true), []);
    assert.deepEqual(resolveEffectStack([], true), []);
  });

  check('resolve: params are copied, not shared (mutating input never leaks)', () => {
    const src = [fx(100, true, [1, 2])];
    const r = resolveEffectStack(src, true);
    src[0].params[0] = 999;
    assert.deepEqual(r[0].params, [1, 2]);
  });

  check('clone: deep copy — independent arrays, enabled coerced from undefined', () => {
    const src = [{ type: 100, params: [1] }, fx(200, false, [2, 3])];
    const c = cloneEffectStack(src);
    assert.deepEqual(c, [{ type: 100, enabled: true, params: [1] }, { type: 200, enabled: false, params: [2, 3] }]);
    c[0].params[0] = 5;
    assert.deepEqual(src[0].params, [1], 'source untouched');
  });

  check('sanitize: keeps well-formed effects, drops garbage, clamps params to 7', () => {
    const raw = [
      fx(100, true, [1, 2]),
      { type: 'nope', params: [1] },       // bad type
      { params: [1] },                     // missing type
      { type: 200, params: [1, 2, 3, 4, 5, 6, 7, 8, 9] }, // clamp to 7
      { type: 300 },                       // missing params → []
      null, 42, 'x',                       // junk
    ];
    const s = sanitizeEffectStack(raw);
    assert.equal(s.length, 3);
    assert.deepEqual(s[0], { type: 100, enabled: true, params: [1, 2] });
    assert.equal(s[1].params.length, 7);
    assert.deepEqual(s[2], { type: 300, enabled: true, params: [] });
  });

  check('sanitize: non-array → []', () => {
    assert.deepEqual(sanitizeEffectStack(null), []);
    assert.deepEqual(sanitizeEffectStack({ type: 100 }), []);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ effects harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
