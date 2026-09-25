// Acceptance harness for the thumbnail-sprite geometry (src/engine/video/thumbnailSprite.ts) - the pure
// planning/layout/lookup math behind PB6's packed filmstrip atlas. Pins the density/cap policy, the grid
// layout (never exceeds the atlas dim), the per-cell rects, and the time->cell mapping so the builder and
// the timeline consumer can't drift. No test runner in this repo (see CLAUDE.md); bundles the real TS
// with esbuild + node:assert. Run: node scripts/verify-thumbnail-sprite.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'thumbsprite-verify-'));
const outfile = join(tmp, 'thumb.mjs');

let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

try {
  await build({
    entryPoints: ['src/engine/video/thumbnailSprite.ts'],
    outfile, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent',
  });
  const {
    planThumbnailSprite, timestampsForSprite, atlasSize, cellRect, cellIndexForTime,
    THUMB_CELL_W, THUMB_CELL_H, THUMB_INTERVAL_SEC, MAX_THUMBS, MAX_ATLAS_DIM, THUMB_SPRITE_VERSION,
  } = await import(pathToFileURL(outfile).href);

  check('short clip: one cell per second at the default interval', () => {
    const m = planThumbnailSprite(10);
    assert.equal(m.intervalSec, THUMB_INTERVAL_SEC);
    assert.equal(m.count, 10);
    assert.equal(m.version, THUMB_SPRITE_VERSION);
    assert.equal(m.firstTs, 0);
  });

  check('a still / zero-length clip still plans exactly one cell', () => {
    for (const d of [0, -5, NaN, Infinity]) {
      const m = planThumbnailSprite(d);
      assert.equal(m.count, 1);
      assert.equal(m.cols, 1);
      assert.equal(m.rows, 1);
    }
  });

  check('long clip is capped at MAX_THUMBS and the interval widens to span it', () => {
    const dur = 1000; // way past MAX_THUMBS * 1s
    const m = planThumbnailSprite(dur);
    assert.equal(m.count, MAX_THUMBS);
    assert.equal(m.intervalSec, dur / MAX_THUMBS); // N cells cover the whole clip
    // last sampled timestamp is < duration (i in [0,count))
    const ts = timestampsForSprite(m);
    assert.equal(ts.length, MAX_THUMBS);
    assert.ok(ts[ts.length - 1] < dur + 1e-9);
  });

  check('grid wraps within the atlas width cap; atlas never exceeds MAX_ATLAS_DIM', () => {
    const m = planThumbnailSprite(1000); // MAX_THUMBS cells
    const maxCols = Math.floor(MAX_ATLAS_DIM / THUMB_CELL_W);
    assert.equal(m.cols, Math.min(m.count, maxCols));
    assert.equal(m.rows, Math.ceil(m.count / m.cols));
    assert.ok(m.cols * m.rows >= m.count); // grid holds every cell
    const { width, height } = atlasSize(m);
    assert.equal(width, m.cols * THUMB_CELL_W);
    assert.equal(height, m.rows * THUMB_CELL_H);
    assert.ok(width <= MAX_ATLAS_DIM);
    assert.ok(height <= MAX_ATLAS_DIM);
  });

  check('timestamps are evenly spaced from 0', () => {
    const m = planThumbnailSprite(5);
    assert.deepEqual(timestampsForSprite(m), [0, 1, 2, 3, 4]);
  });

  check('cellRect walks row-major and stays inside the atlas', () => {
    const m = planThumbnailSprite(1000);
    const { width, height } = atlasSize(m);
    assert.deepEqual(cellRect(0, m), { x: 0, y: 0, w: THUMB_CELL_W, h: THUMB_CELL_H });
    // first cell of row 1 sits one row down, back at x=0
    const firstOfRow1 = cellRect(m.cols, m);
    assert.deepEqual(firstOfRow1, { x: 0, y: THUMB_CELL_H, w: THUMB_CELL_W, h: THUMB_CELL_H });
    for (let i = 0; i < m.count; i++) {
      const r = cellRect(i, m);
      assert.ok(r.x + r.w <= width && r.y + r.h <= height);
    }
  });

  check('cellRect clamps an out-of-range index to a valid cell', () => {
    const m = planThumbnailSprite(5); // count 5
    assert.deepEqual(cellRect(-3, m), cellRect(0, m));
    assert.deepEqual(cellRect(999, m), cellRect(m.count - 1, m));
  });

  check('cellIndexForTime maps to the nearest cell and clamps the ends', () => {
    const m = planThumbnailSprite(10); // interval 1, count 10, cells at t=0..9
    assert.equal(cellIndexForTime(0, m), 0);
    assert.equal(cellIndexForTime(3.4, m), 3);   // nearest
    assert.equal(cellIndexForTime(3.6, m), 4);
    assert.equal(cellIndexForTime(-2, m), 0);    // before start -> first
    assert.equal(cellIndexForTime(100, m), 9);   // past end -> last cell
  });

  check('cellIndexForTime is safe when the interval is degenerate', () => {
    const m = { ...planThumbnailSprite(10), intervalSec: 0 };
    assert.equal(cellIndexForTime(5, m), 0); // no divide-by-zero, returns cell 0
  });

  console.log(`\nthumbnail-sprite: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
