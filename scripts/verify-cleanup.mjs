// Acceptance harness for the B29 footage-cleanup math (pure). Bundles core/cleanup/cleanup.ts and
// asserts with node:assert: box blur, edge-preserving surface blur (denoise/skin), frequency
// separation (lossless recombine + softening), temporal deflicker gains, and the soft ellipse mask
// field. The per-pixel bake, the browser FaceDetector, and video frame extraction are browser-only
// (B29-video).
//   node scripts/verify-cleanup.mjs   (or: npm run verify:cleanup)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'cleanup-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const sum = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; };
const variance = (a) => { const m = sum(a) / a.length; let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - m) ** 2; return s / a.length; };

try {
  const outfile = join(tmp, 'cleanup.mjs');
  await build({ entryPoints: ['src/core/cleanup/cleanup.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const M = await import(pathToFileURL(outfile).href);
  const { boxBlur1, surfaceBlur1, frequencySeparate, recombine, movingAverage, deflickerGains, ellipseMaskField } = M;

  check('boxBlur1: radius 0 identity; constant field unchanged; step -> intermediate; energy ~preserved', () => {
    const w = 11, h = 11;
    const flat = new Float32Array(w * h).fill(0.5);
    assert.deepEqual(Array.from(boxBlur1(flat, w, h, 0)), Array.from(flat), 'radius 0 identity');
    const b = boxBlur1(flat, w, h, 2);
    for (let i = 0; i < b.length; i++) assert.ok(near(b[i], 0.5, 1e-6), 'constant unchanged');
    const step = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) step[y * w + x] = x < 5 ? 0 : 1;
    const blurred = boxBlur1(step, w, h, 2);
    let inter = 0; for (let i = 0; i < blurred.length; i++) if (blurred[i] > 0.01 && blurred[i] < 0.99) inter++;
    assert.ok(inter > 0, 'step produces intermediate edge values');
    assert.ok(Math.abs(sum(blurred) - sum(step)) < sum(step) * 0.02, 'energy ~preserved');
  });

  check('surfaceBlur1: reduces within-threshold noise but PRESERVES a hard edge; radius/threshold 0 identity', () => {
    const w = 12, h = 12;
    // noisy flat field: 0.5 +/- 0.03 checker (noise well under threshold)
    const noisy = new Float32Array(w * h);
    for (let i = 0; i < noisy.length; i++) noisy[i] = 0.5 + ((i % 2) ? 0.03 : -0.03);
    const sm = surfaceBlur1(noisy, w, h, 2, 0.1);
    assert.ok(variance(sm) < variance(noisy) * 0.5, `noise variance drops (${variance(sm).toExponential(2)} << ${variance(noisy).toExponential(2)})`);
    // hard edge: left half 0.1, right half 0.9 (jump 0.8 >> threshold 0.1) must NOT blend
    const edge = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) edge[y * w + x] = x < 6 ? 0.1 : 0.9;
    const kept = surfaceBlur1(edge, w, h, 3, 0.1);
    for (let y = 0; y < h; y++) { assert.ok(near(kept[y * w + 5], 0.1, 1e-6), 'left edge pixel stays 0.1'); assert.ok(near(kept[y * w + 6], 0.9, 1e-6), 'right edge pixel stays 0.9'); }
    assert.deepEqual(Array.from(surfaceBlur1(noisy, w, h, 0, 0.1)), Array.from(noisy), 'radius 0 identity');
    assert.deepEqual(Array.from(surfaceBlur1(noisy, w, h, 2, 0)), Array.from(noisy), 'threshold 0 identity');
  });

  check('frequencySeparate + recombine: lossless at detail 1; high ~0 on a smooth region; detail<1 softens', () => {
    const w = 10, h = 10;
    const src = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) src[y * w + x] = 0.3 + 0.4 * (x / w) + ((x + y) % 2 ? 0.05 : -0.05); // gradient + fine texture
    const { low, high } = frequencySeparate(src, w, h, 2);
    const back = recombine(low, high, 1);
    for (let i = 0; i < src.length; i++) assert.ok(near(back[i], src[i], 1e-5), 'recombine(.,1) = src');
    const flat = new Float32Array(w * h).fill(0.4);
    const fb = frequencySeparate(flat, w, h, 2);
    assert.ok(Math.abs(sum(fb.high)) < 1e-5, 'high band ~0 on constant');
    const soft = recombine(low, high, 0.3);
    assert.ok(variance(soft) < variance(src), 'detail<1 reduces high-frequency variance');
  });

  check('deflickerGains: flat -> all 1; a dark frame gets a brightening gain; corrected series is smoother; strength 0 -> all 1', () => {
    const flat = [0.5, 0.5, 0.5, 0.5, 0.5];
    for (const g of deflickerGains(flat, 3, 1)) assert.ok(near(g, 1, 1e-6), 'flat luma -> gain 1');
    const flick = [0.5, 0.5, 0.2, 0.5, 0.5]; // one dark (flicker) frame
    const gains = deflickerGains(flick, 3, 1);
    assert.ok(gains[2] > 1.2, `dark frame brightened (gain ${gains[2].toFixed(2)})`);
    const corrected = flick.map((l, i) => l * gains[i]);
    assert.ok(variance(corrected) < variance(flick) * 0.5, 'corrected series much smoother');
    for (const g of deflickerGains(flick, 3, 0)) assert.ok(near(g, 1, 1e-9), 'strength 0 -> no correction');
    assert.deepEqual(movingAverage(flat, 3), flat, 'moving average of a flat series is itself');
  });

  check('ellipseMaskField: centre 1, far outside 0, monotonic falloff, symmetric', () => {
    const w = 41, h = 41;
    const m = ellipseMaskField(20, 20, 8, 12, w, h, 0.3);
    assert.ok(near(m[20 * w + 20], 1, 1e-6), 'centre = 1');
    assert.ok(near(m[0], 0, 1e-6), 'far corner = 0');
    // symmetric about the centre horizontally + vertically
    assert.ok(near(m[20 * w + 12], m[20 * w + 28], 1e-6), 'horizontally symmetric');
    assert.ok(near(m[12 * w + 20], m[28 * w + 20], 1e-6), 'vertically symmetric');
    // monotonic non-increasing moving out along +x from centre
    let prev = 2;
    for (let x = 20; x < w; x++) { const v = m[20 * w + x]; assert.ok(v <= prev + 1e-9, 'falloff non-increasing'); prev = v; }
  });

  check('determinism: identical inputs -> byte-identical outputs', () => {
    const s = new Float32Array([0.1, 0.9, 0.2, 0.8, 0.3, 0.7, 0.4, 0.6, 0.5]);
    assert.deepEqual(Array.from(surfaceBlur1(s, 3, 3, 1, 0.3)), Array.from(surfaceBlur1(s, 3, 3, 1, 0.3)), 'surfaceBlur1 stable');
    assert.deepEqual(deflickerGains([0.4, 0.6, 0.3], 3, 0.7), deflickerGains([0.4, 0.6, 0.3], 3, 0.7), 'deflickerGains stable');
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ cleanup harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
