// Acceptance harness for the pure beat/tempo detector (core/beatDetection.ts).
//
// Mirrors scripts/verify-pathops.mjs: bundles the REAL TypeScript with esbuild and
// asserts with node:assert. Synthesizes click tracks at known tempos and checks the
// detected BPM + onset count — a real proof despite no audio hardware.
// Run: node scripts/verify-beats.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'beats-verify-'));
const outfile = join(tmp, 'beats.mjs');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// Build a click track: an impulse (10 ms burst) every 60/bpm seconds.
function clickTrack(bpm, durationSec, sampleRate = 44100) {
  const n = Math.floor(durationSec * sampleRate);
  const s = new Float32Array(n);
  const interval = Math.round((60 / bpm) * sampleRate);
  const burst = Math.round(0.01 * sampleRate); // 10 ms
  let count = 0;
  for (let t = 0; t < n; t += interval) {
    for (let i = 0; i < burst && t + i < n; i++) s[t + i] = 0.9;
    count++;
  }
  return { samples: s, sampleRate, count };
}

try {
  await build({ entryPoints: ['src/core/beatDetection.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { detectBeats, estimateBpm } = await import(pathToFileURL(outfile).href);

  check('120 BPM click track → ~120 BPM', () => {
    const { samples, sampleRate, count } = clickTrack(120, 8);
    const r = detectBeats(samples, sampleRate);
    assert.ok(Math.abs(r.bpm - 120) <= 2, `got ${r.bpm}`);
    assert.ok(Math.abs(r.beats.length - count) <= 2, `beats ${r.beats.length} vs ${count}`);
  });

  check('100 BPM click track → ~100 BPM', () => {
    const { samples, sampleRate } = clickTrack(100, 9);
    const r = detectBeats(samples, sampleRate);
    assert.ok(Math.abs(r.bpm - 100) <= 2, `got ${r.bpm}`);
  });

  check('90 BPM click track → ~90 BPM', () => {
    const { samples, sampleRate } = clickTrack(90, 10);
    const r = detectBeats(samples, sampleRate);
    assert.ok(Math.abs(r.bpm - 90) <= 2, `got ${r.bpm}`);
  });

  check('onset times land near the true click times', () => {
    const bpm = 120;
    const { samples, sampleRate } = clickTrack(bpm, 6);
    const r = detectBeats(samples, sampleRate);
    const period = 60 / bpm;
    // Every detected onset should sit within ~30 ms of a click multiple.
    for (const t of r.beats) {
      const nearest = Math.round(t / period) * period;
      assert.ok(Math.abs(t - nearest) <= 0.03, `onset ${t} off grid`);
    }
  });

  check('estimateBpm on exact 0.5s onsets = 120', () => {
    const onsets = Array.from({ length: 16 }, (_, i) => i * 0.5);
    assert.equal(estimateBpm(onsets), 120);
  });

  check('estimateBpm octave-folds a slow pulse into range', () => {
    // 40 BPM (1.5s spacing) folds up into [60,200) → 80.
    const onsets = Array.from({ length: 12 }, (_, i) => i * 1.5);
    assert.equal(estimateBpm(onsets), 80);
  });

  check('empty / too-short input is safe', () => {
    assert.deepEqual(detectBeats(new Float32Array(0), 44100), { beats: [], bpm: 0 });
    assert.equal(estimateBpm([1]), 0);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
