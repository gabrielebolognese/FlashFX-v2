// Acceptance harness for hole tessellation (engine/pathTessellation.ts: bridgeHoles + fill).
// Proves outlined-glyph counters are carved out of the fill (the render itself is WebGPU-only,
// but the triangulation is pure and testable). Run: node scripts/verify-tessellation.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'tess-verify-'));
const outfile = join(tmp, 'tess.mjs');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

const corner = (x, y) => ({ position: [x, y], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' });
const square = (x0, y0, x1, y1) => [corner(x0, y0), corner(x1, y0), corner(x1, y1), corner(x0, y1)];

// Extract fill triangles [[a,b,c],...] from the interleaved [x,y,r,g,b,a] buffer.
function triangles(data) {
  const tris = [];
  for (let i = 0; i < data.length; i += 18) {
    tris.push([[data[i], data[i + 1]], [data[i + 6], data[i + 7]], [data[i + 12], data[i + 13]]]);
  }
  return tris;
}
function pointInTri(p, a, b, c) {
  const d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
  const d2 = (p[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (p[1] - c[1]);
  const d3 = (p[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (p[1] - a[1]);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0, hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}
const covered = (tris, p) => tris.some((t) => pointInTri(p, t[0], t[1], t[2]));

try {
  await build({ entryPoints: ['src/engine/pathTessellation.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { tessellatePath } = await import(pathToFileURL(outfile).href);

  const base = { closed: true, fillColor: [1, 1, 1, 1], strokeColor: [0, 0, 0, 0], strokeWidth: 0, lineCap: 'butt', lineJoin: 'miter' };

  check('no holes: the whole square is filled', () => {
    const { data } = tessellatePath({ ...base, vertices: square(0, 0, 100, 100) });
    const tris = triangles(data);
    assert.ok(covered(tris, [50, 50]), 'center filled');
    assert.ok(covered(tris, [10, 10]), 'corner filled');
  });

  check('centered square hole is carved out (ring filled, counter empty)', () => {
    const { data } = tessellatePath({ ...base, vertices: square(0, 0, 100, 100), holes: [square(30, 30, 70, 70)] });
    const tris = triangles(data);
    assert.ok(covered(tris, [10, 50]), 'left ring filled');
    assert.ok(covered(tris, [90, 50]), 'right ring filled');
    assert.ok(covered(tris, [50, 10]), 'top ring filled');
    assert.ok(covered(tris, [50, 90]), 'bottom ring filled');
    assert.ok(!covered(tris, [50, 50]), 'HOLE CENTER must be empty');
    assert.ok(!covered(tris, [40, 40]), 'inside hole must be empty');
  });

  check('hole carves regardless of its winding (opposite auto-applied)', () => {
    // hole wound the SAME direction as the outer — bridging must still carve it
    const cw = [corner(30, 30), corner(30, 70), corner(70, 70), corner(70, 30)]; // reversed winding
    const { data } = tessellatePath({ ...base, vertices: square(0, 0, 100, 100), holes: [cw] });
    const tris = triangles(data);
    assert.ok(!covered(tris, [50, 50]), 'hole still empty regardless of winding');
    assert.ok(covered(tris, [10, 50]), 'ring still filled');
  });

  check('two separate holes both carve (like the two counters of a B)', () => {
    const { data } = tessellatePath({ ...base, vertices: square(0, 0, 100, 100), holes: [square(15, 15, 35, 35), square(65, 65, 85, 85)] });
    const tris = triangles(data);
    assert.ok(!covered(tris, [25, 25]), 'hole 1 empty');
    assert.ok(!covered(tris, [75, 75]), 'hole 2 empty');
    assert.ok(covered(tris, [50, 50]), 'solid area between holes filled');
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
