// Acceptance harness for B60: cloner per-instance sources. resolveFrame expands a cloner into stamps of its
// resolved source; with `sources` set, stamp i is a stamp of sources[i mod n] (a ring of different photos).
// Follow-up checks (7-12): extra sources keep their own scale / rotation / opacity relative to the main source's
// settled transform, the seeded 'random' source order, data-bound copies drawing their own content (text rows),
// and save / load of the order + seed.
// Pure node (esbuild bundle of the real TS); the GPU proof is gpu:cloner-sources (render_frame via the MCP).
//   node scripts/verify-cloner-sources.mjs   (or: npm run verify:cloner-sources)
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} set onmessage(_v) {} set onerror(_v) {} };
// textAtlas measures with OffscreenCanvas; node has none. A fixed-advance stub is enough for resolveFrame.
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return { font: '', textBaseline: 'top', measureText: (s) => ({ width: s.length * 10, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }), setTransform() {}, fillText() {}, strokeText() {}, fillRect() {} }; } };

const tmp = mkdtempSync(join(tmpdir(), 'cloner-sources-verify-'));
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const SETTINGS = { width: 1920, height: 1080, frameRate: 30, durationFrames: 100, backgroundColor: [0, 0, 0, 1] };

try {
  const outfile = join(tmp, 'bundle.mjs');
  await build({
    stdin: {
      contents: `
        export { resolveFrame } from './src/core/interpolation';
        export { createComposition, createRectangleLayer, createTransform, createTextLayer, createKeyframe } from './src/core/factory';
        export { pickSourceSlot, settledFrame } from './src/cloner/sources';
        export { validateComposition } from './src/project-system/services/validation';
      `,
      resolveDir: process.cwd(), sourcefile: 'entry.ts', loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  const { resolveFrame, createComposition, createRectangleLayer, createTransform, createTextLayer, createKeyframe, pickSourceSlot, settledFrame, validateComposition } = await import(pathToFileURL(outfile).href);

  console.log('verify:cloner-sources');
  const RED = [1, 0, 0, 1], GREEN = [0, 1, 0, 1], BLUE = [0, 0, 1, 1];
  const mk = (sources, extra = {}) => {
    const comp = createComposition('c', { ...SETTINGS });
    const src = createRectangleLayer('src', 100, 100, 80, 80, RED, 100); src.id = 'src';
    const s2 = createRectangleLayer('s2', 100, 300, 80, 80, GREEN, 100); s2.id = 's2';
    const s3 = createRectangleLayer('s3', 100, 500, 80, 80, BLUE, 100); s3.id = 's3';
    const below = createRectangleLayer('below', 960, 900, 300, 50, [1, 1, 1, 1], 100); below.id = 'below';
    const cloner = {
      ...createRectangleLayer('cl', 0, 0, 1, 1, RED, 100),
      id: 'cl', type: 'cloner', name: 'cl', transform: createTransform(0, 0),
      sourceRef: { type: 'layer', layerId: 'src' },
      distribution: { type: 'grid', countX: 7, countY: 1, countZ: 1, spacing: { x: 200, y: 0, z: 0 }, origin: { x: 300, y: 540, z: 0 }, rowOffset: 0 },
      effectors: [], stagger: { delaySeconds: 0 }, renderCount: 500,
      ...(sources ? { sources } : {}),
      ...extra,
    };
    delete cloner.shape;
    comp.layers = [below, src, s2, s3, cloner];
    return comp;
  };
  const stampsOf = (rf) => rf.layers.filter((l) => l.id.startsWith('cl#'));
  const colourOf = (l) => JSON.stringify(l.shape.fillColor);

  check('without sources every stamp is the sourceRef layer (old behaviour) and the other layers still draw', () => {
    const rf = resolveFrame(mk(undefined), 0);
    const st = stampsOf(rf);
    assert.equal(st.length, 7);
    assert.ok(st.every((l) => colourOf(l) === JSON.stringify(RED)));
    assert.ok(rf.layers.some((l) => l.id === 's2') && rf.layers.some((l) => l.id === 's3'), 'unlisted layers are not hidden');
    assert.ok(!rf.layers.some((l) => l.id === 'src'), 'the main source is hidden');
  });
  check('sources [src, s2, s3]: stamp i draws sources[i mod 3], at the same instance transforms as one source', () => {
    const rf = resolveFrame(mk(['src', 's2', 's3']), 0);
    const st = stampsOf(rf);
    assert.deepEqual(st.map(colourOf), [RED, GREEN, BLUE, RED, GREEN, BLUE, RED].map((c) => JSON.stringify(c)));
    // Instance transforms (distribution + the main source's own animation) are exactly the single-source ones.
    const one = stampsOf(resolveFrame(mk(undefined), 0));
    assert.deepEqual(st.map((l) => l.transform), one.map((l) => l.transform));
    const xs = st.map((l) => l.transform.positionX);
    assert.ok(xs.every((x, i) => i === 0 || Math.abs(x - xs[i - 1] - 200) < 1e-6), `spacing ${xs}`);
  });
  check('every listed source is hidden (lives inside the cloner); the layer below keeps its place under the stamps', () => {
    const rf = resolveFrame(mk(['src', 's2', 's3']), 0);
    assert.ok(!rf.layers.some((l) => ['src', 's2', 's3'].includes(l.id)));
    const ids = rf.layers.map((l) => l.id);
    assert.equal(ids[0], 'below');
    assert.equal(ids.length, 1 + 7);
  });
  check('a single listed source replaces the main one for every stamp; unknown ids are skipped', () => {
    assert.ok(stampsOf(resolveFrame(mk(['s2']), 0)).every((l) => colourOf(l) === JSON.stringify(GREEN)));
    assert.deepEqual(stampsOf(resolveFrame(mk(['nope', 's3', 's2']), 0)).slice(0, 2).map(colourOf), [BLUE, GREEN].map((c) => JSON.stringify(c)));
  });
  check('an empty list = one source (old behaviour)', () => {
    assert.ok(stampsOf(resolveFrame(mk([]), 0)).every((l) => colourOf(l) === JSON.stringify(RED)));
  });
  check('validation keeps the sources list through save / load (strings only)', () => {
    const back = validateComposition(JSON.parse(JSON.stringify(mk(['src', 's2', 's3']))));
    assert.deepEqual(back.layers.find((l) => l.type === 'cloner').sources, ['src', 's2', 's3']);
    const junk = mk(['s2']); junk.layers[4].sources = ['s2', 4, null];
    assert.deepEqual(validateComposition(JSON.parse(JSON.stringify(junk))).layers.find((l) => l.type === 'cloner').sources, ['s2']);
    assert.equal('sources' in validateComposition(JSON.parse(JSON.stringify(mk(undefined)))).layers.find((l) => l.type === 'cloner'), false);
  });

  const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);
  const setStatic = (prop, v) => { prop.defaultValue = v; prop.keyframes = []; };

  check('an extra source keeps its own scale / rotation / opacity relative to the main source; the main source copies are unchanged', () => {
    const comp = mk(['src', 's2', 's3']);
    const s2 = comp.layers.find((l) => l.id === 's2');
    setStatic(s2.transform.scale, [0.5, 0.25]); setStatic(s2.transform.rotation, 30); setStatic(s2.transform.opacity, 0.5);
    const st = stampsOf(resolveFrame(comp, 0));
    const one = stampsOf(resolveFrame(mk(undefined), 0));
    // copies 1 and 4 draw s2: half / quarter size, +30 deg, half opacity, same position
    for (const i of [1, 4]) {
      near(st[i].transform.scaleX, one[i].transform.scaleX * 0.5, `copy ${i} scaleX`);
      near(st[i].transform.scaleY, one[i].transform.scaleY * 0.25, `copy ${i} scaleY`);
      near(st[i].transform.rotation, one[i].transform.rotation + 30, `copy ${i} rotation`);
      near(st[i].transform.opacity, one[i].transform.opacity * 0.5, `copy ${i} opacity`);
      near(st[i].transform.positionX, one[i].transform.positionX, `copy ${i} x`);
    }
    // copies of the main source and of s3 (same transform as the main source) are byte-identical to one source
    for (const i of [0, 2, 3, 5, 6]) assert.deepEqual(st[i].transform, one[i].transform, `copy ${i}`);
  });
  check('the main source\'s intro pop is not divided out: relative to its SETTLED scale, an extra source pops with it at its own size', () => {
    const comp = mk(['src', 's2']);
    const src = comp.layers.find((l) => l.id === 'src');
    src.transform.scale.keyframes = [createKeyframe(0, [0, 0]), createKeyframe(20, [2, 2])];
    setStatic(comp.layers.find((l) => l.id === 's2').transform.scale, [1, 1]);
    assert.equal(settledFrame(src.transform), 20);
    const st = stampsOf(resolveFrame(comp, 10));
    // frame 10: the main source is at scale 1 (half way to 2); s2 is half the main source's settled size
    near(st[0].transform.scaleX, 1, 'main copy mid-pop');
    near(st[1].transform.scaleX, 0.5, 's2 copy mid-pop (1 x 1/2)');
    near(stampsOf(resolveFrame(comp, 0))[1].transform.scaleX, 0, 's2 copy at the pop start');
  });
  check('random source order: seeded, scrub-stable, uses every source, differs from cycle; cycle = i mod n', () => {
    const picks = (seed) => Array.from({ length: 48 }, (_, i) => pickSourceSlot(i, 3, 'random', seed));
    const a = picks(7);
    assert.deepEqual(a, picks(7), 'same seed, same picks');
    assert.ok(a.every((k) => k >= 0 && k < 3));
    assert.deepEqual([...new Set(a)].sort(), [0, 1, 2], 'every source is used');
    assert.notDeepEqual(a, Array.from({ length: 48 }, (_, i) => i % 3), 'not the cycle');
    assert.notDeepEqual(a, picks(8), 'another seed reshuffles');
    assert.deepEqual(Array.from({ length: 7 }, (_, i) => pickSourceSlot(i, 3, undefined, undefined)), [0, 1, 2, 0, 1, 2, 0]);
    assert.equal(pickSourceSlot(5, 0, 'random', 1), -1);
    // through resolveFrame: stamp colours follow the seeded picks, and the same frame resolves the same way twice
    const comp = mk(['src', 's2', 's3'], { sourceOrder: 'random', sourceSeed: 7 });
    const cols = stampsOf(resolveFrame(comp, 0)).map(colourOf);
    const want = a.slice(0, 7).map((k) => JSON.stringify([RED, GREEN, BLUE][k]));
    assert.deepEqual(cols, want);
    assert.deepEqual(stampsOf(resolveFrame(comp, 0)).map(colourOf), cols);
  });
  const mkText = (binding, sources) => {
    const comp = createComposition('t', { ...SETTINGS });
    const t = createTextLayer('word', 0, 0, 'Word', 100); t.id = 'word';
    const other = createRectangleLayer('other', 0, 0, 80, 80, GREEN, 100); other.id = 'other';
    const cloner = {
      ...createRectangleLayer('cl', 0, 0, 1, 1, RED, 100),
      id: 'cl', type: 'cloner', name: 'cl', transform: createTransform(0, 0),
      sourceRef: { type: 'layer', layerId: 'word' },
      distribution: { type: 'radial', count: 5, radius: 300, arcDegrees: 360, startAngleDegrees: 0, orientToCenter: false, center: { x: 960, y: 540, z: 0 } },
      effectors: [], stagger: { delaySeconds: 0 }, renderCount: 500,
      ...(binding ? { dataBinding: binding } : {}), ...(sources ? { sources } : {}),
    };
    delete cloner.shape;
    comp.layers = [t, other, cloner];
    return comp;
  };
  const textOf = (l) => l.text?.content;
  check('data-bound copies draw their own content: copy i shows row i mod rows (a ring of different words)', () => {
    const binding = { data: [{ w: 'Alpha' }, { w: 'Beta' }, { w: 'Gamma' }], bindings: [{ propertyPath: 'content.spans.0.text', dataKey: 'w' }] };
    const st = stampsOf(resolveFrame(mkText(binding), 0));
    assert.deepEqual(st.map(textOf), ['Alpha', 'Beta', 'Gamma', 'Alpha', 'Beta']);
    const plain = stampsOf(resolveFrame(mkText(undefined), 0));
    assert.deepEqual(plain.map(textOf), ['Word', 'Word', 'Word', 'Word', 'Word'], 'no binding = the source text');
    assert.deepEqual(st.map((l) => l.transform), plain.map((l) => l.transform), 'binding changes content, not the instance transforms');
    assert.ok(!resolveFrame(mkText(binding), 0).layers.some((l) => l.id === 'word'), 'the source stays hidden');
    // explicit sources win over the binding
    const both = stampsOf(resolveFrame(mkText(binding, ['word', 'other']), 0));
    assert.equal(textOf(both[0]), 'Word');
    assert.ok(both[1].shape && !both[1].text);
  });
  check('validation keeps sourceOrder "random" + an integer seed; "cycle" / junk are dropped', () => {
    const back = validateComposition(JSON.parse(JSON.stringify(mk(['src', 's2'], { sourceOrder: 'random', sourceSeed: 12.7 }))));
    const c = back.layers.find((l) => l.type === 'cloner');
    assert.equal(c.sourceOrder, 'random'); assert.equal(c.sourceSeed, 12);
    const c2 = validateComposition(JSON.parse(JSON.stringify(mk(['src'], { sourceOrder: 'cycle', sourceSeed: 'x' })))).layers.find((l) => l.type === 'cloner');
    assert.equal('sourceOrder' in c2, false); assert.equal('sourceSeed' in c2, false);
  });

  console.log(`\ncloner-sources: all ${passed} checks passed`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
