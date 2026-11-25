// Acceptance harness for mixed styles inside one text layer (the Bricks "accent word": one word of a
// kinetic title in an italic serif / another colour). Covers the pure span editing in
// src/core/textRuns.ts and the render integration through the real resolveFrame: single-line text
// with differing spans expands into glyph stamps, each in its run's face + fill, laid out with each
// run measured in its own face. Measurement is canvas-only, so a deterministic OffscreenCanvas stub
// stands in (12 px per glyph, 15 px in any "Playfair" face) - the renderer itself is unchanged (it draws
// each stamp as plain text).
// Run: node scripts/verify-text-runs.mjs   (npm run verify:text-runs)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'text-runs-'));
const outfile = join(tmp, 'bundle.mjs');
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const SETTINGS = { width: 1920, height: 1080, frameRate: 30, durationFrames: 60, backgroundColor: [0, 0, 0, 1] };
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

try {
  await build({
    stdin: {
      contents: `
        export * from './src/core/textRuns';
        export { resolveFrame } from './src/core/interpolation';
        export { createComposition, createTextLayer, createProperty, createKeyframe } from './src/core/factory';
        export { defaultRangeSelector } from './src/text/rangeSelector';
        export { matchBundledFace } from './src/engine/fonts';
      `,
      resolveDir: process.cwd(),
      sourcefile: 'entry.ts',
      loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });

  if (typeof globalThis.Worker === 'undefined') {
    globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} set onmessage(_v) {} set onerror(_v) {} };
  }
  globalThis.OffscreenCanvas = class {
    getContext() {
      const ctx = { font: '', measureText: (s) => ({ width: String(s).length * (ctx.font.includes('Playfair') ? 15 : 12) }) };
      return ctx;
    }
  };

  const m = await import(pathToFileURL(outfile).href);
  const { textRunsFromSpans, styleTextRange, clearTextStyles, setBaseSpanStyle, wordRanges, runAt, resolveFrame, createComposition, createTextLayer, createProperty, createKeyframe, defaultRangeSelector, matchBundledFace } = m;

  const WHITE = [1, 1, 1, 1];
  const GOLD = [0.85, 0.65, 0.13, 1];
  const baseStyle = () => ({
    fontFamily: 'Inter', fontWeight: 400, fontStyle: 'normal', fontSize: 64, color: [...WHITE], letterSpacing: 0, lineHeight: 1.2,
    strokeColor: [0, 0, 0, 0], strokeWidth: 0, underline: false, strikethrough: false, textTransform: 'none',
  });
  const ACCENT = { fontFamily: 'Playfair Display', fontStyle: 'italic', color: GOLD };
  const span = (text, style = baseStyle()) => ({ text, style });

  console.log('mixed text styles (accent word) - acceptance\n');

  // ---------- pure span editing ----------
  check('no runs for a single span or for spans that all draw alike (plain path untouched)', () => {
    assert.equal(textRunsFromSpans([span('Hello world')]), null);
    assert.equal(textRunsFromSpans([span('Hello '), span('world')]), null);
  });

  check('styleTextRange splits at the range edges and styles only the range', () => {
    const out = styleTextRange([span('text is easy')], 8, 12, ACCENT);
    assert.deepEqual(out.map((s) => s.text), ['text is ', 'easy']);
    assert.equal(out[1].style.fontFamily, 'Playfair Display');
    assert.equal(out[1].style.fontStyle, 'italic');
    assert.deepEqual(out[1].style.color, GOLD);
    assert.equal(out[0].style.fontFamily, 'Inter');
  });

  check('styleTextRange: a middle range gives 3 spans; the input is not mutated', () => {
    const input = [span('make it smooth now')];
    const out = styleTextRange(input, 8, 14, ACCENT);
    assert.deepEqual(out.map((s) => s.text), ['make it ', 'smooth', ' now']);
    assert.equal(input.length, 1);
    assert.equal(input[0].style.fontFamily, 'Inter');
  });

  check('styleTextRange: restyling back to the base merges the spans again', () => {
    const accented = styleTextRange([span('a b c')], 2, 3, ACCENT);
    assert.equal(accented.length, 3);
    const back = styleTextRange(accented, 2, 3, { fontFamily: 'Inter', fontStyle: 'normal', color: WHITE });
    assert.deepEqual(back.map((s) => s.text), ['a b c']);
  });

  check('styleTextRange: a colour patch drops a gradient fill on the patched part only', () => {
    const grad = { type: 'linear', angle: 0, stops: [] };
    const st = { ...baseStyle(), fill: grad };
    const out = styleTextRange([span('ab cd', st)], 3, 5, { color: GOLD });
    assert.ok(out[0].style.fill, 'untouched part keeps the gradient');
    assert.equal(out[1].style.fill, undefined, 'patched part shows the new colour');
  });

  check('styleTextRange: empty / out-of-range selection returns an equal copy', () => {
    const input = [span('abc')];
    assert.deepEqual(styleTextRange(input, 2, 2, ACCENT), input);
    assert.deepEqual(styleTextRange(input, 10, 20, ACCENT), input);
  });

  check('textRunsFromSpans: runs cover the displayed text (textTransform applied) and merge neighbours', () => {
    const upper = { ...baseStyle(), textTransform: 'uppercase' };
    const spans = [span('so ', upper), span('easy', { ...upper, ...ACCENT }), span(' right', upper)];
    const runs = textRunsFromSpans(spans);
    assert.equal(runs.length, 3);
    assert.deepEqual(runs.map((r) => [r.start, r.end]), [[0, 3], [3, 7], [7, 13]]);
    assert.equal(runs[1].fontFamily, 'Playfair Display');
    assert.equal(runAt(runs, 4), runs[1]);
    assert.equal(runAt(runs, 99), runs[2], 'beyond the end falls back to the last run');
  });

  check('clearTextStyles resets to one span in the base style', () => {
    const out = clearTextStyles(styleTextRange([span('one two three')], 4, 7, ACCENT));
    assert.equal(out.length, 1);
    assert.equal(out[0].text, 'one two three');
    assert.equal(out[0].style.fontFamily, 'Inter');
  });

  check('setBaseSpanStyle restyles every base span but keeps the accent', () => {
    const spans = styleTextRange([span('make it smooth now')], 8, 14, ACCENT);
    const out = setBaseSpanStyle(spans, 'fontFamily', 'Manrope');
    assert.deepEqual(out.map((s) => s.style.fontFamily), ['Manrope', 'Playfair Display', 'Manrope']);
    const single = setBaseSpanStyle([span('x')], 'fontWeight', 700);
    assert.equal(single[0].style.fontWeight, 700);
  });

  check('wordRanges gives whitespace-delimited words with character ranges', () => {
    assert.deepEqual(wordRanges('  hi  there you'), [
      { word: 'hi', start: 2, end: 4 }, { word: 'there', start: 6, end: 11 }, { word: 'you', start: 12, end: 15 },
    ]);
  });

  // ---------- render integration (resolveFrame) ----------
  const buildComp = (spans, animators) => {
    const comp = createComposition('Runs', SETTINGS);
    const layer = createTextLayer('Title', 960, 540, spans.map((s) => s.text).join(''), SETTINGS.durationFrames);
    layer.content.spans = spans;
    if (animators) layer.animators = animators;
    comp.layers = [layer];
    return { comp, layer };
  };
  const stampsOf = (rf, layer) => rf.layers.filter((l) => l.id.startsWith(`${layer.id}#g`)).sort((a, b) => Number(a.id.split('#g')[1]) - Number(b.id.split('#g')[1]));
  // The glyph centre along the line is the stamp's position (its anchor is half its own canvas).
  const centre = (s) => s.transform.positionX;

  check('plain single-style text still renders as ONE layer (no stamps)', () => {
    const { comp, layer } = buildComp([span('Hello world')]);
    const rf = resolveFrame(comp, 0);
    assert.equal(stampsOf(rf, layer).length, 0);
    const whole = rf.layers.find((l) => l.id === layer.id);
    assert.ok(whole && whole.text && whole.text.runs === undefined);
  });

  check('an accent word expands into glyph stamps, each in its run face + colour', () => {
    const { comp, layer } = buildComp(styleTextRange([span('text is easy')], 8, 12, ACCENT));
    const st = stampsOf(resolveFrame(comp, 0), layer);
    assert.equal(st.length, 10, '10 visible glyphs (2 spaces skipped)');
    const accent = st.filter((s) => Number(s.id.split('#g')[1]) >= 8);
    const plain = st.filter((s) => Number(s.id.split('#g')[1]) < 8);
    for (const s of accent) {
      assert.equal(s.text.fontFamily, 'Playfair Display');
      assert.equal(s.text.fontStyle, 'italic');
      assert.deepEqual(s.text.fillColor, GOLD);
      assert.equal(s.text.runs, undefined, 'a stamp is plain run-less text');
    }
    for (const s of plain) {
      assert.equal(s.text.fontFamily, 'Inter');
      assert.deepEqual(s.text.fillColor, WHITE);
    }
  });

  check('layout: each run is measured in its own face (accent glyphs are 15 px apart, base 12 px)', () => {
    const { comp, layer } = buildComp(styleTextRange([span('ab cd')], 3, 5, ACCENT));
    const st = stampsOf(resolveFrame(comp, 0), layer);
    const xs = st.map(centre);
    assert.equal(xs.length, 4);
    assert.ok(approx(xs[1] - xs[0], 12), `base advance ${xs[1] - xs[0]}`);
    assert.ok(approx(xs[3] - xs[2], 15), `accent advance ${xs[3] - xs[2]}`);
    // 'b' centre (6 + 12) to 'c' centre (36 + 7.5): space (12) + half of each glyph.
    assert.ok(approx(xs[2] - xs[1], 6 + 12 + 7.5), `gap over the space ${xs[2] - xs[1]}`);
  });

  check('centred mixed text stays centred on the layer (line midpoint unchanged by the wider run)', () => {
    const { comp, layer } = buildComp(styleTextRange([span('ab cd')], 3, 5, ACCENT));
    layer.layoutConfig.horizontalAlign = 'center';
    const st = stampsOf(resolveFrame(comp, 0), layer);
    const mid = (centre(st[0]) - 6 + centre(st[3]) + 7.5) / 2;
    // Same text in one style, forced through the stamp path by a no-op animator: its line midpoint.
    const noop = { enabled: true, splitMode: 'character', selector: { ...defaultRangeSelector(), amount: 0 }, delta: { position: [0, 0] } };
    const plain = buildComp([span('ab cd')], [noop]);
    plain.layer.layoutConfig.horizontalAlign = 'center';
    const ps = stampsOf(resolveFrame(plain.comp, 0), plain.layer);
    const plainMid = (centre(ps[0]) - 6 + centre(ps[3]) + 6) / 2;
    assert.ok(approx(mid, plainMid), `mixed line midpoint ${mid} vs single-style ${plainMid}`);
  });

  check('wrapped / multi-line mixed text falls back to one whole-layer render (no wrong placement)', () => {
    const { comp, layer } = buildComp(styleTextRange([span('line one\nline two')], 0, 4, ACCENT));
    const rf = resolveFrame(comp, 0);
    assert.equal(stampsOf(rf, layer).length, 0);
    assert.ok(rf.layers.find((l) => l.id === layer.id)?.text?.runs, 'runs still resolved on the layer');
  });

  check('accent + animator: stamps carry both the run style and the animator delta', () => {
    const offset = createProperty('Animator Offset', 'number', 0);
    offset.keyframes = [createKeyframe(0, -0.3, 'linear'), createKeyframe(30, 1, 'linear')];
    const anim = { enabled: true, splitMode: 'word', selector: { ...defaultRangeSelector(), shape: 'rampUp', start: 0, end: 0.3 }, offset, delta: { position: [0, 80], opacity: -1 } };
    const { comp, layer } = buildComp(styleTextRange([span('so easy')], 3, 7, ACCENT), [anim]);
    const settled = stampsOf(resolveFrame(comp, 45), layer);
    assert.equal(settled.length, 6);
    const e = settled.find((s) => s.id.endsWith('#g3'));
    assert.equal(e.text.fontFamily, 'Playfair Display');
    // Frame 26: the accent word (word 1) is mid-reveal (selector weight ~0.58).
    const mid = stampsOf(resolveFrame(comp, 26), layer).find((s) => s.id.endsWith('#g3'));
    assert.ok(mid && mid.transform.opacity > 0 && mid.transform.opacity < 1, `accent glyph mid-fade (opacity ${mid?.transform.opacity})`);
    assert.equal(mid.text.fontFamily, 'Playfair Display');
  });

  check('B52 faces: an italic Playfair accent draws the bundled TRUE italic (no synthesized oblique); a 600 Inter accent the real 600 face', () => {
    const spans = styleTextRange(styleTextRange([span('make it smooth now')], 8, 14, ACCENT), 15, 18, { fontWeight: 600 });
    const { comp, layer } = buildComp(spans);
    const st = stampsOf(resolveFrame(comp, 0), layer);
    const face = (s) => matchBundledFace(s.text.fontFamily, s.text.fontWeight, s.text.fontStyle);
    const accent = st.filter((s) => s.text.fontFamily === 'Playfair Display');
    assert.equal(accent.length, 6);
    for (const s of accent) {
      const f = face(s);
      assert.equal(f.url, '/fonts/playfair-display-400-italic.woff');
      assert.equal(f.italic, true);
      assert.equal(f.syntheticOblique, false);
    }
    const semibold = st.filter((s) => s.text.fontWeight === 600);
    assert.equal(semibold.length, 3);
    for (const s of semibold) assert.equal(face(s).url, '/fonts/inter-600.woff');
    const base = st.find((s) => s.id.endsWith('#g0'));
    assert.equal(face(base).url, '/fonts/inter-400.woff');
  });

  console.log(`\ntext-runs: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
