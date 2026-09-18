// Acceptance harness for the B15 color-grade engine (pure). Bundles core/effects/{lut,curves,
// gradePresets}.ts and asserts with node:assert: .cube parsing + trilinear 3D-LUT sampling, tone-curve
// eval/bake, and film-preset validity. This is the reference the Color Grade bake uses (renders now)
// and the GPU 3D-LUT/1D-LUT path mirrors (B15-gpu).
//   node scripts/verify-color-grade.mjs   (or: npm run verify:color-grade)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'grade-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol = 1e-5) => Math.abs(a - b) <= tol;

async function bundle(entry, name) {
  const outfile = join(tmp, name);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}

// a 2x2x2 identity .cube
const IDENTITY_CUBE = `# test
TITLE "id"
LUT_3D_SIZE 2
0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
`;
// a 2x2x2 "invert red" cube (r' = 1-r)
const INVERT_R_CUBE = `LUT_3D_SIZE 2
1 0 0
0 0 0
1 1 0
0 1 0
1 0 1
0 0 1
1 1 1
0 1 1
`;

try {
  const L = await bundle('src/core/effects/lut.ts', 'lut.mjs');
  const C = await bundle('src/core/effects/curves.ts', 'curves.mjs');
  const G = await bundle('src/core/effects/gradePresets.ts', 'gradePresets.mjs');
  const { parseCube, sampleLUT, identityLUT } = L;
  const { evalCurve, bakeCurve1D, sampleCurve1D, isIdentityCurve, IDENTITY_CURVE } = C;
  const { GRADE_PRESETS } = G;

  check('parseCube reads size + N^3 rows; rejects malformed / wrong count', () => {
    const lut = parseCube(IDENTITY_CUBE);
    assert.ok(lut && lut.size === 2 && lut.data.length === 2 * 2 * 2 * 3);
    assert.equal(parseCube('LUT_3D_SIZE 2\n0 0 0'), null); // too few rows
    assert.equal(parseCube('nonsense'), null);
    assert.equal(parseCube('LUT_1D_SIZE 4\n0 0 0'), null); // 1D not supported
  });

  check('identity LUT round-trips colours (corners + interior)', () => {
    const lut = parseCube(IDENTITY_CUBE);
    for (const [r, g, b] of [[0, 0, 0], [1, 1, 1], [1, 0, 0], [0.5, 0.5, 0.5], [0.25, 0.75, 0.1]]) {
      const [or, og, ob] = sampleLUT(lut, r, g, b);
      assert.ok(near(or, r) && near(og, g) && near(ob, b), `${r},${g},${b} -> ${or},${og},${ob}`);
    }
    // programmatic identity too
    const id = identityLUT(8);
    const s = sampleLUT(id, 0.3, 0.6, 0.9);
    assert.ok(near(s[0], 0.3, 1e-3) && near(s[1], 0.6, 1e-3) && near(s[2], 0.9, 1e-3));
  });

  check('invert-red LUT flips R, trilinear interpolates the middle', () => {
    const lut = parseCube(INVERT_R_CUBE);
    assert.ok(near(sampleLUT(lut, 0, 0.5, 0.5)[0], 1));   // r=0 -> 1
    assert.ok(near(sampleLUT(lut, 1, 0.5, 0.5)[0], 0));   // r=1 -> 0
    assert.ok(near(sampleLUT(lut, 0.5, 0.5, 0.5)[0], 0.5)); // midpoint
  });

  check('sampleLUT clamps out-of-range input', () => {
    const lut = parseCube(IDENTITY_CUBE);
    const s = sampleLUT(lut, 2, -1, 0.5);
    assert.ok(near(s[0], 1) && near(s[1], 0) && near(s[2], 0.5));
  });

  check('curves: identity passthrough, endpoints, linear interp, clamp', () => {
    assert.ok(isIdentityCurve(IDENTITY_CURVE));
    assert.ok(near(evalCurve(IDENTITY_CURVE, 0.42), 0.42));
    const c = [{ x: 0, y: 0.2 }, { x: 1, y: 0.8 }];
    assert.ok(near(evalCurve(c, 0), 0.2));
    assert.ok(near(evalCurve(c, 1), 0.8));
    assert.ok(near(evalCurve(c, 0.5), 0.5)); // midpoint of 0.2..0.8
    assert.ok(near(evalCurve(c, -3), 0.2) && near(evalCurve(c, 5), 0.8)); // clamp x
    assert.equal(isIdentityCurve(c), false);
  });

  check('bakeCurve1D + sampleCurve1D reproduce the curve', () => {
    const c = [{ x: 0, y: 0 }, { x: 0.5, y: 0.25 }, { x: 1, y: 1 }];
    const lut = bakeCurve1D(c, 256);
    assert.equal(lut.length, 256);
    assert.ok(near(sampleCurve1D(lut, 0.5), 0.25, 1e-2));
    assert.ok(near(sampleCurve1D(lut, 0), 0) && near(sampleCurve1D(lut, 1), 1));
  });

  check('every grade preset has valid curves + saturation', () => {
    assert.ok(GRADE_PRESETS.length >= 6);
    for (const p of GRADE_PRESETS) {
      assert.ok(p.name && p.label);
      if (p.saturation !== undefined) assert.ok(p.saturation >= 0 && p.saturation <= 3, `${p.name} sat`);
      for (const key of ['master', 'r', 'g', 'b']) {
        const pts = p[key];
        if (!pts) continue;
        assert.ok(pts.length >= 2, `${p.name}.${key} >= 2 pts`);
        for (const pt of pts) assert.ok(pt.x >= 0 && pt.x <= 1 && pt.y >= 0 && pt.y <= 1, `${p.name}.${key} in range`);
        // baking must not throw and must produce a full LUT
        assert.equal(bakeCurve1D(pts, 64).length, 64);
      }
    }
    assert.equal(GRADE_PRESETS.find((p) => p.name === 'noir').saturation, 0);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ color-grade harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
