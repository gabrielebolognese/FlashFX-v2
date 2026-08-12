// Acceptance harness for the per-unit range selector (src/text/rangeSelector.ts).
//
// No test runner in this repo (see CLAUDE.md); mirrors the scripts/*.mjs convention —
// bundle the REAL TypeScript with the installed esbuild, assert with node:assert. Run:
//   node scripts/verify-rangeselector.mjs   (or: npm run verify:rangeselector)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'rangeselector-verify-'));
const outfile = join(tmp, 'rangeselector.mjs');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const inRange = (arr, lo, hi) => arr.every((x) => x >= lo - 1e-9 && x <= hi + 1e-9);

try {
  await build({
    entryPoints: ['src/text/rangeSelector.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'silent',
  });
  const mod = await import(pathToFileURL(outfile).href);
  const { selectorWeights, selectorWeight, defaultRangeSelector } = mod;

  const cfg = (over = {}) => ({ ...defaultRangeSelector(), ...over });

  check('rampUp over full window is monotonic non-decreasing, 0→1', () => {
    const w = selectorWeights(10, cfg({ shape: 'rampUp' }));
    assert.equal(w.length, 10);
    assert.ok(near(w[0], 0), `first ${w[0]}`);
    assert.ok(near(w[9], 1), `last ${w[9]}`);
    for (let i = 1; i < w.length; i++) assert.ok(w[i] >= w[i - 1] - 1e-9, `mono at ${i}`);
    assert.ok(inRange(w, 0, 1));
  });

  check('rampDown is the mirror of rampUp', () => {
    const up = selectorWeights(8, cfg({ shape: 'rampUp' }));
    const dn = selectorWeights(8, cfg({ shape: 'rampDown' }));
    for (let i = 0; i < up.length; i++) assert.ok(near(up[i], dn[up.length - 1 - i]), `mirror ${i}`);
  });

  check('square is a hard step at the window edge (typewriter: on and held)', () => {
    // One-sided clamp-hold model: 0 before the window start, 1 from it onward. Bands are made
    // by composing two selectors (AE Mode: intersect), not by a single selector.
    const w = selectorWeights(10, cfg({ shape: 'square', start: 0.4, end: 0.6 }));
    assert.ok(near(w[0], 0), 'before window → 0');
    assert.ok(near(w[9], 1), 'past window → held on');
    assert.ok(w.some((x) => near(x, 0)) && w.some((x) => near(x, 1)), 'both states present');
    assert.ok(inRange(w, 0, 1));
  });

  check('triangle peaks in the middle, 0 at edges', () => {
    const w = selectorWeights(11, cfg({ shape: 'triangle' }));
    assert.ok(near(w[0], 0) && near(w[10], 0), 'edges 0');
    assert.ok(near(w[5], 1), `mid ${w[5]}`);
  });

  check('determinism: identical config → byte-identical arrays', () => {
    const a = selectorWeights(20, cfg({ randomizeOrder: true, seed: 42 }));
    const b = selectorWeights(20, cfg({ randomizeOrder: true, seed: 42 }));
    assert.deepEqual(a, b);
  });

  check('randomizeOrder is a permutation (same multiset, different order)', () => {
    const plain = selectorWeights(16, cfg({ shape: 'rampUp' }));
    const scattered = selectorWeights(16, cfg({ shape: 'rampUp', randomizeOrder: true, seed: 7 }));
    const sortNum = (arr) => [...arr].sort((x, y) => x - y);
    assert.deepEqual(sortNum(plain).map((x) => x.toFixed(9)), sortNum(scattered).map((x) => x.toFixed(9)), 'same multiset');
    assert.notDeepEqual(plain, scattered, 'order differs');
  });

  check('different seeds give different scatter', () => {
    const s7 = selectorWeights(16, cfg({ randomizeOrder: true, seed: 7 }));
    const s8 = selectorWeights(16, cfg({ randomizeOrder: true, seed: 8 }));
    assert.notDeepEqual(s7, s8);
  });

  check('offset shifts the window (an unselected unit becomes selected)', () => {
    // Square window high up so unit i4 (p≈0.444) is below it → 0. A negative offset slides the
    // window down past i4 → it steps to 1.
    const base = selectorWeights(10, cfg({ shape: 'square', start: 0.8, end: 1.0 }));
    const shifted = selectorWeights(10, cfg({ shape: 'square', start: 0.8, end: 1.0, offset: -0.6 }));
    assert.ok(near(base[4], 0), 'i4 unselected at offset 0');
    assert.ok(shifted[4] > base[4], 'i4 becomes selected after offset');
  });

  check('easeHigh/easeLow preserve endpoints and stay in range', () => {
    for (const [eh, el] of [[0.8, 0], [0, 0.8], [-0.8, -0.8], [1, -1]]) {
      const w = selectorWeights(12, cfg({ shape: 'rampUp', easeHigh: eh, easeLow: el }));
      assert.ok(near(w[0], 0, 1e-6), `low end ${w[0]} (${eh},${el})`);
      assert.ok(near(w[11], 1, 1e-6), `high end ${w[11]} (${eh},${el})`);
      assert.ok(inRange(w, 0, 1), `range (${eh},${el})`);
    }
  });

  check('amount scales and negative amount inverts sign', () => {
    const full = selectorWeights(10, cfg({ shape: 'rampUp', amount: 1 }));
    const half = selectorWeights(10, cfg({ shape: 'rampUp', amount: 0.5 }));
    const neg = selectorWeights(10, cfg({ shape: 'rampUp', amount: -1 }));
    for (let i = 0; i < full.length; i++) {
      assert.ok(near(half[i], full[i] * 0.5), `half ${i}`);
      assert.ok(near(neg[i], -full[i]), `neg ${i}`);
    }
    assert.ok(inRange(neg, -1, 0));
  });

  check('edge counts: 0 → empty, 1 → single at window start', () => {
    assert.deepEqual(selectorWeights(0, cfg()), []);
    const one = selectorWeights(1, cfg({ shape: 'rampUp' }));
    assert.equal(one.length, 1);
    assert.ok(one[0] >= 0 && one[0] <= 1);
  });

  check('selectorWeight(index) agrees with selectorWeights(...)[index]', () => {
    const c = cfg({ shape: 'smooth', randomizeOrder: true, seed: 3 });
    const all = selectorWeights(9, c);
    for (let i = 0; i < 9; i++) assert.ok(near(selectorWeight(i, 9, c), all[i]));
  });

  console.log(`\n✓ all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
