// Acceptance harness for the pure Alt-hover gap measurement core
// (core/snap/measure.ts). Run: node scripts/verify-measure.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'measure-verify-'));
const outfile = join(tmp, 'measure.mjs');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const r = (x, y, w, h) => ({ x, y, w, h });

try {
  await build({ entryPoints: ['src/core/snap/measure.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { measureGaps, fmtGap } = await import(pathToFileURL(outfile).href);

  // ── fmtGap ──
  check('fmtGap: whole → integer', () => {
    assert.equal(fmtGap(40), '40');
    assert.equal(fmtGap(0), '0');
    assert.equal(fmtGap(-0), '0');
  });
  check('fmtGap: fractional → ≤2dp, trailing zeros stripped', () => {
    assert.equal(fmtGap(40.5), '40.5');
    assert.equal(fmtGap(40.50), '40.5');
    assert.equal(fmtGap(40.333), '40.33');
    assert.equal(fmtGap(40.1), '40.1');
  });

  // ── measureGaps ──
  check('separated horizontally → one X segment with the edge-to-edge gap', () => {
    const segs = measureGaps(r(0, 0, 100, 100), r(140, 0, 50, 100)); // gap 140-100 = 40
    assert.equal(segs.length, 1);
    assert.equal(segs[0].axis, 'x');
    assert.equal(segs[0].gap, 40);
    assert.equal(segs[0].label, '40');
    assert.equal(segs[0].x1, 100); // sel right
    assert.equal(segs[0].x2, 140); // hov left
    assert.equal(segs[0].y1, segs[0].y2); // horizontal segment
  });
  check('hover to the LEFT → X segment, positive gap', () => {
    const segs = measureGaps(r(200, 0, 100, 100), r(0, 0, 100, 100)); // gap 200-100 = 100
    assert.equal(segs.length, 1);
    assert.equal(segs[0].axis, 'x');
    assert.equal(segs[0].gap, 100);
    assert.equal(segs[0].x1, 100); // hov right
    assert.equal(segs[0].x2, 200); // sel left
  });
  check('separated vertically → one Y segment', () => {
    const segs = measureGaps(r(0, 0, 100, 100), r(0, 130, 100, 50)); // gap 130-100 = 30
    assert.equal(segs.length, 1);
    assert.equal(segs[0].axis, 'y');
    assert.equal(segs[0].gap, 30);
    assert.equal(segs[0].x1, segs[0].x2); // vertical segment
    assert.equal(segs[0].y1, 100);
    assert.equal(segs[0].y2, 130);
  });
  check('diagonally offset → BOTH an X and a Y segment', () => {
    const segs = measureGaps(r(0, 0, 100, 100), r(150, 200, 40, 40));
    assert.equal(segs.length, 2);
    const axes = segs.map((s) => s.axis).sort();
    assert.deepEqual(axes, ['x', 'y']);
    const xs = segs.find((s) => s.axis === 'x'), ys = segs.find((s) => s.axis === 'y');
    assert.equal(xs.gap, 50);  // 150 - 100
    assert.equal(ys.gap, 100); // 200 - 100
  });
  check('overlapping (rects intersect) → no segments (v1 skips overlap)', () => {
    const segs = measureGaps(r(0, 0, 100, 100), r(50, 50, 100, 100));
    assert.equal(segs.length, 0);
  });
  check('aligned on X, separated on Y → only the Y segment', () => {
    // Same x-range → overlap on X → no X segment; separated on Y → Y segment.
    const segs = measureGaps(r(0, 0, 100, 100), r(20, 200, 100, 50));
    assert.equal(segs.length, 1);
    assert.equal(segs[0].axis, 'y');
  });
  check('X segment cross-Y sits in the vertical overlap band when present', () => {
    // Both span y∈[0,100] → overlap band centre = 50.
    const segs = measureGaps(r(0, 0, 100, 100), r(200, 0, 100, 100));
    assert.equal(segs[0].y1, 50);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
