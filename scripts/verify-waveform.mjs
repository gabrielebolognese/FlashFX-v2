// Acceptance harness for the pure waveform-peak reducer (core/waveform.ts).
//
// Mirrors scripts/verify-pathops.mjs: bundles the REAL TypeScript with esbuild and
// asserts with node:assert. Proves the bucket math + that the strided read still
// captures the true [min,max] envelope. Run: node scripts/verify-waveform.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'waveform-verify-'));
const outfile = join(tmp, 'waveform.mjs');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

try {
  await build({ entryPoints: ['src/core/waveform.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { computeWaveformPeaks } = await import(pathToFileURL(outfile).href);

  check('constant signal → every bucket min == max == value', () => {
    const data = new Float32Array(4096).fill(0.5);
    const { peaks, samplesPerPeak, peakCount } = computeWaveformPeaks(data, 2048);
    assert.equal(samplesPerPeak, 2);
    assert.equal(peakCount, 2048);
    assert.equal(peaks.length, 4096);
    for (let i = 0; i < peakCount; i++) {
      assert.ok(near(peaks[i * 2], 0.5) && near(peaks[i * 2 + 1], 0.5));
    }
  });

  check('short signal (len < targetPeaks) → one sample per bucket, exact', () => {
    const data = Float32Array.from([0.1, -0.2, 0.3]);
    const { peaks, samplesPerPeak, peakCount } = computeWaveformPeaks(data, 2048);
    assert.equal(samplesPerPeak, 1);
    assert.equal(peakCount, 3);
    assert.deepEqual(Array.from(peaks).map((v) => Math.round(v * 10) / 10), [0.1, 0.1, -0.2, -0.2, 0.3, 0.3]);
  });

  check('two constant regions map to the right buckets', () => {
    const data = new Float32Array(4096);
    data.fill(0.8, 0, 2048);
    data.fill(-0.6, 2048, 4096);
    const { peaks } = computeWaveformPeaks(data, 2048); // samplesPerPeak = 2
    assert.ok(near(peaks[0], 0.8) && near(peaks[1], 0.8)); // bucket 0
    assert.ok(near(peaks[2047 * 2], -0.6) && near(peaks[2047 * 2 + 1], -0.6)); // last bucket
  });

  check('striding stays active on a large clip and keeps constant output', () => {
    // len 1.1M, targetPeaks 2048 → samplesPerPeak 537 (> 256) so stride > 1.
    const data = new Float32Array(1_100_000).fill(0.5);
    const { peaks, samplesPerPeak, peakCount } = computeWaveformPeaks(data, 2048);
    assert.ok(samplesPerPeak > 512, `samplesPerPeak ${samplesPerPeak}`);
    for (let i = 0; i < peakCount; i++) {
      assert.ok(near(peaks[i * 2], 0.5) && near(peaks[i * 2 + 1], 0.5));
    }
  });

  check('strided read still captures the ±envelope of an oscillating signal', () => {
    // Period-100 square wave (+0.9 / -0.9) over a large buffer → each bucket
    // spans multiple periods; strided sampling must still see both extremes.
    const data = new Float32Array(1_100_000);
    for (let j = 0; j < data.length; j++) data[j] = j % 100 < 50 ? 0.9 : -0.9;
    const { peaks, peakCount } = computeWaveformPeaks(data, 2048);
    for (let i = 0; i < peakCount; i++) {
      assert.ok(near(peaks[i * 2], -0.9, 1e-4), `bucket ${i} min ${peaks[i * 2]}`);
      assert.ok(near(peaks[i * 2 + 1], 0.9, 1e-4), `bucket ${i} max ${peaks[i * 2 + 1]}`);
    }
  });

  check('empty input is safe', () => {
    const { peaks, peakCount } = computeWaveformPeaks(new Float32Array(0), 2048);
    assert.equal(peakCount, 0);
    assert.equal(peaks.length, 0);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
