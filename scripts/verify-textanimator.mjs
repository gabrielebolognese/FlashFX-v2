// Acceptance harness for the per-character text-animation core (src/core/textAnimator.ts). Pins the
// split-unit assignment and the selector-weighted delta accumulation so future changes can't quietly
// break per-glyph animation. The glyph PLACEMENT (canvas measurement) is browser-only and not covered
// here: this proves the pure math. No test runner in this repo (see CLAUDE.md); bundles the real TS
// with esbuild + node:assert. Run: node scripts/verify-textanimator.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'textanim-verify-'));
const outfile = join(tmp, 'textAnimator.mjs');

let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

// A range-selector config; default is a rampUp over the full range → weight == position (predictable).
const sel = (o = {}) => ({ start: 0, end: 1, offset: 0, shape: 'rampUp', easeHigh: 0, easeLow: 0, amount: 1, randomizeOrder: false, seed: 1, ...o });
const approx = (a, b) => Math.abs(a - b) < 1e-9;

try {
  await build({
    entryPoints: ['src/core/textAnimator.ts'],
    outfile, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent',
  });
  const { splitTextUnits, accumulateGlyphDeltas, trackingShifts, unitRandom } = await import(pathToFileURL(outfile).href);

  // --- split unit assignment ---
  check('character split: one unit per char', () => {
    const r = splitTextUnits('abc', 'character');
    assert.deepEqual(r.unitOf, [0, 1, 2]);
    assert.equal(r.unitCount, 3);
  });
  check('word split: whitespace attaches to preceding word', () => {
    const r = splitTextUnits('ab cd', 'word'); // a b (space) c d
    assert.deepEqual(r.unitOf, [0, 0, 0, 1, 1]);
    assert.equal(r.unitCount, 2);
  });
  check('line split: one unit per newline-delimited line', () => {
    const r = splitTextUnits('a\nb', 'line');
    assert.deepEqual(r.unitOf, [0, 0, 1]);
    assert.equal(r.unitCount, 2);
  });

  // --- delta accumulation (rampUp over 3 chars → weights [0, 0.5, 1]) ---
  check('position delta scales by weight', () => {
    const g = accumulateGlyphDeltas('abc', [{ splitMode: 'character', selector: sel(), delta: { position: [10, 0] } }]);
    assert.ok(approx(g[0].tx, 0) && approx(g[1].tx, 5) && approx(g[2].tx, 10));
    assert.ok(g.every((x) => x.ty === 0));
  });
  check('opacity delta -1 fades from 1 to 0 across the weights', () => {
    const g = accumulateGlyphDeltas('abc', [{ splitMode: 'character', selector: sel(), delta: { opacity: -1 } }]);
    assert.ok(approx(g[0].opacity, 1) && approx(g[1].opacity, 0.5) && approx(g[2].opacity, 0));
  });
  check('scale delta is multiplicative (1 + delta·weight)', () => {
    const g = accumulateGlyphDeltas('abc', [{ splitMode: 'character', selector: sel(), delta: { scale: [1, 1] } }]);
    assert.ok(approx(g[0].sx, 1) && approx(g[1].sx, 1.5) && approx(g[2].sx, 2));
    assert.ok(approx(g[2].sy, 2));
  });
  check('rotation delta scales by weight', () => {
    const g = accumulateGlyphDeltas('abc', [{ splitMode: 'character', selector: sel(), delta: { rotation: 90 } }]);
    assert.ok(approx(g[0].rotation, 0) && approx(g[1].rotation, 45) && approx(g[2].rotation, 90));
  });
  check('per-character 3D rotation X/Y scales by weight (B9c)', () => {
    const g = accumulateGlyphDeltas('abc', [{ splitMode: 'character', selector: sel(), delta: { rotationX: 90, rotationY: -30 } }]);
    assert.ok(approx(g[0].rx, 0) && approx(g[1].rx, 45) && approx(g[2].rx, 90));
    assert.ok(approx(g[0].ry, 0) && approx(g[1].ry, -15) && approx(g[2].ry, -30));
  });
  check('per-character blur scales by weight and never goes negative (B9d)', () => {
    const g = accumulateGlyphDeltas('abc', [{ splitMode: 'character', selector: sel(), delta: { blur: 16 } }]);
    assert.ok(approx(g[0].blur, 0) && approx(g[1].blur, 8) && approx(g[2].blur, 16));
    const gneg = accumulateGlyphDeltas('abc', [{ splitMode: 'character', selector: sel(), delta: { blur: -100 } }]);
    assert.ok(gneg.every((x) => x.blur >= 0), 'blur clamps at 0');
  });
  check('multiple animators stack (position adds)', () => {
    const g = accumulateGlyphDeltas('abc', [
      { splitMode: 'character', selector: sel(), delta: { position: [10, 0] } },
      { splitMode: 'character', selector: sel(), delta: { position: [0, 20] } },
    ]);
    assert.ok(approx(g[2].tx, 10) && approx(g[2].ty, 20));
  });
  check('zero weight leaves the identity delta untouched', () => {
    const g = accumulateGlyphDeltas('abc', [{ splitMode: 'character', selector: sel(), delta: { position: [10, 5], rotation: 90, scale: [1, 1], opacity: -1 } }]);
    assert.deepEqual(g[0], { tx: 0, ty: 0, sx: 1, sy: 1, rotation: 0, opacity: 1, rx: 0, ry: 0, blur: 0, tracking: 0, skew: 0 });
  });
  check('word split shares one weight across a whole word', () => {
    // "ab cd": 2 words → weights [0, 1]; both chars of word 1 get weight 1.
    const g = accumulateGlyphDeltas('ab cd', [{ splitMode: 'word', selector: sel(), delta: { position: [10, 0] } }]);
    assert.ok(approx(g[0].tx, 0) && approx(g[1].tx, 0)); // word 0
    assert.ok(approx(g[3].tx, 10) && approx(g[4].tx, 10)); // word 1
  });
  check('randomizeOrder is deterministic for a fixed seed', () => {
    const cfg = { splitMode: 'character', selector: sel({ randomizeOrder: true, seed: 7 }), delta: { position: [10, 0] } };
    const a = accumulateGlyphDeltas('abcdef', [cfg]);
    const b = accumulateGlyphDeltas('abcdef', [cfg]);
    assert.deepEqual(a, b);
  });

  // --- Characters Excluding Spaces (AE "Based On") ---
  check('characterNoSpaces: one unit per non-space char; a space shares the previous unit', () => {
    const r = splitTextUnits('ab cd', 'characterNoSpaces'); // a b (space) c d
    assert.deepEqual(r.unitOf, [0, 1, 1, 2, 3]);
    assert.equal(r.unitCount, 4);
    const lead = splitTextUnits('  ab', 'characterNoSpaces');
    assert.deepEqual(lead.unitOf, [0, 0, 0, 1]);
    assert.equal(lead.unitCount, 2);
    assert.equal(splitTextUnits('   ', 'characterNoSpaces').unitCount, 1, 'all-space content still has one unit');
  });
  check('characterNoSpaces: a reveal has no dead step on the space (weights spread evenly over letters)', () => {
    // "ab cd": 4 letter units -> rampUp weights [0, 1/3, 2/3, 1]; counting the space would give the
    // letters [0, .25, .75, 1] (a jump over the space).
    const g = accumulateGlyphDeltas('ab cd', [{ splitMode: 'characterNoSpaces', selector: sel(), delta: { position: [30, 0] } }]);
    assert.ok(approx(g[0].tx, 0) && approx(g[1].tx, 10) && approx(g[3].tx, 20) && approx(g[4].tx, 30));
    assert.ok(approx(g[2].tx, 10), 'the space rides with "b"');
  });

  // --- Tracking (AE animator "Tracking Amount") ---
  check('tracking delta scales by weight and adds across animators', () => {
    const g = accumulateGlyphDeltas('abc', [
      { splitMode: 'character', selector: sel(), delta: { tracking: 10 } },
      { splitMode: 'character', selector: sel({ shape: 'square', start: 0, end: 1, offset: -2 }), delta: { tracking: 4 } },
    ]);
    // animator 2's window is pushed fully past every unit -> weight 1 for all (t = 1 beyond the end).
    assert.ok(approx(g[0].tracking, 4), `glyph 0 = 0 + 4, got ${g[0].tracking}`);
    assert.ok(approx(g[1].tracking, 9), `glyph 1 = 5 + 4, got ${g[1].tracking}`);
    assert.ok(approx(g[2].tracking, 14), `glyph 2 = 10 + 4, got ${g[2].tracking}`);
  });
  check('trackingShifts: left-aligned text pushes each glyph by the spacing before it', () => {
    const d = [{ tracking: 5 }, { tracking: 5 }, { tracking: 5 }];
    assert.deepEqual(trackingShifts(d, 'left'), [0, 5, 10]);
  });
  check('trackingShifts: centre text stays centred, right text keeps its right edge', () => {
    const d = [{ tracking: 5 }, { tracking: 5 }, { tracking: 5 }];
    assert.deepEqual(trackingShifts(d, 'center'), [-5, 0, 5]);
    assert.deepEqual(trackingShifts(d, 'right'), [-10, -5, 0]);
  });
  check('trackingShifts: minus the advance collapses a centred line onto one point', () => {
    // 4 glyphs of advance 20, centres 10, 30, 50, 70 (line middle 40).
    const d = Array.from({ length: 4 }, () => ({ tracking: -20 }));
    const sh = trackingShifts(d, 'center');
    [10, 30, 50, 70].forEach((c, j) => assert.ok(approx(c + sh[j], 40), `centre ${c + sh[j]} should collapse to 40`));
  });
  check('trackingShifts: tracking is in em - emPx (the font size) scales it to px', () => {
    const d = [{ tracking: 0.5 }, { tracking: 0.5 }, { tracking: 0.5 }];
    assert.deepEqual(trackingShifts(d, 'left', 48), [0, 24, 48]);
    assert.deepEqual(trackingShifts(d, 'center', 48), [-24, 0, 24]);
  });
  check('trackingShifts: no tracking -> all zeros (the unchanged path)', () => {
    assert.deepEqual(trackingShifts([{ tracking: 0 }, { tracking: 0 }], 'center'), [0, 0]);
  });

  // --- B36: skew, fill colour, seeded scatter ---
  check('skew delta scales by weight and adds across animators (B36)', () => {
    const g = accumulateGlyphDeltas('abc', [
      { splitMode: 'character', selector: sel(), delta: { skew: 20 } },
      { splitMode: 'character', selector: sel(), delta: { skew: -4 } },
    ]);
    assert.ok(approx(g[0].skew, 0) && approx(g[1].skew, 8) && approx(g[2].skew, 16));
  });
  check('fill colour: one mix per selecting animator, in order, weight clamped to 0..1; unselected glyphs carry none (B36)', () => {
    const lime = [0.8, 1, 0.2, 1];
    const red = [1, 0, 0, 1];
    const g = accumulateGlyphDeltas('abc', [
      { splitMode: 'character', selector: sel(), delta: { fillColor: lime } },
      { splitMode: 'character', selector: sel({ amount: -1 }), delta: { fillColor: red } },
    ]);
    assert.equal(g[0].fills, undefined, 'weight 0: no mix (the base colour stays exact)');
    assert.deepEqual(g[1].fills, [{ color: lime, w: 0.5 }], 'a negative weight never mixes');
    assert.deepEqual(g[2].fills, [{ color: lime, w: 1 }]);
  });
  check('scatter: seeded per unit, bounded by the scatter size, scaled by weight, shared across a word (B36)', () => {
    const a = (seed) => ({ splitMode: 'word', selector: sel({ shape: 'square', offset: -2, seed }), delta: { scatter: [100, 50] } });
    const g = accumulateGlyphDeltas('ab cd ef', [a(3)]);
    assert.ok(g.every((x) => Math.abs(x.tx) <= 100 && Math.abs(x.ty) <= 50), 'within +-scatter');
    assert.ok(approx(g[0].tx, g[1].tx) && approx(g[0].ty, g[1].ty), 'one offset per word');
    assert.ok(!approx(g[0].tx, g[3].tx), 'words scatter differently');
    assert.deepEqual(accumulateGlyphDeltas('ab cd ef', [a(3)]), g, 'deterministic');
    const other = accumulateGlyphDeltas('ab cd ef', [a(4)]);
    assert.ok(other.some((x, i) => !approx(x.tx, g[i].tx)), 'a different seed scatters differently');
    const half = accumulateGlyphDeltas('ab cd ef', [{ ...a(3), selector: sel({ shape: 'square', offset: -2, seed: 3, amount: 0.5 }) }]);
    half.forEach((x, i) => assert.ok(approx(x.tx, g[i].tx / 2), 'scaled by weight'));
  });
  check('unitRandom: in [-1, 1), spread over the range, pure', () => {
    const xs = Array.from({ length: 2000 }, (_, i) => unitRandom(7, i, i % 2));
    assert.ok(xs.every((x) => x >= -1 && x < 1));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    assert.ok(Math.abs(mean) < 0.08, `roughly centred (mean ${mean})`);
    assert.ok(xs.some((x) => x > 0.9) && xs.some((x) => x < -0.9), 'covers the range');
    assert.equal(unitRandom(7, 12, 1), unitRandom(7, 12, 1));
  });

  console.log(`\ntext-animator: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
