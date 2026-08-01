// Acceptance harness for the pure scene-cut detector (core/sceneDetection.ts).
//
// Mirrors scripts/verify-pathops.mjs: bundles the REAL TypeScript with esbuild and
// asserts with node:assert. Builds solid-color synthetic frames with known
// histogram distances — a real proof of the cut logic despite no video decode.
// Run: node scripts/verify-scenes.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'scenes-verify-'));
const outfile = join(tmp, 'scenes.mjs');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

// A solid-color RGBA frame (px pixels).
function solid(r, g, b, px = 256) {
  const a = new Uint8ClampedArray(px * 4);
  for (let i = 0; i < px; i++) {
    a[i * 4] = r; a[i * 4 + 1] = g; a[i * 4 + 2] = b; a[i * 4 + 3] = 255;
  }
  return a;
}

try {
  await build({ entryPoints: ['src/core/sceneDetection.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { computeColorHistogram, histogramDistance, detectCutIndices } = await import(pathToFileURL(outfile).href);

  const red = computeColorHistogram(solid(255, 0, 0));
  const blue = computeColorHistogram(solid(0, 0, 255));
  const green = computeColorHistogram(solid(0, 255, 0));

  check('histogram is normalized to sum 1', () => {
    let s = 0;
    for (const v of red) s += v;
    assert.ok(near(s, 1), `sum ${s}`);
  });

  check('identical frames → distance 0', () => {
    assert.equal(histogramDistance(red, computeColorHistogram(solid(255, 0, 0))), 0);
  });

  check('red vs blue → distance ≈ 0.667 (a cut)', () => {
    const d = histogramDistance(red, blue);
    assert.ok(near(d, 2 / 3, 0.02), `got ${d}`);
    assert.ok(d >= 0.4);
  });

  check('red vs green → also a large distance', () => {
    assert.ok(histogramDistance(red, green) >= 0.4);
  });

  check('one-bin channel shift stays below threshold (no false cut)', () => {
    // G: bin 0 → bin 1 only. TV distance = 1/3 ≈ 0.333 < 0.4.
    const d = histogramDistance(red, computeColorHistogram(solid(255, 40, 0)));
    assert.ok(near(d, 1 / 3, 0.02), `got ${d}`);
    assert.ok(d < 0.4);
  });

  check('detectCutIndices flags shot boundaries', () => {
    const seq = [red, red, blue, blue, green, red];
    // cuts begin at index 2 (blue), 4 (green), 5 (red).
    assert.deepEqual(detectCutIndices(seq, 0.4), [2, 4, 5]);
  });

  check('no cuts within a single steady shot', () => {
    const seq = [red, red, red, red];
    assert.deepEqual(detectCutIndices(seq, 0.4), []);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
