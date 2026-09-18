// Acceptance harness for the Plexus proximity-graph (B20, pure). Bundles core/plexus/plexusGraph.ts
// and asserts with node:assert. The graph feeds the particle renderer's line drawing (2D canvas).
//   node scripts/verify-plexus.mjs   (or: npm run verify:plexus)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'plexus-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

try {
  const outfile = join(tmp, 'plexusGraph.mjs');
  await build({ entryPoints: ['src/core/plexus/plexusGraph.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { computeEdges, edgeDegrees } = await import(pathToFileURL(outfile).href);

  check('connects a pair within the distance; alpha fades with distance', () => {
    const e = computeEdges([[0, 0], [50, 0]], 100);
    assert.equal(e.length, 1);
    assert.equal(e[0].a, 0); assert.equal(e[0].b, 1);
    assert.ok(near(e[0].dist, 50));
    assert.ok(near(e[0].alpha, 0.5)); // 1 - 50/100
  });

  check('no edge beyond the connect distance; alpha 1 at coincident, 0 at radius', () => {
    assert.equal(computeEdges([[0, 0], [150, 0]], 100).length, 0);
    assert.ok(near(computeEdges([[0, 0], [0, 0]], 100)[0].alpha, 1));
    assert.ok(near(computeEdges([[0, 0], [100, 0]], 100)[0].alpha, 0));
  });

  check('no self-edges, no duplicates (a<b), correct count for a triangle', () => {
    const tri = computeEdges([[0, 0], [30, 0], [0, 30]], 100);
    assert.equal(tri.length, 3); // all three pairs within 100 (max dist ~42)
    for (const e of tri) assert.ok(e.a < e.b, 'a<b');
    const keys = new Set(tri.map((e) => `${e.a}-${e.b}`));
    assert.equal(keys.size, 3, 'no duplicate pairs');
  });

  check('distance <= 0 yields no edges', () => {
    assert.equal(computeEdges([[0, 0], [1, 0]], 0).length, 0);
    assert.equal(computeEdges([[0, 0], [1, 0]], -5).length, 0);
  });

  check('maxEdges caps the output', () => {
    // 30 points all within range -> up to 435 pairs; cap at 10
    const pts = Array.from({ length: 30 }, (_, i) => [i, 0]);
    assert.ok(computeEdges(pts, 1000).length > 10);
    assert.equal(computeEdges(pts, 1000, 10).length, 10);
  });

  check('edgeDegrees counts participation per node', () => {
    const pts = [[0, 0], [30, 0], [0, 30], [500, 500]]; // 4th is isolated
    const edges = computeEdges(pts, 100);
    const deg = edgeDegrees(edges, pts.length);
    assert.equal(deg[3], 0, 'isolated node has degree 0');
    assert.equal(deg[0] + deg[1] + deg[2] + deg[3], edges.length * 2, 'sum of degrees = 2 * edges');
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ plexus harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
