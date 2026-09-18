// Acceptance harness for the Smart Crop solver (pure geometry). Bundles engine/smart-crop/cropSolver.ts
// and asserts with node:assert. The solver (fit rect, candidate scoring, best pick, variants, group
// box) is fully verified here; the saliency/face DETECTION (analyze.ts, browser canvas + optional
// model) and the panel UI are browser-gated.
//   node scripts/verify-crop-solver.mjs   (or: npm run verify:crop-solver)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'cropsolver-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

// region: normalized [0,1]
const R = (x, y, w, h, kind, weight = 1) => ({ x, y, w, h, kind, weight });

try {
  const M = await bundleAll();
  const { parseAspect, fitAspectRect, solveCrop, solveVariants, groupBox, groupFits, DEFAULT_WEIGHTS } = M;

  check('parseAspect handles ratios, dims, numbers, and junk', () => {
    assert.ok(near(parseAspect('16:9'), 16 / 9, 1e-6));
    assert.ok(near(parseAspect('2.39:1'), 2.39, 1e-6));
    assert.ok(near(parseAspect('1920x1080'), 16 / 9, 1e-6));
    assert.ok(near(parseAspect('1080×1920'), 1080 / 1920, 1e-6));
    assert.equal(parseAspect(1.5), 1.5);
    assert.equal(parseAspect('nonsense'), null);
    assert.equal(parseAspect('0:0'), null);
    assert.equal(parseAspect(-2), null);
  });

  check('fitAspectRect matches the brief: 4000x3000 @ 9:16 -> ~1687x3000', () => {
    const f = fitAspectRect(4000, 3000, 9 / 16);
    assert.ok(near(f.h, 3000, 1), `h=${f.h}`);
    assert.ok(near(f.w, 1687, 2), `w=${f.w}`);
  });

  check('fitAspectRect: wide target in a square source fits to width', () => {
    const f = fitAspectRect(1000, 1000, 16 / 9);
    assert.ok(near(f.w, 1000, 1));
    assert.ok(near(f.h, 562, 1));
  });

  check('a single face pulls the crop toward it (9:16 in a wide source)', () => {
    // face on the RIGHT third of a 4000x3000 image
    const regions = [R(0.72, 0.30, 0.12, 0.16, 'face', 1)];
    const res = solveCrop(4000, 3000, 9 / 16, regions, { focus: 'auto', composition: 'center', steps: 61 });
    const faceCx = 0.78 * 4000; // 3120
    const cropCx = res.rect.x + res.rect.w / 2;
    // the crop should sit around the face, not at the image centre (2000)
    assert.ok(cropCx > 2400, `cropCx=${cropCx} should be pulled right toward the face`);
    // and it should actually contain the face
    assert.ok(res.rect.x <= faceCx && faceCx <= res.rect.x + res.rect.w, 'face inside crop');
    assert.equal(res.tier, 'high');
  });

  check('face outranks saliency (face wins tug-of-war vs an opposite salient blob)', () => {
    const regions = [R(0.80, 0.35, 0.10, 0.14, 'face', 1), R(0.08, 0.40, 0.14, 0.18, 'saliency', 1)];
    const res = solveCrop(4000, 3000, 9 / 16, regions, { steps: 61 });
    const cropCx = res.rect.x + res.rect.w / 2;
    assert.ok(cropCx > 2000, `cropCx=${cropCx} should lean to the face side, not the saliency side`);
  });

  check('edge-cut penalty avoids slicing a subject at the boundary', () => {
    // one subject spanning the centre; a good crop keeps it whole rather than cutting it
    const regions = [R(0.40, 0.30, 0.20, 0.30, 'subject', 1)];
    const res = solveCrop(4000, 3000, 9 / 16, regions, { steps: 81 });
    const subj = { x: 0.40 * 4000, y: 0.30 * 3000, w: 0.20 * 4000, h: 0.30 * 3000 };
    // fully contained horizontally (not cut)
    assert.ok(res.rect.x <= subj.x && subj.x + subj.w <= res.rect.x + res.rect.w, 'subject not cut');
  });

  check('center focus ignores regions and centres the crop', () => {
    const regions = [R(0.85, 0.2, 0.1, 0.1, 'face', 1)];
    const res = solveCrop(4000, 3000, 9 / 16, regions, { focus: 'center', steps: 61 });
    const cropCx = res.rect.x + res.rect.w / 2;
    assert.ok(near(cropCx, 2000, 40), `cropCx=${cropCx} should be centred (~2000)`);
  });

  check('no regions -> low/medium confidence, centred-ish', () => {
    const res = solveCrop(4000, 3000, 9 / 16, [], { steps: 41 });
    assert.ok(res.confidence < 0.6, `confidence=${res.confidence}`);
    assert.notEqual(res.tier, 'high');
  });

  check('solveVariants reuses the same regions for every ratio', () => {
    const regions = [R(0.5, 0.4, 0.1, 0.14, 'face', 1)];
    const vs = solveVariants(4000, 3000, [16 / 9, 4 / 5, 1, 9 / 16], regions, { steps: 41 });
    assert.equal(vs.length, 4);
    for (const v of vs) {
      assert.ok(v.rect.w > 0 && v.rect.h > 0);
      assert.ok(v.rect.x >= 0 && v.rect.x + v.rect.w <= 4001);
      assert.ok(v.rect.y >= 0 && v.rect.y + v.rect.h <= 3001);
    }
  });

  check('groupBox encloses all subjects; groupFits detects an over-wide group', () => {
    const regions = [R(0.05, 0.4, 0.1, 0.2, 'face', 1), R(0.85, 0.4, 0.1, 0.2, 'face', 1)];
    const g = groupBox(regions);
    assert.ok(near(g.x, 0.05, 1e-6) && near(g.x + g.w, 0.95, 1e-6));
    // the two faces span 90% of width; a 9:16 crop of a 4000x3000 image (~1687 wide) can't hold both
    assert.equal(groupFits(4000, 3000, 9 / 16, regions), false);
    // but a 16:9 crop (full 4000 wide) can
    assert.equal(groupFits(4000, 3000, 16 / 9, regions), true);
  });

  check('DEFAULT_WEIGHTS orders face > subject > saliency', () => {
    assert.ok(DEFAULT_WEIGHTS.face > DEFAULT_WEIGHTS.subject);
    assert.ok(DEFAULT_WEIGHTS.subject > DEFAULT_WEIGHTS.saliency);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ crop-solver harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

async function bundleAll() {
  const outfile = join(tmp, 'cropSolver.mjs');
  await build({ entryPoints: ['src/engine/smart-crop/cropSolver.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}
