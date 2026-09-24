// Acceptance harness for the pure decode-cursor eviction decision (src/engine/video/cursorBudget.ts,
// PB5). Bundles the real TS with esbuild + asserts with node:assert. Run: node scripts/verify-cursor-budget.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'cursorbudget-verify-'));
const outfile = join(tmp, 'cursorBudget.mjs');

let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  [pass] ${name}`); }

try {
  await build({ entryPoints: ['src/engine/video/cursorBudget.ts'], outfile, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent' });
  const { cursorsToEvict } = await import(pathToFileURL(outfile).href);

  check('no eviction at or under budget', () => {
    assert.deepEqual(cursorsToEvict([5, 3, 9], 3), []);
    assert.deepEqual(cursorsToEvict([5, 3], 3), []);
    assert.deepEqual(cursorsToEvict([], 3), []);
  });

  check('evicts the least-recently-used (lowest lastSeq) beyond budget', () => {
    // seqs: idx0=50 idx1=10 idx2=90 idx3=30, budget 2 -> keep the 2 highest (90,50 = idx2,idx0),
    // evict idx1(10) + idx3(30); returned descending.
    assert.deepEqual(cursorsToEvict([50, 10, 90, 30], 2), [3, 1]);
  });

  check('returns indices DESCENDING so splicing a shared array is safe', () => {
    const r = cursorsToEvict([1, 2, 3, 4, 5], 1); // evict the 4 lowest (idx0..3), keep idx4(5)
    assert.deepEqual(r, [3, 2, 1, 0]);
    for (let k = 1; k < r.length; k++) assert.ok(r[k] < r[k - 1], 'must be strictly descending');
  });

  check('budget 0 evicts all; negative/NaN budget evicts none (fail-open)', () => {
    assert.deepEqual(cursorsToEvict([7, 2], 0), [1, 0]); // both, descending (idx1 seq2 first in LRU)
    assert.deepEqual(cursorsToEvict([7, 2], -1), []);
    assert.deepEqual(cursorsToEvict([7, 2], NaN), []);
  });

  check('stable ordering on equal lastSeq', () => {
    // all equal -> LRU order is input order; evict the first `excess` indices, returned descending.
    assert.deepEqual(cursorsToEvict([4, 4, 4, 4], 2), [1, 0]);
  });

  console.log(`\ncursor-budget: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
