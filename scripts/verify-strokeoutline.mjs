// Acceptance harness for the stroke-outline core (core/strokeOutline.ts).
// Run: node scripts/verify-strokeoutline.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'strokeoutline-verify-'));
const outfile = join(tmp, 'so.mjs');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const corner = (x, y) => ({ position: [x, y], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' });
const area = (verts) => { let a = 0; for (let i = 0; i < verts.length; i++) { const p = verts[i].position, q = verts[(i + 1) % verts.length].position; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };

try {
  await build({ entryPoints: ['src/core/strokeOutline.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { outlineStroke } = await import(pathToFileURL(outfile).href);

  check('straight open segment, butt cap → one ring ≈ width × length', () => {
    const r = outlineStroke([corner(0, 0), corner(100, 0)], false, 10, 'butt', 'miter');
    assert.ok(r);
    assert.equal(r.holes.length, 0);
    assert.ok(Math.abs(area(r.vertices) - 1000) < 30, `area ${area(r.vertices)} ≈ 1000`); // 100×10
  });

  check('closed square centerline → outer + ONE hole (the inside of the ring)', () => {
    const sq = [corner(0, 0), corner(100, 0), corner(100, 100), corner(0, 100)];
    const r = outlineStroke(sq, true, 10, 'butt', 'miter');
    assert.ok(r);
    assert.equal(r.holes.length, 1, 'inner boundary is a hole');
    const ringArea = area(r.vertices) - area(r.holes[0]);
    // perimeter 400 × width 10 ≈ 4000 (± join/corner area)
    assert.ok(ringArea > 3500 && ringArea < 4800, `ring area ${ringArea}`);
  });

  check('round cap adds area beyond the butt ends', () => {
    const butt = outlineStroke([corner(0, 0), corner(100, 0)], false, 20, 'butt', 'miter');
    const round = outlineStroke([corner(0, 0), corner(100, 0)], false, 20, 'round', 'miter');
    assert.ok(area(round.vertices) > area(butt.vertices), 'round caps enclose more area');
  });

  check('square cap adds area beyond butt', () => {
    const butt = outlineStroke([corner(0, 0), corner(100, 0)], false, 20, 'butt', 'miter');
    const square = outlineStroke([corner(0, 0), corner(100, 0)], false, 20, 'square', 'miter');
    assert.ok(area(square.vertices) > area(butt.vertices));
  });

  check('degenerate input → null', () => {
    assert.equal(outlineStroke([corner(0, 0), corner(100, 0)], false, 0, 'butt', 'miter'), null);
    assert.equal(outlineStroke([corner(5, 5)], false, 10, 'butt', 'miter'), null);
  });

  check('deterministic', () => {
    const v = [corner(0, 0), corner(50, 30), corner(100, 0)];
    assert.deepEqual(outlineStroke(v, false, 8, 'round', 'miter'), outlineStroke(v, false, 8, 'round', 'miter'));
  });

  check('all emitted coords finite, no -0', () => {
    const r = outlineStroke([corner(0, 0), corner(80, 0)], false, 6, 'butt', 'miter');
    for (const v of [...r.vertices, ...r.holes.flat()]) for (const n of v.position) { assert.ok(Number.isFinite(n)); assert.ok(!Object.is(n, -0)); }
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
