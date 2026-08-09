// Acceptance harness for the cloner RENDER INTEGRATION (resolveFrame expansion) — separate from
// verify-cloner.mjs, which covers the pure distribution engine. This proves the wiring that was
// broken (crashed the editor + never drew): resolveFrame must expand a cloner into per-instance
// stamps of its source, in z-order, with the source hidden and NO undrawable cloner layer left
// for the renderer to choke on. Run: node scripts/verify-cloner-render.mjs (npm run verify:cloner-render)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'cloner-render-'));
const outfile = join(tmp, 'bundle.mjs');
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const SETTINGS = { width: 1920, height: 1080, frameRate: 30, durationFrames: 100, backgroundColor: [0, 0, 0, 1] };

try {
  await build({
    stdin: {
      contents: `
        export { resolveFrame } from './src/core/interpolation';
        export { createComposition, createRectangleLayer, createTextLayer, uid } from './src/core/factory';
        export { createDefaultCloner, createGridDistribution } from './src/cloner/factory';
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
  const m = await import(pathToFileURL(outfile).href);
  const { resolveFrame, createComposition, createRectangleLayer, uid, createDefaultCloner, createGridDistribution } = m;

  // A 3×4 grid cloner over a rectangle source.
  const buildComp = () => {
    const comp = createComposition('Cloner Test', SETTINGS);
    const src = createRectangleLayer('Box', 400, 300, 80, 50, [1, 0, 0, 1], 100);
    const cloner = createDefaultCloner(uid(), src.id);
    cloner.distribution = createGridDistribution({ countX: 3, countY: 4, spacing: { x: 120, y: 90, z: 0 } });
    comp.layers = [src, cloner];
    return { comp, src, cloner };
  };

  console.log('cloner render integration — acceptance\n');

  check('resolveFrame does not throw on a cloner (the editor crash)', () => {
    const { comp } = buildComp();
    assert.doesNotThrow(() => resolveFrame(comp, 0));
  });

  check('cloner expands to one stamp per grid instance (3×4 = 12)', () => {
    const { comp, cloner } = buildComp();
    const rf = resolveFrame(comp, 0);
    const stamps = rf.layers.filter((l) => l.id.startsWith(cloner.id + '#'));
    assert.equal(stamps.length, 12, `expected 12 stamps, got ${stamps.length}`);
  });

  check('stamps carry the SOURCE content (shape) and are drawable', () => {
    const { comp, cloner } = buildComp();
    const rf = resolveFrame(comp, 0);
    const stamps = rf.layers.filter((l) => l.id.startsWith(cloner.id + '#'));
    for (const s of stamps) {
      assert.equal(s.layerType, 'shape', 'stamp inherits source layerType');
      assert.ok(s.shape, 'stamp has a shape payload (so the renderer can draw it — no crash)');
      assert.ok(Number.isFinite(s.transform.positionX) && Number.isFinite(s.transform.positionY), 'finite position');
    }
  });

  check('NO undrawable cloner layer remains in the resolved frame', () => {
    const { comp } = buildComp();
    const rf = resolveFrame(comp, 0);
    assert.equal(rf.layers.some((l) => l.layerType === 'cloner'), false, 'cloner meta removed');
  });

  check('the source layer is hidden (lives inside the cloner)', () => {
    const { comp, src } = buildComp();
    const rf = resolveFrame(comp, 0);
    assert.equal(rf.layers.some((l) => l.id === src.id), false, 'source not rendered on its own');
  });

  check('instances are spatially distributed (grid, not all stacked)', () => {
    const { comp, cloner } = buildComp();
    const rf = resolveFrame(comp, 0);
    const stamps = rf.layers.filter((l) => l.id.startsWith(cloner.id + '#'));
    const xs = new Set(stamps.map((s) => Math.round(s.transform.positionX)));
    const ys = new Set(stamps.map((s) => Math.round(s.transform.positionY)));
    assert.ok(xs.size >= 3, `≥3 distinct columns (got ${xs.size})`);
    assert.ok(ys.size >= 4, `≥4 distinct rows (got ${ys.size})`);
  });

  check('frame-pure: two resolves of the same frame are identical', () => {
    const { comp, cloner } = buildComp();
    const a = resolveFrame(comp, 0).layers.filter((l) => l.id.startsWith(cloner.id + '#')).map((s) => [s.transform.positionX, s.transform.positionY]);
    const b = resolveFrame(comp, 0).layers.filter((l) => l.id.startsWith(cloner.id + '#')).map((s) => [s.transform.positionX, s.transform.positionY]);
    assert.deepEqual(a, b);
  });

  check('a cloner with a missing source resolves to nothing (no crash)', () => {
    const comp = createComposition('Orphan', SETTINGS);
    const cloner = createDefaultCloner(uid(), 'does-not-exist');
    comp.layers = [cloner];
    let rf;
    assert.doesNotThrow(() => { rf = resolveFrame(comp, 0); });
    assert.equal(rf.layers.some((l) => l.layerType === 'cloner'), false);
    assert.equal(rf.layers.length, 0);
  });

  console.log(`\n✅ ${passed} checks passed`);
} catch (err) {
  console.error('\n❌ verification failed:\n', err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
