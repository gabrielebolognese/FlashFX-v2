// Acceptance harness for the pure export size-estimate math (src/codec/exportEstimate.ts).
// No test runner in this repo (see CLAUDE.md); this bundles the REAL TS with the installed esbuild and
// asserts with node:assert. Run: node scripts/verify-export-estimate.mjs (or: npm run verify:export-estimate)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'exportestimate-verify-'));
const outfile = join(tmp, 'exportEstimate.mjs');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

try {
  await build({
    entryPoints: ['src/codec/exportEstimate.ts'],
    outfile, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent',
  });
  const {
    EXPORT_AUDIO_BITRATE, contentComplexityFactor, estimateCeilingBytes, estimateLikelyBytes,
    estimateExportSize, classifyExportContent, projectExportSizeBytes,
  } = await import(pathToFileURL(outfile).href);

  const MB = 1024 * 1024;

  check('ceiling reproduces the OLD naive estimate (bitrate * duration / 8)', () => {
    // The user report: 10 Mbps "high" preset, 38s -> ~47.5 MB; 5s -> ~6 MB. This is the CEILING now.
    const c38 = estimateCeilingBytes({ bitrate: 10_000_000, durationSec: 38, includeAudio: false, content: 'vector', layerCount: 5 });
    assert.equal(Math.round(c38 / 1e6), 48); // 10e6*38/8 = 47.5e6 bytes
    const c5 = estimateCeilingBytes({ bitrate: 10_000_000, durationSec: 5, includeAudio: false, content: 'vector', layerCount: 0 });
    assert.equal(Math.round(c5 / 1e6), 6); // 10e6*5/8 = 6.25e6 bytes
  });

  check('likely estimate for a VECTOR project is far below the ceiling (the actual bug)', () => {
    const i = { bitrate: 10_000_000, durationSec: 38, includeAudio: false, content: 'vector', layerCount: 5 };
    const { likelyBytes, ceilingBytes } = estimateExportSize(i);
    // The friend really got ~4.2 MB; the ceiling says 47.5 MB. The likely estimate must land near reality,
    // not near the ceiling.
    assert.ok(likelyBytes < 7 * MB, `likely ${(likelyBytes / MB).toFixed(1)}MB should be < 7MB`);
    assert.ok(likelyBytes > 3 * MB, `likely ${(likelyBytes / MB).toFixed(1)}MB should be > 3MB`);
    assert.ok(ceilingBytes > 5 * likelyBytes, 'ceiling should dwarf the likely estimate for vector content');
  });

  check('likely estimate for VIDEO content is near the ceiling', () => {
    const i = { bitrate: 10_000_000, durationSec: 10, includeAudio: false, content: 'video', layerCount: 1 };
    const { likelyBytes, ceilingBytes } = estimateExportSize(i);
    assert.ok(likelyBytes > 0.8 * ceilingBytes, 'full-frame video should approach the ceiling');
  });

  check('content factor ordering: video > photo > mixed > vector', () => {
    const v = contentComplexityFactor('video', 1);
    const p = contentComplexityFactor('photo', 1);
    const m = contentComplexityFactor('mixed', 1);
    const vec = contentComplexityFactor('vector', 1);
    assert.ok(v > p && p > m && m > vec, `${v} > ${p} > ${m} > ${vec}`);
    assert.ok(vec >= 0.05 && v <= 1, 'factor stays within [0.05, 1]');
  });

  check('busier scenes trend higher but never exceed the ceiling', () => {
    const few = contentComplexityFactor('vector', 2);
    const many = contentComplexityFactor('vector', 50);
    assert.ok(many > few, 'more layers -> higher factor');
    assert.ok(many <= 1, 'clamped at 1');
    assert.equal(contentComplexityFactor('video', 10_000), 1); // clamp holds for extreme counts
  });

  check('empty project does NOT estimate the same as a busy one', () => {
    const empty = estimateLikelyBytes({ bitrate: 10_000_000, durationSec: 5, includeAudio: false, content: 'vector', layerCount: 0 });
    const busyVideo = estimateLikelyBytes({ bitrate: 10_000_000, durationSec: 5, includeAudio: false, content: 'video', layerCount: 8 });
    assert.ok(busyVideo > 5 * empty, 'a video scene must estimate much larger than an empty vector one');
  });

  check('audio adds a ~CBR term to both likely and ceiling', () => {
    const noAudio = estimateExportSize({ bitrate: 5_000_000, durationSec: 10, includeAudio: false, content: 'vector', layerCount: 1 });
    const withAudio = estimateExportSize({ bitrate: 5_000_000, durationSec: 10, includeAudio: true, content: 'vector', layerCount: 1 });
    const expectedAudio = (EXPORT_AUDIO_BITRATE * 10) / 8;
    assert.ok(Math.abs((withAudio.likelyBytes - noAudio.likelyBytes) - expectedAudio) < 1, 'audio term on likely');
    assert.ok(Math.abs((withAudio.ceilingBytes - noAudio.ceilingBytes) - expectedAudio) < 1, 'audio term on ceiling');
  });

  check('classifyExportContent: video wins, then nested(mixed), then photo, else vector', () => {
    assert.equal(classifyExportContent([{ type: 'shape' }, { type: 'video' }, { type: 'image' }]), 'video');
    assert.equal(classifyExportContent([{ type: 'shape' }, { type: 'cloner' }]), 'mixed');
    assert.equal(classifyExportContent([{ type: 'precomp' }]), 'mixed');
    assert.equal(classifyExportContent([{ type: 'image' }, { type: 'text' }]), 'photo');
    assert.equal(classifyExportContent([{ type: 'shape' }, { type: 'text' }]), 'vector');
    assert.equal(classifyExportContent([]), 'vector');
  });

  check('projectExportSizeBytes: extrapolates real bytes + audio, null before any frame', () => {
    assert.equal(projectExportSizeBytes(0, 0, 150, 0), null);
    // 10 frames took 1,000,000 bytes -> 100,000 B/frame * 150 frames + 500,000 audio = 15,500,000
    assert.equal(projectExportSizeBytes(1_000_000, 10, 150, 500_000), 15_500_000);
    // monotonic: measuring more frames of the same stream keeps the projection stable
    assert.equal(projectExportSizeBytes(3_000_000, 30, 150, 0), 15_000_000);
    assert.equal(projectExportSizeBytes(1_000_000, 10, 150, 0), 15_000_000);
  });

  console.log(`\nexport-estimate: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
