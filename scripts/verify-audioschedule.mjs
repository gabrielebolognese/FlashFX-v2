// Acceptance harness for the shared clip→source scheduling math
// (engine/audio/audioScheduleMath.ts) used by BOTH preview and export.
// Proves the export anchor reproduces the classic when=inPoint/fps scheduling, the
// preview anchor handles already-playing clips (start now, advanced offset), rate
// scaling, and the skip cases. Run: node scripts/verify-audioschedule.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'audiosched-verify-'));
const outfile = join(tmp, 'as.mjs');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// A clip: starts at 1.0s, 2.0s long (ends 3.0s), 10s buffer, rate 1, offset 0.
const clip = (over = {}) => ({ clipStartCompSec: 1.0, clipDurationCompSec: 2.0, startOffsetSec: 0, playbackRate: 1, bufferDurationSec: 10, ...over });
const exportAnchor = { anchorCompSec: 0, anchorClockTime: 0, masterRate: 1 };

try {
  await build({ entryPoints: ['src/engine/audio/audioScheduleMath.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { computeSourceSchedule } = await import(pathToFileURL(outfile).href);

  check('export anchor → when = clip start, offset = startOffset, duration = clip length', () => {
    const s = computeSourceSchedule(clip(), exportAnchor);
    assert.ok(s && near(s.when, 1.0) && near(s.offset, 0) && near(s.duration, 2.0));
  });

  check('export anchor honors a source startOffset', () => {
    const s = computeSourceSchedule(clip({ startOffsetSec: 0.5 }), exportAnchor);
    assert.ok(near(s.offset, 0.5) && near(s.when, 1.0));
  });

  check('preview mid-clip → start NOW, offset advanced into the buffer', () => {
    // Anchor at comp 1.5s (0.5s into the clip), clock 100.
    const s = computeSourceSchedule(clip(), { anchorCompSec: 1.5, anchorClockTime: 100, masterRate: 1 });
    assert.ok(near(s.when, 100));        // starts now
    assert.ok(near(s.offset, 0.5));      // 0.5s into the buffer
    assert.ok(near(s.duration, 1.5));    // 1.5s of clip remains
  });

  check('preview future clip → scheduled ahead on the clock', () => {
    const s = computeSourceSchedule(clip(), { anchorCompSec: 0.5, anchorClockTime: 100, masterRate: 1 });
    assert.ok(near(s.when, 100.5) && near(s.offset, 0)); // 0.5s until the clip starts
  });

  check('per-clip playbackRate scales the advanced offset + buffer consumption', () => {
    // 2× clip: 0.5 comp-sec into the clip → 1.0 buffer-sec consumed.
    const s = computeSourceSchedule(clip({ playbackRate: 2 }), { anchorCompSec: 1.5, anchorClockTime: 100, masterRate: 1 });
    assert.ok(near(s.offset, 1.0));
    assert.ok(near(s.duration, 3.0)); // 1.5 comp-sec remaining × 2 = 3.0 buffer-sec
  });

  check('master rate (slow-mo playback) stretches the clock lead time', () => {
    const s = computeSourceSchedule(clip(), { anchorCompSec: 0.5, anchorClockTime: 100, masterRate: 0.5 });
    assert.ok(near(s.when, 101)); // 0.5 comp-sec / 0.5 rate = 1.0 clock-sec
  });

  check('clip already ended at the anchor → null', () => {
    assert.equal(computeSourceSchedule(clip(), { anchorCompSec: 5.0, anchorClockTime: 100, masterRate: 1 }), null);
  });

  check('negative source offset → null (old preview guard: skip, never start() a <0 offset)', () => {
    // A negative startOffset larger than the elapsed clip time drives offset < 0.
    const c = clip({ clipStartCompSec: 0, startOffsetSec: -1 });
    assert.equal(computeSourceSchedule(c, { anchorCompSec: 0.5, anchorClockTime: 100, masterRate: 1 }), null);
  });

  check('offset past the decoded buffer → null', () => {
    // clip start 0, startOffset 9.5, anchor 1.0s in → offset 10.5 > 10s buffer.
    const c = clip({ clipStartCompSec: 0, startOffsetSec: 9.5, clipDurationCompSec: 100 });
    assert.equal(computeSourceSchedule(c, { anchorCompSec: 1.0, anchorClockTime: 100, masterRate: 1 }), null);
  });

  check('duration capped by remaining buffer, not clip length', () => {
    // clip claims 100s but buffer only has 3s left from offset 0.
    const c = clip({ clipDurationCompSec: 100, bufferDurationSec: 3 });
    const s = computeSourceSchedule(c, exportAnchor);
    assert.ok(near(s.duration, 3)); // remainingBuffer wins
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
