// Acceptance harness for track-matte pairing (B10b). Bundles the pure core/trackMatte.ts and asserts
// with node:assert. The pairing (which layer mattes which, which are consumed) is fully verified here;
// the pixel composite (sample the matte's alpha/luma, multiply, invert) is the browser-gated WebGPU
// pass wired in the renderer.
//   node scripts/verify-mattes.mjs   (or: npm run verify:mattes)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'mattes-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

async function bundle(entry, name) {
  const outfile = join(tmp, name);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}

const L = (id, trackMatte) => ({ id, trackMatte });

try {
  const M = await bundle('src/core/trackMatte.ts', 'trackMatte.mjs');
  const { pairTrackMattes, matteFlags } = M;

  check('no track mattes → empty pairing (byte-identical rendering)', () => {
    const r = pairTrackMattes([L('a'), L('b'), L('c')]);
    assert.deepEqual(r.matted, {});
    assert.equal(r.consumed.size, 0);
  });

  check('the matte is the layer directly ABOVE (index i+1); source is consumed', () => {
    // bottom→top: a (matted by b), b (matte), c
    const r = pairTrackMattes([L('a', 'alpha'), L('b'), L('c')]);
    assert.deepEqual(r.matted.a, { mode: 'alpha', sourceId: 'b' });
    assert.ok(r.consumed.has('b'));
    assert.equal(Object.keys(r.matted).length, 1);
  });

  check('topmost layer with a matte set is ignored (nothing above)', () => {
    const r = pairTrackMattes([L('a'), L('b'), L('c', 'luma')]);
    assert.deepEqual(r.matted, {});
    assert.equal(r.consumed.size, 0);
  });

  check('each mode records correctly', () => {
    const r = pairTrackMattes([L('x', 'lumaInv'), L('y')]);
    assert.deepEqual(r.matted.x, { mode: 'lumaInv', sourceId: 'y' });
  });

  check('a consumed matte is not re-used by another target below it (first assignment wins)', () => {
    // a matted-by b, and (below) a2 also tries to matte-by b? Only adjacency matters, so build:
    // stack bottom→top: a(matte), b(matte-target using a? no). Test adjacency + consumed guard:
    // layers: p (matted by q), q (matted by r) → q is both a target AND consumed as p's matte.
    const r = pairTrackMattes([L('p', 'alpha'), L('q', 'alpha'), L('r')]);
    // p uses q (consumed). q uses r (consumed). Both valid — different sources.
    assert.deepEqual(r.matted.p, { mode: 'alpha', sourceId: 'q' });
    assert.deepEqual(r.matted.q, { mode: 'alpha', sourceId: 'r' });
    assert.ok(r.consumed.has('q') && r.consumed.has('r'));
  });

  check('a source id already consumed is not paired again (defensive guard)', () => {
    // Degenerate input with a repeated id 's': the first target consumes 's'; a second target whose
    // source resolves to the same id is skipped (can't consume one source twice).
    const r = pairTrackMattes([L('t1', 'alpha'), L('s'), L('t2', 'alpha'), L('s')]);
    assert.deepEqual(r.matted.t1, { mode: 'alpha', sourceId: 's' });
    assert.equal(r.matted.t2, undefined, 't2 skipped — its source id is already consumed');
    assert.equal(r.consumed.size, 1);
  });

  check('matteFlags: luma vs alpha and inversion', () => {
    assert.deepEqual(matteFlags('alpha'), { luma: false, invert: false });
    assert.deepEqual(matteFlags('alphaInv'), { luma: false, invert: true });
    assert.deepEqual(matteFlags('luma'), { luma: true, invert: false });
    assert.deepEqual(matteFlags('lumaInv'), { luma: true, invert: true });
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ mattes harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
