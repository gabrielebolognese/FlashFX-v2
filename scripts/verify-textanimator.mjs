// Acceptance harness for the per-character text-animation core (src/core/textAnimator.ts). Pins the
// split-unit assignment and the selector-weighted delta accumulation so future changes can't quietly
// break per-glyph animation. The glyph PLACEMENT (canvas measurement) is browser-only and not covered
// here — this proves the pure math. No test runner in this repo (see CLAUDE.md); bundles the real TS
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
  const { splitTextUnits, accumulateGlyphDeltas } = await import(pathToFileURL(outfile).href);

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
  check('multiple animators stack (position adds)', () => {
    const g = accumulateGlyphDeltas('abc', [
      { splitMode: 'character', selector: sel(), delta: { position: [10, 0] } },
      { splitMode: 'character', selector: sel(), delta: { position: [0, 20] } },
    ]);
    assert.ok(approx(g[2].tx, 10) && approx(g[2].ty, 20));
  });
  check('zero weight leaves the identity delta untouched', () => {
    const g = accumulateGlyphDeltas('abc', [{ splitMode: 'character', selector: sel(), delta: { position: [10, 5], rotation: 90, scale: [1, 1], opacity: -1 } }]);
    assert.deepEqual(g[0], { tx: 0, ty: 0, sx: 1, sy: 1, rotation: 0, opacity: 1 });
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

  console.log(`\ntext-animator: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
