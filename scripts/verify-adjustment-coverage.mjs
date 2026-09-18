// Acceptance harness for adjustment-layer coverage (B11b). Bundles the pure
// core/effects/adjustmentCoverage.ts and asserts with node:assert. The coverage (which content
// layers below each adjustment it affects, and whether it is a no-op) is fully verified here; the
// pixel apply-below composite (render layers-below to a texture, run the effect stack, blit back) is
// the browser-gated WebGPU pass wired in the renderer (B11b-gpu).
//   node scripts/verify-adjustment-coverage.mjs   (or: npm run verify:adjustment-coverage)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'adjcov-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

async function bundle(entry, name) {
  const outfile = join(tmp, name);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}

// helpers: content layer / adjustment layer refs (render order = array order, index 0 lowest)
const C = (id, active = true) => ({ id, isAdjustment: false, active });
const A = (id, { active = true, hasEffects = true } = {}) => ({ id, isAdjustment: true, active, hasEffects });

try {
  const M = await bundle('src/core/effects/adjustmentCoverage.ts', 'adjustmentCoverage.mjs');
  const { resolveAdjustmentCoverage, activeAdjustments, hasActiveAdjustments } = M;

  check('no adjustments → empty coverage (byte-identical rendering)', () => {
    const r = resolveAdjustmentCoverage([C('a'), C('b'), C('c')]);
    assert.deepEqual(r, []);
    assert.equal(hasActiveAdjustments(r), false);
  });

  check('one adjustment above two content layers covers both', () => {
    const r = resolveAdjustmentCoverage([C('a'), C('b'), A('adj')]);
    assert.equal(r.length, 1);
    assert.deepEqual(r[0].coveredLayerIds, ['a', 'b']);
    assert.equal(r[0].coveredCount, 2);
    assert.equal(r[0].index, 2);
    assert.equal(r[0].noOp, false);
    assert.equal(hasActiveAdjustments(r), true);
  });

  check('adjustment at the bottom (nothing below) is a no-op', () => {
    const r = resolveAdjustmentCoverage([A('adj'), C('a'), C('b')]);
    assert.deepEqual(r[0].coveredLayerIds, []);
    assert.equal(r[0].noOp, true);
    assert.deepEqual(activeAdjustments(r), []);
  });

  check('adjustment with no effects is a no-op even with content below', () => {
    const r = resolveAdjustmentCoverage([C('a'), A('adj', { hasEffects: false })]);
    assert.equal(r[0].coveredCount, 1);
    assert.equal(r[0].noOp, true);
  });

  check('inactive content is excluded from coverage', () => {
    const r = resolveAdjustmentCoverage([C('a'), C('b', false), C('c'), A('adj')]);
    assert.deepEqual(r[0].coveredLayerIds, ['a', 'c']);
  });

  check('two stacked adjustments: upper covers a superset (adjustments stack)', () => {
    // order: A, adj1, B, adj2
    const r = resolveAdjustmentCoverage([C('A'), A('adj1'), C('B'), A('adj2')]);
    assert.equal(r.length, 2);
    const adj1 = r.find((c) => c.adjustmentId === 'adj1');
    const adj2 = r.find((c) => c.adjustmentId === 'adj2');
    assert.deepEqual(adj1.coveredLayerIds, ['A']);            // only content below adj1
    assert.deepEqual(adj2.coveredLayerIds, ['A', 'B']);       // everything below adj2 (incl. below adj1)
    assert.equal(adj1.index, 1);
    assert.equal(adj2.index, 3);
  });

  check('inactive adjustment gets no coverage entry and does not disturb others', () => {
    const r = resolveAdjustmentCoverage([C('a'), A('off', { active: false }), C('b'), A('adj')]);
    assert.equal(r.length, 1);
    assert.equal(r[0].adjustmentId, 'adj');
    assert.deepEqual(r[0].coveredLayerIds, ['a', 'b']); // the inactive adjustment neither covers nor blocks
  });

  check('an adjustment never counts another adjustment as covered content', () => {
    const r = resolveAdjustmentCoverage([A('adj1'), A('adj2'), C('a')]);
    // adj1: nothing below → no-op; adj2: only adj1 below, which is not content → no-op
    assert.equal(r[0].noOp, true);
    assert.deepEqual(r[1].coveredLayerIds, []);
    assert.equal(r[1].noOp, true);
  });

  check('activeAdjustments / hasActiveAdjustments filter the no-ops', () => {
    const r = resolveAdjustmentCoverage([C('a'), A('real'), A('empty', { hasEffects: false })]);
    const live = activeAdjustments(r);
    assert.equal(live.length, 1);
    assert.equal(live[0].adjustmentId, 'real');
    assert.equal(hasActiveAdjustments(r), true);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ adjustment-coverage harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
