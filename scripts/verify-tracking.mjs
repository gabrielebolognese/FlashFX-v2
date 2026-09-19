// Acceptance harness for the B27 tracking/match-move math (pure). Bundles core/tracking/{homography,
// matchMove}.ts and asserts with node:assert: corner-pin homography (identity, corners map exactly,
// invert round-trips), 1/2-point match-move, and warp-stabilize corrections. The tracker that FINDS
// the features is browser image analysis (B27-track).
//   node scripts/verify-tracking.mjs   (or: npm run verify:tracking)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'tracking-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const nearPt = (p, q, tol = 1e-4) => near(p[0], q[0], tol) && near(p[1], q[1], tol);

async function bundle(entry, name) {
  const outfile = join(tmp, name);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}

try {
  const H = await bundle('src/core/tracking/homography.ts', 'homography.mjs');
  const M = await bundle('src/core/tracking/matchMove.ts', 'matchMove.mjs');
  const { computeHomography, applyHomography, invertHomography } = H;
  const { onePointOffset, twoPointTransform, applyRigid, smoothTrack, stabilizeCorrections } = M;

  const unit = [[0, 0], [100, 0], [100, 100], [0, 100]];

  check('homography: identity quad -> identity mapping', () => {
    const hh = computeHomography(unit, unit);
    for (const p of [[10, 20], [50, 90], [0, 0]]) assert.ok(nearPt(applyHomography(hh, p), p), `identity ${p}`);
  });

  check('homography: maps each source corner exactly onto its destination corner', () => {
    const dst = [[10, 5], [120, 20], [110, 130], [-5, 90]]; // an arbitrary perspective quad
    const hh = computeHomography(unit, dst);
    for (let i = 0; i < 4; i++) assert.ok(nearPt(applyHomography(hh, unit[i]), dst[i], 1e-3), `corner ${i}`);
  });

  check('homography: invert round-trips a point', () => {
    const dst = [[10, 5], [120, 20], [110, 130], [-5, 90]];
    const hh = computeHomography(unit, dst);
    const inv = invertHomography(hh);
    assert.ok(inv, 'invertible');
    const p = [37, 61];
    assert.ok(nearPt(applyHomography(inv, applyHomography(hh, p)), p, 1e-3), 'H^-1(H(p)) = p');
  });

  check('onePointOffset = cur - rest', () => {
    assert.deepEqual(onePointOffset([10, 10], [40, -5]), [30, -15]);
  });

  check('twoPointTransform: rest pair maps exactly onto the current pair (pos+rot+scale)', () => {
    const restA = [0, 0], restB = [100, 0];
    // rotate 90deg, scale 2, translate: A'->(50,50), B' should be 200 up from A' rotated
    const curA = [50, 50], curB = [50, 250]; // |A'B'|=200 -> scale 2, direction +y -> +90deg
    const t = twoPointTransform(restA, restB, curA, curB);
    assert.ok(near(t.scale, 2, 1e-6), `scale ${t.scale}`);
    assert.ok(near(((t.rotation % 360) + 360) % 360, 90, 1e-3), `rotation ${t.rotation}`);
    assert.ok(nearPt(applyRigid(t, restA), curA), 'A -> A\'');
    assert.ok(nearPt(applyRigid(t, restB), curB), 'B -> B\'');
  });

  check('smoothTrack averages; a flat track is unchanged', () => {
    const flat = [[5, 5], [5, 5], [5, 5], [5, 5]];
    assert.deepEqual(smoothTrack(flat, 3), flat);
    const sm = smoothTrack([[0, 0], [10, 0], [0, 0]], 3);
    assert.ok(near(sm[1][0], 10 / 3, 1e-6), 'window-3 average at the spike');
  });

  check('stabilizeCorrections cancel high-frequency shake (smooth trend preserved)', () => {
    // a linear drift + alternating 1px jitter
    const track = [];
    for (let i = 0; i < 20; i++) track.push([i * 2 + (i % 2 ? 6 : -6), 0]);
    const corr = stabilizeCorrections(track, 5);
    // corrected position = raw + correction should be much smoother than raw (less frame-to-frame jitter)
    const jitter = (arr) => { let s = 0; for (let i = 1; i < arr.length; i++) s += Math.abs(arr[i][0] - arr[i - 1][0]); return s; };
    const corrected = track.map((p, i) => [p[0] + corr[i][0], p[1]]);
    assert.ok(jitter(corrected) < jitter(track) * 0.6, `stabilised jitter ${jitter(corrected).toFixed(1)} << raw ${jitter(track).toFixed(1)}`);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ tracking harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
