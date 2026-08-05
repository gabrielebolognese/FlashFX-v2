// Acceptance harness for the pure frame-presentation policy (engine/video/framePresentation.ts).
// Proves latest-≤-time selection, the seek-safety maxDistance guard, hold-last / black
// cold-start, and the multi-layer (split-clip) drop floor.
// Run: node scripts/verify-presentation.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'presentation-verify-'));
const outfile = join(tmp, 'fp.mjs');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

try {
  await build({ entryPoints: ['src/engine/video/framePresentation.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { selectPresentFrame, computeDropFloor } = await import(pathToFileURL(outfile).href);

  const buf = [10, 11, 12, 13];

  check('presents the greatest buffered index ≤ target', () => {
    assert.equal(selectPresentFrame(buf, 12.5, null, 30), 12);
    assert.equal(selectPresentFrame(buf, 13, null, 30), 13);
    assert.equal(selectPresentFrame(buf, 13.9, null, 30), 13);
  });

  check('never presents a future frame (> target)', () => {
    assert.equal(selectPresentFrame(buf, 11.2, null, 30), 11); // not 12/13
  });

  check('a slightly-stale ≤ frame within maxDistance is still presented (smooth, not black)', () => {
    assert.equal(selectPresentFrame(buf, 20, null, 30), 13); // 13 is 7 behind ≤ 30
  });

  check('post-seek: only far ≤ frames → HOLD last (no wrong-frame flash), else black', () => {
    // target far ahead of the whole ring; nothing within maxDistance
    assert.equal(selectPresentFrame(buf, 100, null, 30), null);       // no last → black
    assert.equal(selectPresentFrame(buf, 100, 13, 30), 13);           // hold last (still buffered)
    assert.equal(selectPresentFrame(buf, 100, 999, 30), null);        // last not buffered → black
  });

  check('nothing ≤ target (ring is all ahead) → hold last, else black', () => {
    assert.equal(selectPresentFrame(buf, 5, null, 30), null);
    assert.equal(selectPresentFrame(buf, 5, 11, 30), 11); // hold last presented
  });

  check('cold start (empty ring) → black', () => {
    assert.equal(selectPresentFrame([], 10, null, 30), null);
    assert.equal(selectPresentFrame([], 10, 8, 30), null); // last not buffered
  });

  check('drop floor = MIN presented across a split clip’s layers', () => {
    assert.equal(computeDropFloor([100, 40]), 40); // layer B at 40 keeps its frames
    assert.equal(computeDropFloor([100]), 100);
    assert.equal(computeDropFloor([50, 50, 51]), 50);
    assert.equal(computeDropFloor([]), null); // nothing presented → evict nothing
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
