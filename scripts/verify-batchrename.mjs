// Acceptance harness for the batch-rename core (core/batchRename.ts).
// Run: node scripts/verify-batchrename.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'batchrename-verify-'));
const outfile = join(tmp, 'br.mjs');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const L = (id, name, type) => ({ id, name, type });
const names = (r) => r.results.map((x) => x.name);

try {
  await build({ entryPoints: ['src/core/batchRename.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { computeBatchNames } = await import(pathToFileURL(outfile).href);

  check('{name} passthrough leaves names unchanged', () => {
    const r = computeBatchNames([L('1', 'Alpha'), L('2', 'Beta')], { template: '{name}', startNumber: 1 });
    assert.deepEqual(names(r), ['Alpha', 'Beta']);
    assert.equal(r.regexError, false);
  });

  check('{name}_{n} numbers from start (auto-pad width 1)', () => {
    const r = computeBatchNames([L('1', 'A'), L('2', 'B'), L('3', 'C')], { template: '{name}_{n}', startNumber: 1 });
    assert.deepEqual(names(r), ['A_1', 'B_2', 'C_3']);
  });

  check('{n:3} zero-pads to width 3; bare {n} auto-pads to the run max', () => {
    const items = Array.from({ length: 12 }, (_, i) => L(String(i), 'x'));
    assert.deepEqual(names(computeBatchNames(items, { template: '{n:3}', startNumber: 1 })).slice(0, 2), ['001', '002']);
    assert.deepEqual(names(computeBatchNames(items, { template: '{n}', startNumber: 1 })).slice(0, 2), ['01', '02']); // auto-pad to 2 (max 12)
  });

  check('startNumber respected', () => {
    const r = computeBatchNames([L('1', 'A'), L('2', 'B'), L('3', 'C')], { template: '{n}', startNumber: 5 });
    assert.deepEqual(names(r), ['5', '6', '7']);
  });

  check('descending counts down in array order', () => {
    const r = computeBatchNames([L('1', 'A'), L('2', 'B'), L('3', 'C')], { template: '{n}', startNumber: 3, descending: true });
    assert.deepEqual(names(r), ['3', '2', '1']);
  });

  check('regex find/replace: strip prefix; capture-group swap', () => {
    const strip = computeBatchNames([L('1', 'Layer A'), L('2', 'Layer B')], { template: '{name}', startNumber: 1, find: '^Layer ', replace: '' });
    assert.deepEqual(names(strip), ['A', 'B']);
    const swap = computeBatchNames([L('1', 'btn_12')], { template: '{name}', startNumber: 1, find: '([a-z]+)_(\\d+)', replace: '$2_$1' });
    assert.deepEqual(names(swap), ['12_btn']);
  });

  check('regex runs BEFORE tokens: strip then number', () => {
    const r = computeBatchNames([L('1', 'Icon Home'), L('2', 'Icon Cart')], { template: '{name}_{n}', startNumber: 1, find: '^Icon ', replace: '' });
    assert.deepEqual(names(r), ['Home_1', 'Cart_2']);
  });

  check('invalid regex → regexError, no throw, templated raw names', () => {
    const r = computeBatchNames([L('1', 'A'), L('2', 'B')], { template: '{name}_{n}', startNumber: 1, find: '(' });
    assert.equal(r.regexError, true);
    assert.deepEqual(names(r), ['A_1', 'B_2']); // regex skipped, still valid
  });

  check('empty final name falls back to original', () => {
    const r = computeBatchNames([L('1', 'Keep')], { template: '', startNumber: 1 });
    assert.deepEqual(names(r), ['Keep']);
    const r2 = computeBatchNames([L('1', 'Keep')], { template: '{name}', startNumber: 1, find: '.*', replace: '' });
    assert.deepEqual(names(r2), ['Keep']); // regex emptied name → fallback
  });

  check('{type} token expands from input.type', () => {
    const r = computeBatchNames([L('1', 'A', 'shape'), L('2', 'B', 'text')], { template: '{type}_{n}', startNumber: 1 });
    assert.deepEqual(names(r), ['shape_1', 'text_2']);
  });

  check('unknown token left literal', () => {
    const r = computeBatchNames([L('1', 'A')], { template: '{bogus}-{name}', startNumber: 1 });
    assert.deepEqual(names(r), ['{bogus}-A']);
  });

  check('deterministic', () => {
    const p = { template: '{name}_{n:2}', startNumber: 3, find: 'a', replace: 'X' };
    const items = [L('1', 'ba'), L('2', 'ca')];
    assert.deepEqual(computeBatchNames(items, p), computeBatchNames(items, p));
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
