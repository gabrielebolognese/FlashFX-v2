// Acceptance harness for the Path ops engine (Phase G).
//
// Mirrors scripts/verify-cloner.mjs: bundles the REAL TypeScript with esbuild
// and asserts with node:assert. Run: node scripts/verify-pathops.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'pathops-verify-'));
const outfile = join(tmp, 'pathops.mjs');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const near = (a, b, eps = 1) => Math.abs(a - b) <= eps;

// Minimal builders for a plain shape layer (no factory needed).
const prop = (val) => ({ id: 'p', name: 'n', valueType: typeof val === 'number' ? 'number' : 'vec2', defaultValue: val, keyframes: [] });
const rectLayer = (id, x, y, w, h) => ({
  id, type: 'shape', name: id, parentId: null, trackId: null, visible: true, locked: false, blendMode: 'normal',
  transform: { position: prop([x, y]), rotation: prop(0), scale: prop([1, 1]), anchorPoint: prop([0, 0]), opacity: prop(1) },
  shape: { type: 'rectangle', width: prop(w), height: prop(h), fillColor: [1, 1, 1, 1], strokeColor: [1, 1, 1, 1], strokeWidth: prop(2), borderRadius: prop(0) },
  inPoint: 0, outPoint: 100,
});

// Shoelace area of a boolean result (local vertices + centroid position).
function resultArea(res) {
  const pts = res.vertices.map((v) => [v.position[0] + res.position[0], v.position[1] + res.position[1]]);
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return Math.abs(a) / 2;
}

try {
  await build({ entryPoints: ['src/core/pathOps.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  // core/interpolation transitively loads the expression engine, which spawns a
  // Worker at import; Node has none, so stub it just so the module can import.
  if (typeof globalThis.Worker === 'undefined') {
    globalThis.Worker = class { constructor() {} postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} };
  }
  const mod = await import(pathToFileURL(outfile).href);
  const { shapeToPathVertices, reversePathVertices, simplifyPathVertices, booleanLayers } = mod;

  // ── Object to Path ──
  check('rectangle → 4 corner vertices centered at origin', () => {
    const vs = shapeToPathVertices({ type: 'rectangle', width: prop(100), height: prop(60) }, 0);
    assert.equal(vs.length, 4);
    const xs = vs.map((v) => v.position[0]).sort((a, b) => a - b);
    const ys = vs.map((v) => v.position[1]).sort((a, b) => a - b);
    assert.ok(near(xs[0], -50) && near(xs[3], 50));
    assert.ok(near(ys[0], -30) && near(ys[3], 30));
    assert.ok(vs.every((v) => v.vertexType === 'corner'));
  });
  check('circle → sampled ring', () => {
    const vs = shapeToPathVertices({ type: 'circle', radius: prop(40) }, 0);
    assert.ok(vs.length >= 24);
    assert.ok(vs.every((v) => near(Math.hypot(v.position[0], v.position[1]), 40, 0.001)));
  });
  check('star → 2×points vertices alternating radius', () => {
    const vs = shapeToPathVertices({ type: 'star', points: prop(5), outerRadius: prop(50), innerRadius: prop(20) }, 0);
    assert.equal(vs.length, 10);
    const radii = vs.map((v) => Math.round(Math.hypot(v.position[0], v.position[1])));
    assert.ok(radii.includes(50) && radii.includes(20));
  });

  // ── Reverse ──
  check('reverse flips order and swaps handles', () => {
    const vs = [
      { position: [0, 0], handleIn: [1, 1], handleOut: [2, 2], vertexType: 'bezier' },
      { position: [10, 0], handleIn: [3, 3], handleOut: [4, 4], vertexType: 'bezier' },
    ];
    const r = reversePathVertices(vs);
    assert.deepEqual(r[0].position, [10, 0]);
    assert.deepEqual(r[0].handleIn, [4, 4]); // was handleOut
    assert.deepEqual(r[0].handleOut, [3, 3]); // was handleIn
  });

  // ── Simplify ──
  check('simplify removes a collinear midpoint', () => {
    const vs = [
      { position: [0, 0], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' },
      { position: [5, 0], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' }, // collinear
      { position: [10, 0], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' },
      { position: [10, 10], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' },
    ];
    const s = simplifyPathVertices(vs, 1);
    assert.equal(s.length, 3); // midpoint dropped
  });

  // ── Boolean ops ── two 100×100 rects overlapping in a 50×100 region.
  const A = rectLayer('a', 0, 0, 100, 100);   // x ∈ [-50,50]
  const B = rectLayer('b', 50, 0, 100, 100);  // x ∈ [0,100]
  const totalArea = (results) => results.reduce((s, r) => s + resultArea(r), 0);

  check('union area ≈ 15000', () => {
    const r = booleanLayers('union', [A, B], ['a', 'b'], 0);
    assert.ok(r.length >= 1);
    assert.ok(near(totalArea(r), 15000, 5), `got ${totalArea(r)}`);
  });
  check('intersection area ≈ 5000', () => {
    const r = booleanLayers('intersection', [A, B], ['a', 'b'], 0);
    assert.ok(near(totalArea(r), 5000, 5), `got ${totalArea(r)}`);
  });
  check('difference (A−B) area ≈ 5000', () => {
    const r = booleanLayers('difference', [A, B], ['a', 'b'], 0);
    assert.ok(near(totalArea(r), 5000, 5), `got ${totalArea(r)}`);
  });
  check('xor area ≈ 10000', () => {
    const r = booleanLayers('xor', [A, B], ['a', 'b'], 0);
    assert.ok(near(totalArea(r), 10000, 5), `got ${totalArea(r)}`);
  });
  check('boolean needs 2+ shapes', () => {
    assert.equal(booleanLayers('union', [A], ['a'], 0).length, 0);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
