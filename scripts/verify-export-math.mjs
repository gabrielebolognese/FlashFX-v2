// Acceptance harness for the pure export math (src/codec/exportMath.ts).
// No test runner in this repo (see CLAUDE.md); this bundles the REAL TS with the installed esbuild
// and asserts with node:assert. Run: node scripts/verify-export-math.mjs (or: npm run verify:export-math)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'exportmath-verify-'));
const outfile = join(tmp, 'exportMath.mjs');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

try {
  await build({
    entryPoints: ['src/codec/exportMath.ts'],
    outfile, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent',
  });
  const {
    MIN_EXPORT_DIM, normalizeExportDimensions, validateExportTiming,
    frameTimestampUs, frameDurationUs, isExportKeyframe,
  } = await import(pathToFileURL(outfile).href);

  check('rounds odd dimensions down to even', () => {
    assert.deepEqual(normalizeExportDimensions(1921, 1081), { width: 1920, height: 1080 });
    assert.deepEqual(normalizeExportDimensions(1920, 1080), { width: 1920, height: 1080 });
    assert.deepEqual(normalizeExportDimensions(3840, 2160), { width: 3840, height: 2160 });
  });

  check('rejects blank / NaN / too-small resolution (no more 2px videos)', () => {
    assert.throws(() => normalizeExportDimensions(NaN, 1080));
    assert.throws(() => normalizeExportDimensions(0, 0));
    assert.throws(() => normalizeExportDimensions(1920, MIN_EXPORT_DIM - 1));
    assert.throws(() => normalizeExportDimensions(8, 8)); // below the 16px floor
  });

  check('accepts the minimum dimension exactly', () => {
    assert.deepEqual(normalizeExportDimensions(MIN_EXPORT_DIM, MIN_EXPORT_DIM), { width: 16, height: 16 });
  });

  check('validateExportTiming throws on empty / invalid comps', () => {
    assert.throws(() => validateExportTiming(0, 30));
    assert.throws(() => validateExportTiming(-5, 30));
    assert.throws(() => validateExportTiming(NaN, 30));
    assert.throws(() => validateExportTiming(120, 0));
    assert.throws(() => validateExportTiming(120, NaN));
    assert.doesNotThrow(() => validateExportTiming(120, 30));
  });

  check('microsecond timestamp + duration math', () => {
    assert.equal(frameDurationUs(30), 33333);
    assert.equal(frameDurationUs(60), 16667);
    assert.equal(frameTimestampUs(0, 30), 0);
    assert.equal(frameTimestampUs(30, 30), 1_000_000); // 1s at frame 30 @ 30fps
    assert.equal(frameTimestampUs(60, 30), 2_000_000);
  });

  check('keyframe cadence: frame 0 + every 2 seconds, integer interval for fractional fps', () => {
    assert.equal(isExportKeyframe(0, 30), true);
    assert.equal(isExportKeyframe(60, 30), true);  // 2s @ 30fps
    assert.equal(isExportKeyframe(1, 30), false);
    assert.equal(isExportKeyframe(120, 60), true); // 2s @ 60fps
    assert.equal(isExportKeyframe(0, 29.97), true); // fractional fps still yields a sane modulus
  });

  console.log(`\nexport-math: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
