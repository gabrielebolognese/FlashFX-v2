// Acceptance harness for B77: hold keyframes on a text layer's face (core/textStyleKeys.ts) and their
// integration in resolveFrame (the face switches on the key frame, before the first key the stored style
// shows) + persistence. Pure node (esbuild bundle of the real TS). GPU proof: gpu:text-style-keys.
//   node scripts/verify-text-style-keys.mjs   (or: npm run verify:text-style-keys)
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} set onmessage(_v) {} set onerror(_v) {} };
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return { font: '', textBaseline: 'top', measureText: (s) => ({ width: s.length * 10, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }), setTransform() {}, fillText() {}, strokeText() {}, fillRect() {} }; } };

const tmp = mkdtempSync(join(tmpdir(), 'text-style-keys-verify-'));
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

try {
  const outfile = join(tmp, 'bundle.mjs');
  await build({
    stdin: {
      contents: `
        export * from './src/core/textStyleKeys';
        export { resolveFrame } from './src/core/interpolation';
        export { createComposition, createTextLayer } from './src/core/factory';
        export { validateComposition } from './src/project-system/services/validation';
      `,
      resolveDir: process.cwd(), sourcefile: 'entry.ts', loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  const { normalizeTextStyleKeys, styleKeyAt, withTextStyleKeys, resolveFrame, createComposition, createTextLayer, validateComposition } = await import(pathToFileURL(outfile).href);
  console.log('verify:text-style-keys');
  const BASE = { fontFamily: 'Inter', fontWeight: 400, fontStyle: 'normal' };

  check('normalize: sorted, one key per frame, missing fields inherited from the previous face, weights snapped', () => {
    const sk = normalizeTextStyleKeys({ keys: [{ frame: 20, fontWeight: 712 }, { frame: 10, fontFamily: 'Instrument Serif', fontStyle: 'italic' }, { frame: 10.4, fontFamily: 'Playfair Display' }, { frame: 'x' }] }, BASE);
    assert.deepEqual(sk.keys, [
      { frame: 10, fontFamily: 'Playfair Display', fontWeight: 400, fontStyle: 'normal' },
      { frame: 20, fontFamily: 'Playfair Display', fontWeight: 700, fontStyle: 'normal' },
    ]);
    assert.equal(normalizeTextStyleKeys({ keys: [] }, BASE), null);
    assert.equal(normalizeTextStyleKeys('nope', BASE), null);
    assert.equal(normalizeTextStyleKeys({ keys: [{ frame: 0, fontFamily: 'Inter' }], spanIndex: 2 }, BASE).spanIndex, 2);
  });
  check('styleKeyAt: hold semantics (last key at or before the frame; null before the first)', () => {
    const keys = normalizeTextStyleKeys([{ frame: 10, fontFamily: 'A' }, { frame: 20, fontFamily: 'B' }], BASE).keys;
    assert.equal(styleKeyAt(keys, 9), null);
    assert.equal(styleKeyAt(keys, 10).fontFamily, 'A');
    assert.equal(styleKeyAt(keys, 19).fontFamily, 'A');
    assert.equal(styleKeyAt(keys, 20).fontFamily, 'B');
    assert.equal(styleKeyAt(keys, 999).fontFamily, 'B');
  });

  const comp = createComposition('c', { width: 1920, height: 1080, frameRate: 30, durationFrames: 60, backgroundColor: [0, 0, 0, 1] });
  const t = createTextLayer('type', 960, 540, 'Typeface', 60, [1, 1, 1, 1]);
  t.styleKeys = normalizeTextStyleKeys([{ frame: 10, fontFamily: 'Instrument Serif', fontStyle: 'italic' }, { frame: 20, fontFamily: 'Playfair Display', fontWeight: 700, fontStyle: 'normal' }], t.content.spans[0].style);
  comp.layers = [t];
  const face = (f) => { const r = resolveFrame(comp, f).layers.find((l) => l.text).text; return `${r.fontFamily}|${r.fontWeight}|${r.fontStyle}`; };
  const stored = `${t.content.spans[0].style.fontFamily}|${t.content.spans[0].style.fontWeight}|${t.content.spans[0].style.fontStyle}`;

  check('resolveFrame: stored face before the first key, then each key holds until the next', () => {
    assert.equal(face(0), stored);
    assert.equal(face(9), stored);
    assert.equal(face(10), 'Instrument Serif|' + t.content.spans[0].style.fontWeight + '|italic');
    assert.equal(face(19), face(10));
    assert.equal(face(20), 'Playfair Display|700|normal');
    assert.equal(face(59), face(20));
  });
  check('withTextStyleKeys: stored layer untouched, same object without keys / before the first key; spanIndex limits it', () => {
    const at = withTextStyleKeys(t, 25);
    assert.equal(at.content.spans[0].style.fontFamily, 'Playfair Display');
    assert.notEqual(t.content.spans[0].style.fontFamily, 'Playfair Display');
    assert.equal(withTextStyleKeys(t, 3), t);
    const plain = createTextLayer('p', 0, 0, 'x', 30, [1, 1, 1, 1]);
    assert.equal(withTextStyleKeys(plain, 5), plain);
    const two = { ...t, content: { spans: [t.content.spans[0], { ...t.content.spans[0], text: ' two' }] }, styleKeys: { ...t.styleKeys, spanIndex: 1 } };
    const r = withTextStyleKeys(two, 25);
    assert.equal(r.content.spans[0].style.fontFamily, t.content.spans[0].style.fontFamily);
    assert.equal(r.content.spans[1].style.fontFamily, 'Playfair Display');
  });
  check('validation keeps the style keys through save / load and drops junk', () => {
    const back = validateComposition(JSON.parse(JSON.stringify(comp)));
    assert.deepEqual(back.layers[0].styleKeys, t.styleKeys);
    const junk = JSON.parse(JSON.stringify(comp)); junk.layers[0].styleKeys = { keys: 'x' };
    assert.equal('styleKeys' in validateComposition(junk).layers[0], false);
  });

  console.log(`\ntext-style-keys: all ${passed} checks passed`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
