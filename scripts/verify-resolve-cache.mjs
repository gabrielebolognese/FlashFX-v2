// Proves the TimelineEngine per-frame resolve cache (PB3) is correct: a cache HIT returns exactly what
// a fresh resolveFrame() produces, and it is INVALIDATED whenever the composition or resolve context
// changes (so an edit is never served a stale frame). Frame-purity is non-negotiable, so this is the
// safety net for the memoization. Bundles the real TS with esbuild. Run: node scripts/verify-resolve-cache.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'resolvecache-verify-'));
const entry = join(tmp, 'entry.ts');
const outfile = join(tmp, 'out.mjs');

const SETTINGS = { width: 1920, height: 1080, frameRate: 30, durationFrames: 100, backgroundColor: [0, 0, 0, 1] };

let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  [pass] ${name}`); }

// Pull the resolved position of the first resolved layer (the renderer reads transform.positionX).
function firstX(frame) {
  const l = frame?.layers?.[0];
  return l?.transform?.positionX;
}

try {
  writeFileSync(entry, `
    export { createComposition, createRectangleLayer } from ${JSON.stringify(process.cwd() + '/src/core/factory')};
    export { TimelineEngine } from ${JSON.stringify(process.cwd() + '/src/engine/timeline')};
    export { resolveFrame } from ${JSON.stringify(process.cwd() + '/src/core/interpolation')};
  `);
  await build({ entryPoints: [entry], outfile, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent' });
  // interpolation -> expressions spawns a Web Worker at module load; Node has none. Stub it (mirrors verify-precomp).
  if (typeof globalThis.Worker === 'undefined') {
    globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} set onmessage(_v) {} set onerror(_v) {} };
  }
  const { createComposition, createRectangleLayer, TimelineEngine, resolveFrame } = await import(pathToFileURL(outfile).href);

  const mkComp = (id, x) => {
    const c = createComposition(id, { ...SETTINGS });
    c.layers.push(createRectangleLayer('r', x, 100, 50, 50, [1, 0, 0, 1], 100));
    return c;
  };
  const A = mkComp('A', 0);
  const B = mkComp('B', 500);

  check('resolveFrame is deterministic (prerequisite for caching)', () => {
    assert.deepEqual(resolveFrame(A, 0, undefined), resolveFrame(A, 0, undefined));
    assert.equal(firstX(resolveFrame(A, 0, undefined)), 0);
  });

  check('a cache HIT returns the same object, byte-identical to a fresh resolve', () => {
    const eng = new TimelineEngine();
    eng.setComposition(A);
    const r1 = eng.evaluate(0);
    const r1again = eng.evaluate(0);
    assert.ok(r1 === r1again, 'second evaluate(0) must return the cached object');
    assert.deepEqual(r1, resolveFrame(A, 0, undefined), 'cached frame must equal a fresh resolve');
    // distinct frames cache independently
    const r10 = eng.evaluate(10);
    assert.deepEqual(r10, resolveFrame(A, 10, undefined));
    assert.ok(eng.evaluate(0) === r1, 'evaluate(0) still cached after evaluate(10)');
  });

  check('setComposition INVALIDATES the cache (no stale frame after an edit)', () => {
    const eng = new TimelineEngine();
    eng.setComposition(A);
    const r1 = eng.evaluate(0);
    assert.equal(firstX(r1), 0);
    eng.setComposition(B); // an "edit": new composition reference
    const r2 = eng.evaluate(0);
    assert.ok(r2 !== r1, 'must re-resolve after setComposition, not serve the stale cache');
    assert.equal(firstX(r2), 500, 'must reflect the NEW composition, not the cached old one');
    assert.deepEqual(r2, resolveFrame(B, 0, undefined));
  });

  check('setResolveContext INVALIDATES the cache', () => {
    const eng = new TimelineEngine();
    eng.setComposition(A);
    const r1 = eng.evaluate(0);
    eng.setResolveContext(undefined);
    const r2 = eng.evaluate(0);
    assert.ok(r2 !== r1, 'must re-resolve after the resolve context changes');
    assert.deepEqual(r2, resolveFrame(A, 0, undefined));
  });

  console.log(`\nresolve-cache: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
