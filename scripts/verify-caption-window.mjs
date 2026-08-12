// Acceptance harness for the pure math behind offline auto-captions: the clip→source-window mapping,
// the segment→global-frame placement (buildCaptionLayers), and cross-clip de-overlap. No browser /
// model needed — these are the deterministic pieces. Run: node scripts/verify-caption-window.mjs
// (or: npm run verify:caption-window). Mirrors the scripts/*.mjs convention (esbuild + node:assert).

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'caption-verify-'));
const outfile = join(tmp, 'captions.mjs');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

try {
  await build({
    entryPoints: ['src/core/captions.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'silent',
  });
  const { captionClipWindow, deoverlapCaptionLayers, buildCaptionLayers } = await import(pathToFileURL(outfile).href);

  console.log('Auto-caption window/placement — acceptance\n');

  check('captionClipWindow maps an untrimmed clip at the origin', () => {
    const w = captionClipWindow(0, 0, 90, 30); // 3s @30fps
    assert.ok(near(w.startSec, 0) && near(w.spanSec, 3) && w.clipStartFrame === 0);
  });

  check('captionClipWindow honours startOffset (trim) + timeline placement', () => {
    const w = captionClipWindow(45, 90, 210, 30); // startOffset 1.5s, span (210-90)/30 = 4s, starts at frame 90
    assert.ok(near(w.startSec, 1.5), `startSec ${w.startSec}`);
    assert.ok(near(w.spanSec, 4), `spanSec ${w.spanSec}`);
    assert.equal(w.clipStartFrame, 90);
  });

  check('captionClipWindow respects a non-30 fps', () => {
    const w = captionClipWindow(24, 48, 96, 24); // 1s offset, 2s span @24fps, starts at frame 48
    assert.ok(near(w.startSec, 1) && near(w.spanSec, 2) && w.clipStartFrame === 48);
  });

  check('buildCaptionLayers places segments at clipStart + round(seg*fps)', () => {
    const layers = buildCaptionLayers({
      segments: [{ text: 'a', start: 0, end: 1 }, { text: 'b', start: 1, end: 2.5 }],
      compWidth: 1920, compHeight: 1080, frameRate: 30,
      position: 'bottom-center', style: 'classic', clipStartOffsetFrames: 90,
    });
    assert.equal(layers.length, 2);
    assert.equal(layers[0].inPoint, 90);   // 90 + round(0*30)
    assert.equal(layers[0].outPoint, 120); // 90 + round(1*30)
    assert.equal(layers[1].inPoint, 120);  // 90 + round(1*30)
    assert.equal(layers[1].outPoint, 165); // 90 + round(2.5*30)
    assert.equal(layers[0].content.spans[0].text, 'a');
    assert.equal(layers[1].content.spans[0].text, 'b');
  });

  check('buildCaptionLayers guarantees outPoint > inPoint for a zero-length segment', () => {
    const layers = buildCaptionLayers({
      segments: [{ text: 'x', start: 1, end: 1 }],
      compWidth: 1920, compHeight: 1080, frameRate: 30,
      position: 'bottom-center', style: 'classic', clipStartOffsetFrames: 0,
    });
    assert.ok(layers[0].outPoint >= layers[0].inPoint + 1);
  });

  check('deoverlapCaptionLayers sorts by in-point and clamps overlaps', () => {
    const out = deoverlapCaptionLayers([
      { id: 'b', inPoint: 30, outPoint: 80 },
      { id: 'a', inPoint: 0, outPoint: 50 }, // overlaps b (50 > 30) → clamp to 30
    ]);
    assert.deepEqual(out.map((l) => l.id), ['a', 'b']); // sorted
    assert.equal(out[0].outPoint, 30); // clamped to next in-point
    assert.equal(out[1].outPoint, 80); // last unchanged
  });

  check('deoverlapCaptionLayers leaves non-overlapping clips untouched', () => {
    const input = [{ id: 'a', inPoint: 0, outPoint: 20 }, { id: 'b', inPoint: 40, outPoint: 60 }];
    const out = deoverlapCaptionLayers(input);
    assert.equal(out[0].outPoint, 20);
    assert.equal(out[1].outPoint, 60);
  });

  check('deoverlapCaptionLayers keeps outPoint > inPoint even when clips share an in-point', () => {
    const out = deoverlapCaptionLayers([
      { id: 'a', inPoint: 10, outPoint: 40 },
      { id: 'b', inPoint: 10, outPoint: 50 },
    ]);
    // first clamps toward next in-point (10) but is floored to inPoint+1
    assert.ok(out[0].outPoint >= out[0].inPoint + 1);
  });

  check('deoverlapCaptionLayers is deterministic (batch-merged clips)', () => {
    const mk = () => [
      { id: 'c2', inPoint: 200, outPoint: 260 },
      { id: 'c1', inPoint: 100, outPoint: 250 }, // crosses into c2 → clamp to 200
      { id: 'c0', inPoint: 0, outPoint: 90 },
    ];
    const a = deoverlapCaptionLayers(mk());
    const b = deoverlapCaptionLayers(mk());
    assert.deepEqual(a, b);
    assert.deepEqual(a.map((l) => l.id), ['c0', 'c1', 'c2']);
    assert.equal(a[1].outPoint, 200);
  });

  console.log(`\n✅ ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
