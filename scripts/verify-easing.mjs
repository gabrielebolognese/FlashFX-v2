// Acceptance harness for the temporal easing engine (Category 1: Keyframing & Easing).
//
// No test runner in this repo (see CLAUDE.md) — this mirrors the scripts/*.mjs convention: bundle
// the REAL TypeScript with the installed esbuild and assert with node:assert. It covers the pure
// leaf modules only (core/easings.ts + core/keyframeEase.ts) — deliberately NOT interpolation.ts,
// which pulls in the browser-only expression Worker at import.
//   node scripts/verify-easing.mjs   (or: npm run verify:easing)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'easing-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

async function bundle(entry, name) {
  const outfile = join(tmp, name);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}

try {
  const E = await bundle('src/core/easings.ts', 'easings.mjs');
  const K = await bundle('src/core/keyframeEase.ts', 'keyframeEase.mjs');
  const { EASINGS, applyEasing, cubicBezier, springProgress } = E;
  const { segmentProgress } = K;

  const NAMES = Object.keys(EASINGS);
  const sample = (fn, n = 101) => Array.from({ length: n }, (_, i) => fn(i / (n - 1)));

  // --- boundary conditions: every ease starts at 0 and ends at 1 ---
  check(`all ${NAMES.length} eases: f(0)=0 and f(1)=1`, () => {
    for (const name of NAMES) {
      assert.ok(near(EASINGS[name](0), 0), `${name}(0) should be 0, got ${EASINGS[name](0)}`);
      assert.ok(near(EASINGS[name](1), 1), `${name}(1) should be 1, got ${EASINGS[name](1)}`);
    }
  });

  check('all eases return finite values across the domain', () => {
    for (const name of NAMES) {
      for (const v of sample(EASINGS[name])) assert.ok(Number.isFinite(v), `${name} produced non-finite ${v}`);
    }
  });

  // --- named-ease characteristics (what makes them "premium") ---
  check('backOut overshoots ABOVE 1 (the pop past target)', () => {
    assert.ok(Math.max(...sample(EASINGS.backOut)) > 1.05);
  });
  check('backIn dips BELOW 0 (the wind-up)', () => {
    assert.ok(Math.min(...sample(EASINGS.backIn)) < -0.05);
  });
  check('elasticOut oscillates past 1 (springy overshoot)', () => {
    assert.ok(Math.max(...sample(EASINGS.elasticOut)) > 1.05);
  });
  check('elasticIn oscillates below 0', () => {
    assert.ok(Math.min(...sample(EASINGS.elasticIn)) < -0.05);
  });
  check('bounceOut stays within [0,1] and is non-monotonic (decaying rebounds)', () => {
    const s = sample(EASINGS.bounceOut, 200);
    assert.ok(Math.max(...s) <= 1 + 1e-9 && Math.min(...s) >= -1e-9, 'bounce must not exceed [0,1]');
    let decreases = 0;
    for (let i = 1; i < s.length; i++) if (s[i] < s[i - 1] - 1e-6) decreases++;
    assert.ok(decreases > 0, 'bounceOut should have downward rebounds');
  });

  // --- monotonic smooth eases (no overshoot) ---
  check('smooth in/out eases are monotonic non-decreasing', () => {
    for (const name of ['quadInOut', 'cubicInOut', 'sineInOut', 'expoInOut', 'quintOut', 'circInOut', 'quadIn']) {
      const s = sample(EASINGS[name], 200);
      for (let i = 1; i < s.length; i++) assert.ok(s[i] >= s[i - 1] - 1e-6, `${name} not monotonic at ${i}`);
    }
  });

  check('sineIn is slower-than-linear early, sineOut faster-than-linear early', () => {
    assert.ok(EASINGS.sineIn(0.25) < 0.25, 'ease-in lags linear at the start');
    assert.ok(EASINGS.sineOut(0.25) > 0.25, 'ease-out leads linear at the start');
  });

  // --- applyEasing: clamps input, falls back to linear for unknown names ---
  check('applyEasing clamps t to [0,1]', () => {
    assert.ok(near(applyEasing('quadOut', 2), EASINGS.quadOut(1)));
    assert.ok(near(applyEasing('quadOut', -1), EASINGS.quadOut(0)));
  });
  check('applyEasing unknown/undefined name → linear (never throws)', () => {
    assert.ok(near(applyEasing('nope', 0.5), 0.5));
    assert.ok(near(applyEasing(undefined, 0.37), 0.37));
  });

  // --- cubicBezier solver ---
  check('cubicBezier diagonal control points ≈ identity', () => {
    for (const t of [0, 0.2, 0.5, 0.8, 1]) assert.ok(near(cubicBezier(t, 0.25, 0.25, 0.75, 0.75), t, 1e-4));
  });
  check('cubicBezier endpoints are exact (0→0, 1→1)', () => {
    assert.ok(near(cubicBezier(0, 0.42, 0, 0.58, 1), 0));
    assert.ok(near(cubicBezier(1, 0.42, 0, 0.58, 1), 1));
  });

  check('springProgress settles to ~1 by t=1', () => {
    assert.ok(near(springProgress(1), 1, 0.05));
  });

  // --- segmentProgress: the render/graph single source of truth ---
  const kf = (o) => ({ frame: 0, value: 0, interpolation: 'linear', handleIn: [0, 0], handleOut: [0, 0], ...o });

  check('REGRESSION: bezier segment uses prev.handleOut + NEXT.handleIn (not prev.handleIn)', () => {
    const prev = kf({ interpolation: 'bezier', handleOut: [0.42, 0], handleIn: [0.9, 0.9] }); // handleIn must be IGNORED
    const next = kf({ handleIn: [0.58, 1] });
    for (const t of [0.25, 0.5, 0.75]) {
      const got = segmentProgress(t, prev, next);
      const correct = cubicBezier(t, 0.42, 0, 0.58, 1);   // prev.out + next.in  ✓
      const buggy = cubicBezier(t, 0.42, 0, 0.9, 0.9);    // prev.out + prev.in  ✗ (the old bug)
      assert.ok(near(got, correct, 1e-9), `t=${t}: expected ${correct}, got ${got}`);
      assert.ok(!near(got, buggy, 1e-3), `t=${t}: still using the buggy prev.handleIn`);
    }
  });

  check('segmentProgress hold → 0 (value stays on prev)', () => {
    const prev = kf({ interpolation: 'hold' });
    const next = kf({ frame: 10, value: 100 });
    for (const t of [0, 0.5, 0.99]) assert.equal(segmentProgress(t, prev, next), 0);
  });

  check('segmentProgress linear → t', () => {
    const prev = kf({ interpolation: 'linear' });
    const next = kf({ frame: 10 });
    for (const t of [0, 0.3, 0.7, 1]) assert.ok(near(segmentProgress(t, prev, next), t));
  });

  check('segmentProgress named easing overrides the bezier handles', () => {
    const prev = kf({ interpolation: 'bezier', easing: 'bounceOut', handleOut: [0.42, 0], handleIn: [0.9, 0.9] });
    const next = kf({ frame: 10, handleIn: [0.58, 1] });
    for (const t of [0.2, 0.5, 0.8]) {
      assert.ok(near(segmentProgress(t, prev, next), EASINGS.bounceOut(t), 1e-9), `named ease not applied at ${t}`);
    }
  });

  check('segmentProgress spring type uses springProgress', () => {
    const prev = kf({ interpolation: 'spring' });
    const next = kf({ frame: 10 });
    for (const t of [0.2, 0.5, 0.8]) assert.ok(near(segmentProgress(t, prev, next), springProgress(t)));
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ easing harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
