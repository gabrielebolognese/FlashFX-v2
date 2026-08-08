// Acceptance harness for the shared-styles core (core/styles.ts).
// Run: node scripts/verify-styles.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'styles-verify-'));
const outfile = join(tmp, 's.mjs');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

const colorStyle = (id, c) => ({ id, name: id, type: 'color', value: { kind: 'color', color: c } });

try {
  await build({ entryPoints: ['src/core/styles.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { resolveStyleColor, detachStyleValue } = await import(pathToFileURL(outfile).href);

  const raw = [1, 0, 0, 1];
  const styles = { brandBlue: colorStyle('brandBlue', [0, 0.4, 1, 1]) };
  const get = (id) => styles[id];

  check('unlinked (no styleId) → raw value', () => {
    assert.deepEqual(resolveStyleColor(undefined, raw, get), raw);
  });

  check('linked → the style color', () => {
    assert.deepEqual(resolveStyleColor('brandBlue', raw, get), [0, 0.4, 1, 1]);
  });

  check('edit-once-update-everywhere: editing the style changes the lookup for all referents', () => {
    styles.brandBlue.value.color = [0, 1, 0, 1];
    assert.deepEqual(resolveStyleColor('brandBlue', [9, 9, 9, 9], get), [0, 1, 0, 1]);
    assert.deepEqual(resolveStyleColor('brandBlue', [8, 8, 8, 8], get), [0, 1, 0, 1]); // a second referent
    styles.brandBlue.value.color = [0, 0.4, 1, 1]; // restore
  });

  check('dangling styleId → falls back to raw', () => {
    assert.deepEqual(resolveStyleColor('ghost', raw, get), raw);
  });

  check('wrong-type style (text style on a color slot) → falls back to raw', () => {
    const bad = { id: 't', name: 't', type: 'text', value: { kind: 'text', text: { fontSize: 20 } } };
    assert.deepEqual(resolveStyleColor('t', raw, (id) => (id === 't' ? bad : undefined)), raw);
  });

  check('no getStyle provided → raw', () => {
    assert.deepEqual(resolveStyleColor('brandBlue', raw), raw);
  });

  check('detachStyleValue bakes the linked style value (else raw)', () => {
    assert.deepEqual(detachStyleValue('brandBlue', raw, get), [0, 0.4, 1, 1]);
    assert.deepEqual(detachStyleValue(undefined, raw, get), raw);
    assert.deepEqual(detachStyleValue('ghost', raw, get), raw);
  });

  check('returns a fresh array (no shared reference / no -0)', () => {
    const r = resolveStyleColor('brandBlue', raw, get);
    assert.notEqual(r, styles.brandBlue.value.color); // copy, not the style's own array
    for (const n of r) assert.ok(!Object.is(n, -0));
  });

  check('deterministic', () => {
    assert.deepEqual(resolveStyleColor('brandBlue', raw, get), resolveStyleColor('brandBlue', raw, get));
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
