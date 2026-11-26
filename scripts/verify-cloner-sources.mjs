// Acceptance harness for B60: cloner per-instance sources. resolveFrame expands a cloner into stamps of its
// resolved source; with `sources` set, stamp i is a stamp of sources[i mod n] (a ring of different photos).
// Pure node (esbuild bundle of the real TS); the GPU proof is gpu:cloner-sources (render_frame via the MCP).
//   node scripts/verify-cloner-sources.mjs   (or: npm run verify:cloner-sources)
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} set onmessage(_v) {} set onerror(_v) {} };

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
        export { createComposition, createRectangleLayer, createTransform } from './src/core/factory';
        export { validateComposition } from './src/project-system/services/validation';
      `,
      resolveDir: process.cwd(), sourcefile: 'entry.ts', loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  const { resolveFrame, createComposition, createRectangleLayer, createTransform, validateComposition } = await import(pathToFileURL(outfile).href);

  console.log('verify:cloner-sources');
  const RED = [1, 0, 0, 1], GREEN = [0, 1, 0, 1], BLUE = [0, 0, 1, 1];
  const mk = (sources) => {
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

  console.log(`\ncloner-sources: all ${passed} checks passed`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
