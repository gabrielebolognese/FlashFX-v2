// Acceptance harness for the pre-flight export memory guard (src/codec/exportMemory.ts).
// No test runner in this repo (see CLAUDE.md); this bundles the REAL TS with the installed
// esbuild and asserts with node:assert. Run: node scripts/verify-export-memory.mjs
//   (or: npm run verify:export-memory)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'exportmem-verify-'));
const outfile = join(tmp, 'exportMemory.mjs');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

try {
  await build({
    entryPoints: ['src/codec/exportMemory.ts'],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    logLevel: 'silent',
  });
  const mod = await import(pathToFileURL(outfile).href);
  const { estimateExportMemoryBytes, encodedVideoBytes, maxSingleBufferBytes, classifyExportMemory } = mod;

  const V = (o) => ({ includeAudio: true, hasVideo: true, ...o });
  const p1080 = V({ width: 1920, height: 1080, frameRate: 30, durationFrames: 1800, bitrate: 10_000_000 });
  const p4k = V({ width: 3840, height: 2160, frameRate: 60, durationFrames: 7200, bitrate: 20_000_000 });

  // --- Formula: exact byte totals (pins the constants) ---
  check('encodedVideoBytes(1080p/30/60s/10Mbps) = 75MB', () => {
    assert.strictEqual(encodedVideoBytes(p1080), 75_000_000);
  });
  check('estimateExportMemoryBytes(1080p case) = 919,814,976', () => {
    assert.strictEqual(estimateExportMemoryBytes(p1080), 919_814_976);
  });
  check('estimateExportMemoryBytes(4K case) = 1,818,360,576', () => {
    assert.strictEqual(estimateExportMemoryBytes(p4k), 1_818_360_576);
  });

  // --- Each term drops exactly when its input is off ---
  check('includeAudio:false drops only the audio term', () => {
    const withAudio = estimateExportMemoryBytes(p1080);
    const noAudio = estimateExportMemoryBytes({ ...p1080, includeAudio: false });
    // audio term for 60s = 2*4*48000*60 + 192000*60/8 = 24,480,000
    assert.strictEqual(withAudio - noAudio, 24_480_000);
  });
  check('hasVideo:false drops exactly the 512MB frame cache', () => {
    const withVideo = estimateExportMemoryBytes(p1080);
    const noVideo = estimateExportMemoryBytes({ ...p1080, hasVideo: false });
    assert.strictEqual(withVideo - noVideo, 512 * 1024 * 1024);
  });

  // --- Threshold verdicts (pinned) ---
  check("classifyExportMemory(1080p, 8GB) = 'ok'", () => {
    assert.strictEqual(classifyExportMemory(p1080, 8).verdict, 'ok');
  });
  check("classifyExportMemory(4K, 8GB) = 'warn'", () => {
    assert.strictEqual(classifyExportMemory(p4k, 8).verdict, 'warn');
  });
  check("classifyExportMemory(4K, 2GB) = 'block'", () => {
    assert.strictEqual(classifyExportMemory(p4k, 2).verdict, 'block');
  });
  check('deviceMemory undefined falls back to the 4GB tier', () => {
    assert.strictEqual(
      classifyExportMemory(p4k, undefined).verdict,
      classifyExportMemory(p4k, 4).verdict,
    );
  });

  // --- Single-buffer hard block: exceeds ~2GB muxed file even on an 8GB device ---
  check('single-buffer >2GB hard-blocks regardless of device RAM', () => {
    // 10 min @ 40 Mbps: encoded video = 40e6 * 36000 / (8*60) = 3,000,000,000 bytes > 2GB
    const huge = V({ width: 1920, height: 1080, frameRate: 60, durationFrames: 36000, bitrate: 40_000_000 });
    assert.ok(maxSingleBufferBytes(huge) >= 2 * 1024 ** 3);
    assert.strictEqual(classifyExportMemory(huge, 8).verdict, 'block');
  });

  console.log(`\nexport-memory: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
