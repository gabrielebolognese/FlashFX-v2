// Acceptance harness for the pure equal-spacing snap core (core/snap/equalGap.ts).
// Run: node scripts/verify-equalgap.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'equalgap-verify-'));
const outfile = join(tmp, 'eg.mjs');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const r = (x, y, w, h) => ({ x, y, w, h });
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

try {
  await build({ entryPoints: ['src/core/snap/equalGap.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { computeEqualGapSnap } = await import(pathToFileURL(outfile).href);

  check('match-the-run: 3 boxes gap 20, drag the 4th near → snaps to gap 20', () => {
    // A[0..40] B[60..100] C[120..160], gap = 20. Dragged D[175..215] → sideR-ish;
    // as a RIGHT-side match we need neighbours on the left: L=C, lt[1]=B, g=20.
    const cands = [r(0, 0, 40, 40), r(60, 0, 40, 40), r(120, 0, 40, 40)];
    const D = r(175, 0, 40, 40); // gap C→D = 175-160 = 15, within 20 of g=20
    const snap = computeEqualGapSnap(D, cands, 'x', 8);
    assert.ok(snap, 'should snap');
    // target D.x so gap == 20 → 160 + 20 = 180
    assert.ok(near(snap.delta, 5), `delta ${snap.delta} should be +5 (175→180)`);
    assert.equal(snap.badges.length, 2);
    assert.ok(snap.badges.every((b) => near(b.gap, 20)));
  });

  check('centre between two neighbours (2-box case), doubled window', () => {
    // L[0..40] R[160..200], free = 120, size 40 → eqGap = 40. D near centre.
    const D = r(78, 0, 40, 40); // sideL=38, sideR = 160-118 = 42 → |diff|=4 within 2*8
    const snap = computeEqualGapSnap(D, [r(0, 0, 40, 40), r(160, 0, 40, 40)], 'x', 8);
    assert.ok(snap);
    // centred → D.x = 40 + 40 = 80 → delta +2
    assert.ok(near(snap.delta, 2), `delta ${snap.delta} should be +2`);
    assert.equal(snap.badges.length, 2);
    assert.ok(snap.badges.every((b) => near(b.gap, 40)));
  });

  check('no snap when the prospective gap is outside tolerance', () => {
    const cands = [r(0, 0, 40, 40), r(60, 0, 40, 40), r(120, 0, 40, 40)];
    const D = r(300, 0, 40, 40); // far away → gap 140, nowhere near 20
    assert.equal(computeEqualGapSnap(D, cands, 'x', 8), null);
  });

  check('cross-axis non-overlap excludes candidates (different row → null)', () => {
    // Same X positions but the dragged box is far below → no vertical overlap.
    const cands = [r(0, 0, 40, 40), r(60, 0, 40, 40), r(120, 0, 40, 40)];
    const D = r(175, 500, 40, 40);
    assert.equal(computeEqualGapSnap(D, cands, 'x', 8), null);
  });

  check('works on the Y axis (vertical run)', () => {
    const cands = [r(0, 0, 40, 40), r(0, 60, 40, 40), r(0, 120, 40, 40)]; // gap 20 vertically
    const D = r(0, 176, 40, 40); // gap 16 → within 20 of 20
    const snap = computeEqualGapSnap(D, cands, 'y', 8);
    assert.ok(snap);
    assert.ok(near(snap.delta, 4), `delta ${snap.delta} should be +4 (176→180)`);
    assert.ok(snap.badges.every((b) => b.axis === 'y' && near(b.gap, 20)));
  });

  check('badge cross-coordinate sits in the shared row band', () => {
    const cands = [r(0, 0, 40, 40), r(60, 0, 40, 40), r(120, 0, 40, 40)];
    const D = r(178, 0, 40, 40);
    const snap = computeEqualGapSnap(D, cands, 'x', 8);
    // all rects span y∈[0,40] → cross center 20
    assert.ok(snap.badges.every((b) => near(b.cross, 20)));
  });

  check('smallest correction wins when multiple options fire', () => {
    // Symmetric run so centre and match could both offer; result is a valid small delta.
    const cands = [r(0, 0, 40, 40), r(60, 0, 40, 40), r(180, 0, 40, 40)];
    const D = r(118, 0, 40, 40);
    const snap = computeEqualGapSnap(D, cands, 'x', 12);
    assert.ok(snap);
    assert.ok(Math.abs(snap.delta) <= 12 * 2, `delta ${snap.delta} within window`);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
