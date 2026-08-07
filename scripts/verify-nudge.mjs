// Acceptance harness for the pure arrow-key nudge core (core/nudge.ts).
// Run: node scripts/verify-nudge.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'nudge-verify-'));
const outfile = join(tmp, 'nudge.mjs');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

try {
  await build({ entryPoints: ['src/core/nudge.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { nudgeDelta } = await import(pathToFileURL(outfile).href);

  check('bare arrows → small nudge in the right direction (Y-down)', () => {
    assert.deepEqual(nudgeDelta('ArrowLeft', false, 1, 10), { dx: -1, dy: 0 });
    assert.deepEqual(nudgeDelta('ArrowRight', false, 1, 10), { dx: 1, dy: 0 });
    assert.deepEqual(nudgeDelta('ArrowUp', false, 1, 10), { dx: 0, dy: -1 });
    assert.deepEqual(nudgeDelta('ArrowDown', false, 1, 10), { dx: 0, dy: 1 });
  });
  check('Shift → big nudge', () => {
    assert.deepEqual(nudgeDelta('ArrowRight', true, 1, 10), { dx: 10, dy: 0 });
    assert.deepEqual(nudgeDelta('ArrowUp', true, 1, 10), { dx: 0, dy: -10 });
  });
  check('amounts are configurable', () => {
    assert.deepEqual(nudgeDelta('ArrowDown', false, 2, 20), { dx: 0, dy: 2 });
    assert.deepEqual(nudgeDelta('ArrowDown', true, 2, 20), { dx: 0, dy: 20 });
  });
  check('non-arrow keys → null', () => {
    assert.equal(nudgeDelta('Enter', false, 1, 10), null);
    assert.equal(nudgeDelta('a', true, 1, 10), null);
    assert.equal(nudgeDelta('ArrowLeftFoo', false, 1, 10), null);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
