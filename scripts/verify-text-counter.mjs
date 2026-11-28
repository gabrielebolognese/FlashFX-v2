// Acceptance harness for B75: the styled number counter on a text layer (core/textCounter.ts) and its
// integration in resolveFrame (the counter span is rewritten per frame, other spans keep their text and
// style) + persistence. Pure node (esbuild bundle of the real TS). GPU proof: gpu:text-counter.
//   node scripts/verify-text-counter.mjs   (or: npm run verify:text-counter)
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} set onmessage(_v) {} set onerror(_v) {} };
// textAtlas measures with OffscreenCanvas; node has none. A fixed-advance stub is enough for resolveFrame.
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return { font: '', textBaseline: 'top', measureText: (s) => ({ width: s.length * 10, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }), setTransform() {}, fillText() {}, strokeText() {}, fillRect() {} }; } };

const tmp = mkdtempSync(join(tmpdir(), 'text-counter-verify-'));
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

try {
  const outfile = join(tmp, 'bundle.mjs');
  await build({
    stdin: {
      contents: `
        export * from './src/core/textCounter';
        export { resolveFrame } from './src/core/interpolation';
        export { createComposition, createTextLayer } from './src/core/factory';
        export { validateComposition } from './src/project-system/services/validation';
      `,
      resolveDir: process.cwd(), sourcefile: 'entry.ts', loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  const m = await import(pathToFileURL(outfile).href);
  const { normalizeTextCounter, counterValueAt, formatCounterNumber, counterTextAt, withTextCounter, resolveFrame, createComposition, createTextLayer, validateComposition } = m;
  const C = (o) => normalizeTextCounter({ from: 0, to: 100, startFrame: 0, endFrame: 30, ...o });

  console.log('verify:text-counter');
  check('formatting: separators, decimal mark, decimals, negatives', () => {
    assert.equal(formatCounterNumber(1234567, C({})), '1,234,567');
    assert.equal(formatCounterNumber(1234567.891, C({ decimals: 2, separator: '.', decimalMark: ',' })), '1.234.567,89');
    assert.equal(formatCounterNumber(1234567, C({ separator: '' })), '1234567');
    assert.equal(formatCounterNumber(999, C({})), '999');
    assert.equal(formatCounterNumber(-4200, C({ separator: ' ' })), '-4 200');
    assert.equal(formatCounterNumber(-0.2, C({})), '0');
  });
  check('compact: 10K / 1.2M / 3.4B, trailing zeros trimmed, rounding never shows 1000K, lowercase option', () => {
    const c = C({ compact: true });
    assert.equal(formatCounterNumber(950, c), '950');
    assert.equal(formatCounterNumber(10000, c), '10K');
    assert.equal(formatCounterNumber(12345, c), '12.3K');
    assert.equal(formatCounterNumber(1200000, c), '1.2M');
    assert.equal(formatCounterNumber(999960, c), '1M');
    assert.equal(formatCounterNumber(3.4e9, c), '3.4B');
    assert.equal(formatCounterNumber(1500, C({ compact: true, compactUpper: false })), '1.5k');
    assert.equal(formatCounterNumber(1234567, C({ compact: true, compactDecimals: 2 })), '1.23M');
  });
  check('value over time: clamped outside [start, end], eased (cubicOut default, cubic-bezier quad), stepped', () => {
    const c = C({ startFrame: 10, endFrame: 40 });
    assert.equal(counterValueAt(c, 0), 0);
    assert.equal(counterValueAt(c, 10), 0);
    assert.equal(counterValueAt(c, 40), 100);
    assert.equal(counterValueAt(c, 99), 100);
    const mid = counterValueAt(c, 25);
    assert.ok(Math.abs(mid - 87.5) < 1e-9, `cubicOut mid ${mid}`);
    const lin = C({ ease: 'linear' });
    assert.ok(Math.abs(counterValueAt(lin, 15) - 50) < 1e-9);
    const bez = C({ ease: [0, 0, 1, 1] });
    assert.ok(Math.abs(counterValueAt(bez, 15) - 50) < 1e-6);
    const st = C({ ease: 'linear', stepFrames: 5 });
    assert.equal(counterValueAt(st, 7), counterValueAt(st, 5));
    assert.ok(counterValueAt(st, 10) > counterValueAt(st, 9));
  });
  check('counterTextAt: prefix + number + suffix (r08 "+1.2M views")', () => {
    const c = C({ from: 10000, to: 1200000, compact: true, prefix: '+', suffix: ' views', ease: 'linear' });
    assert.equal(counterTextAt(c, 0), '+10K views');
    assert.equal(counterTextAt(c, 30), '+1.2M views');
  });
  check('normalize: junk is clamped / defaulted, non-objects refused', () => {
    assert.equal(normalizeTextCounter(null), null);
    assert.equal(normalizeTextCounter([1]), null);
    const n = normalizeTextCounter({ from: 'x', to: 5, startFrame: 20, endFrame: 3, decimals: 99, stepFrames: -2, ease: [1, 2] });
    assert.deepEqual([n.from, n.to, n.startFrame, n.endFrame, n.decimals, n.stepFrames, 'ease' in n], [0, 5, 20, 20, 6, 1, false]);
  });

  const comp = createComposition('c', { width: 1920, height: 1080, frameRate: 30, durationFrames: 60, backgroundColor: [0, 0, 0, 1] });
  const t = createTextLayer('views', 960, 540, '+', 60, [1, 1, 1, 1]);
  t.content.spans = [{ text: '+', style: { ...t.content.spans[0].style, fontWeight: 700 } }, { text: '0', style: { ...t.content.spans[0].style, fontStyle: 'italic' } }, { text: ' views', style: { ...t.content.spans[0].style } }];
  t.counter = C({ from: 10000, to: 1200000, compact: true, spanIndex: 1, ease: 'linear' });
  comp.layers = [t];

  check('withTextCounter: only the counter span is rewritten; the stored layer is untouched; no counter = same object', () => {
    const at = withTextCounter(t, 30);
    assert.deepEqual(at.content.spans.map((s) => s.text), ['+', '1.2M', ' views']);
    assert.equal(at.content.spans[1].style.fontStyle, 'italic');
    assert.equal(at.content.spans[0].style.fontWeight, 700);
    assert.equal(t.content.spans[1].text, '0');
    const plain = createTextLayer('p', 0, 0, 'hi', 30, [1, 1, 1, 1]);
    assert.equal(withTextCounter(plain, 5), plain);
    const off = { ...t, counter: { ...t.counter, enabled: false } };
    assert.equal(withTextCounter(off, 5), off);
  });
  check('resolveFrame: the resolved text reads the counter value per frame; scrubbing is identical', () => {
    // Mixed-style spans resolve as per-glyph stamps: read every stamp of the layer, in order.
    const txt = (f) => resolveFrame(comp, f).layers.filter((l) => l.text && l.id.startsWith(t.id)).map((l) => l.text.content).join('');
    // (blank glyphs draw no stamp, so the joined stamps carry no spaces)
    assert.equal(txt(0), '+10Kviews');
    assert.equal(txt(30), '+1.2Mviews');
    const a = txt(17); txt(3); txt(29);
    assert.equal(txt(17), a);
  });
  check('validation keeps the counter through save / load and drops junk', () => {
    const back = validateComposition(JSON.parse(JSON.stringify(comp)));
    assert.deepEqual(back.layers[0].counter, t.counter);
    const junk = JSON.parse(JSON.stringify(comp)); junk.layers[0].counter = 'nope';
    assert.equal('counter' in validateComposition(junk).layers[0], false);
  });

  console.log(`\ntext-counter: all ${passed} checks passed`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
