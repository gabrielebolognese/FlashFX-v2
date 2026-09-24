// Proves findSegmentIndex (binary search) is BYTE-IDENTICAL to the old linear segment scan it replaced
// in evalScalarKeyframes / evaluateProperty (frame-purity is non-negotiable). Bundles the real TS with
// esbuild and fuzzes many keyframe arrays x frames against the linear reference. Run: node scripts/verify-keyframe-search.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'kfsearch-verify-'));
const outfile = join(tmp, 'separateDimensions.mjs');

// The exact linear scan that used to live in both call sites (the reference implementation).
function linearRef(keyframes, frame) {
  let ans = 0;
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (frame >= keyframes[i].frame && frame <= keyframes[i + 1].frame) { ans = i; break; }
  }
  return ans;
}

// Deterministic LCG so the fuzz is reproducible (no Math.random flakiness).
let seed = 123456789;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

try {
  await build({ entryPoints: ['src/core/separateDimensions.ts'], outfile, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent' });
  const { findSegmentIndex } = await import(pathToFileURL(outfile).href);

  // Build a strictly-increasing keyframe array of length n.
  const makeKf = (n) => {
    const out = [];
    let f = Math.floor(rnd() * 5);
    for (let i = 0; i < n; i++) { out.push({ frame: f }); f += 1 + Math.floor(rnd() * 9); }
    return out;
  };

  check('matches the linear scan for interior frames (exact keys, midpoints, randoms)', () => {
    let cases = 0;
    for (let trial = 0; trial < 4000; trial++) {
      const n = 2 + Math.floor(rnd() * 30);
      const kf = makeKf(n);
      const first = kf[0].frame, last = kf[n - 1].frame;
      const probes = [];
      // exact interior keyframes
      for (let i = 1; i < n - 1; i++) probes.push(kf[i].frame);
      // midpoints between consecutive keys
      for (let i = 0; i < n - 1; i++) if (kf[i + 1].frame - kf[i].frame > 1) probes.push((kf[i].frame + kf[i + 1].frame) / 2);
      // random interior reals
      for (let k = 0; k < 5; k++) probes.push(first + rnd() * (last - first));
      for (const frame of probes) {
        if (frame <= first || frame >= last) continue; // callers handle the ends
        assert.equal(findSegmentIndex(kf, frame), linearRef(kf, frame), `n=${n} frame=${frame}`);
        cases++;
      }
    }
    assert.ok(cases > 20000, `expected many cases, got ${cases}`);
  });

  check('two-keyframe array: only segment 0', () => {
    const kf = [{ frame: 10 }, { frame: 20 }];
    for (const frame of [11, 15, 19, 12.5]) assert.equal(findSegmentIndex(kf, frame), 0);
  });

  check('picks the segment ENDING at an exact interior keyframe (matches first-match linear scan)', () => {
    const kf = [{ frame: 0 }, { frame: 10 }, { frame: 20 }, { frame: 30 }];
    assert.equal(findSegmentIndex(kf, 10), linearRef(kf, 10)); // -> 0 (segment [0,10])
    assert.equal(findSegmentIndex(kf, 20), linearRef(kf, 20)); // -> 1 (segment [10,20])
    assert.equal(findSegmentIndex(kf, 10), 0);
    assert.equal(findSegmentIndex(kf, 20), 1);
  });

  console.log(`\nkeyframe-search: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
