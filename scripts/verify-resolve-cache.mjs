// Acceptance harness for resolveFrame's structural cache (core/interpolation.ts).
//
// Proves the cache is correct: parenting/group data resolves through the cached
// layer map, repeated resolves of a stable composition are identical (no cross-call
// corruption), a track-only edit (same layers array, new tracks array) correctly
// invalidates it, and distinct compositions don't share a cache entry.
// Run: node scripts/verify-resolve-cache.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'resolvecache-verify-'));
const outfile = join(tmp, 'rc.mjs');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const SETTINGS = { width: 1920, height: 1080, frameRate: 30, durationFrames: 100, backgroundColor: [0, 0, 0, 1] };
const track = (id, order, over = {}) => ({ id, name: id, type: 'shape', order, locked: false, visible: true, ...over });
const has = (rf, id) => rf.layers.some((l) => l.id === id);
const worldPos = (rf, id) => {
  const l = rf.layers.find((x) => x.id === id);
  return l ? [l.transform.positionX, l.transform.positionY] : null;
};

try {
  await build({
    stdin: {
      contents: `
        export { resolveFrame } from './src/core/interpolation';
        export { createComposition, createRectangleLayer } from './src/core/factory';
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
  const { resolveFrame, createComposition, createRectangleLayer } = await import(pathToFileURL(outfile).href);

  check('parenting resolves through the cached layer map', () => {
    const comp = createComposition('c', { ...SETTINGS });
    const parent = createRectangleLayer('p', 100, 100, 50, 50, [1, 0, 0, 1], 100);
    const child = createRectangleLayer('ch', 30, 40, 20, 20, [0, 1, 0, 1], 100);
    child.parentId = parent.id;
    comp.layers = [parent, child];
    // If the parent weren't found via the cached _layerById, the child would resolve
    // at its local (30,40); parenting offsets it by the parent's (100,100).
    const cp = worldPos(resolveFrame(comp, 0), child.id);
    assert.ok(cp && near(cp[0], 130) && near(cp[1], 140), `child world ${cp}`);
  });

  check('repeated resolves of a stable composition are identical (cache hit, no corruption)', () => {
    const comp = createComposition('c', { ...SETTINGS });
    const parent = createRectangleLayer('p', 100, 100, 50, 50, [1, 0, 0, 1], 100);
    const child = createRectangleLayer('ch', 30, 40, 20, 20, [0, 1, 0, 1], 100);
    child.parentId = parent.id;
    comp.layers = [parent, child];
    const a = worldPos(resolveFrame(comp, 0), child.id);
    const b = worldPos(resolveFrame(comp, 0), child.id);
    const d = worldPos(resolveFrame(comp, 0), child.id);
    assert.deepEqual(a, b);
    assert.deepEqual(b, d);
  });

  check('track-only edit (same layers array, new tracks array) invalidates the cache — visibility', () => {
    const comp = createComposition('c', { ...SETTINGS });
    const r = createRectangleLayer('r', 10, 10, 20, 20, [1, 1, 1, 1], 100);
    r.trackId = 't1';
    comp.layers = [r];                 // stable layers array ref across both resolves
    comp.tracks = [track('t1', 0)];    // visible
    assert.ok(has(resolveFrame(comp, 0), r.id), 'visible before');
    comp.tracks = [track('t1', 0, { visible: false })]; // NEW tracks array, layers untouched
    assert.ok(!has(resolveFrame(comp, 0), r.id), 'hidden after (cache invalidated on tracksRef change)');
  });

  check('track-only edit invalidates the cache — solo', () => {
    const comp = createComposition('c', { ...SETTINGS });
    const a = createRectangleLayer('a', 0, 0, 10, 10, [1, 1, 1, 1], 100); a.trackId = 't1';
    const b = createRectangleLayer('b', 0, 0, 10, 10, [1, 1, 1, 1], 100); b.trackId = 't2';
    comp.layers = [a, b];
    comp.tracks = [track('t1', 0), track('t2', 1)];
    const before = resolveFrame(comp, 0);
    assert.ok(has(before, a.id) && has(before, b.id), 'both render before solo');
    comp.tracks = [track('t1', 0, { solo: true }), track('t2', 1)]; // new array
    const after = resolveFrame(comp, 0);
    assert.ok(has(after, a.id) && !has(after, b.id), 'only the soloed track renders');
  });

  check('distinct compositions do not share a cache entry (WeakMap keyed by layers)', () => {
    const A = createComposition('A', { ...SETTINGS });
    const pa = createRectangleLayer('pa', 100, 100, 10, 10, [1, 0, 0, 1], 100);
    const ca = createRectangleLayer('ca', 5, 5, 10, 10, [0, 1, 0, 1], 100); ca.parentId = pa.id;
    A.layers = [pa, ca];
    const B = createComposition('B', { ...SETTINGS });
    const pb = createRectangleLayer('pb', 300, 300, 10, 10, [1, 0, 0, 1], 100);
    const cb = createRectangleLayer('cb', 7, 7, 10, 10, [0, 1, 0, 1], 100); cb.parentId = pb.id;
    B.layers = [pb, cb];
    const a1 = worldPos(resolveFrame(A, 0), ca.id);
    const b1 = worldPos(resolveFrame(B, 0), cb.id);
    const a2 = worldPos(resolveFrame(A, 0), ca.id); // A again after B
    assert.ok(near(a1[0], 105) && near(a1[1], 105), `A child ${a1}`);
    assert.ok(near(b1[0], 307) && near(b1[1], 307), `B child ${b1}`);
    assert.deepEqual(a1, a2, 'A stable after resolving B (no cross-contamination)');
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
