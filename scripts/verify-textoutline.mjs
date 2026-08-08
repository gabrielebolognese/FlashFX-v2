// Acceptance harness for the text-outline core (core/textOutline.ts).
// Run: node scripts/verify-textoutline.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'textoutline-verify-'));
const outfile = join(tmp, 'to.mjs');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const nearV = (a, b) => near(a[0], b[0]) && near(a[1], b[1]);

try {
  await build({ entryPoints: ['src/core/textOutline.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { commandsToContours, contoursBBox, recenterContours } = await import(pathToFileURL(outfile).href);

  check('a triangle of lines → one closed corner contour of 3 vertices', () => {
    const cmds = [
      { type: 'M', x: 0, y: 0 }, { type: 'L', x: 10, y: 0 }, { type: 'L', x: 5, y: 10 }, { type: 'Z' },
    ];
    const c = commandsToContours(cmds);
    assert.equal(c.length, 1);
    assert.equal(c[0].length, 3);
    assert.ok(c[0].every((p) => p.vertexType === 'corner'));
    assert.deepEqual(c[0].map((p) => p.position), [[0, 0], [10, 0], [5, 10]]);
  });

  check('quadratic → cubic via the exact 2/3 rule (relative handles)', () => {
    // start (0,0) --Q ctrl (10,10)--> end (20,0)
    const cmds = [{ type: 'M', x: 0, y: 0 }, { type: 'Q', x1: 10, y1: 10, x: 20, y: 0 }, { type: 'Z' }];
    const c = commandsToContours(cmds)[0];
    // start.handleOut = 2/3*(C - P0) = 2/3*(10,10) = (6.667,6.667)
    assert.ok(nearV(c[0].handleOut, [20 / 3, 20 / 3]), `out ${c[0].handleOut}`);
    assert.equal(c[0].vertexType, 'bezier');
    // end.handleIn = 2/3*(C - P2) = 2/3*(-10,10) = (-6.667,6.667)
    assert.ok(nearV(c[1].handleIn, [-20 / 3, 20 / 3]), `in ${c[1].handleIn}`);
    assert.equal(c[1].vertexType, 'bezier');
  });

  check('cubic command maps controls straight to relative handles', () => {
    const cmds = [{ type: 'M', x: 0, y: 0 }, { type: 'C', x1: 3, y1: 4, x2: 17, y2: 4, x: 20, y: 0 }, { type: 'Z' }];
    const c = commandsToContours(cmds)[0];
    assert.ok(nearV(c[0].handleOut, [3, 4]));      // C1 - P0
    assert.ok(nearV(c[1].handleIn, [17 - 20, 4]));  // C2 - P3
  });

  check("a glyph with a hole (two M's) → two contours", () => {
    const cmds = [
      { type: 'M', x: 0, y: 0 }, { type: 'L', x: 100, y: 0 }, { type: 'L', x: 100, y: 100 }, { type: 'L', x: 0, y: 100 }, { type: 'Z' },
      { type: 'M', x: 30, y: 30 }, { type: 'L', x: 70, y: 30 }, { type: 'L', x: 70, y: 70 }, { type: 'L', x: 30, y: 70 }, { type: 'Z' },
    ];
    const c = commandsToContours(cmds);
    assert.equal(c.length, 2);
    assert.equal(c[0].length, 4);
    assert.equal(c[1].length, 4);
  });

  check('a trailing point coincident with the start is merged (handleIn carried over)', () => {
    // close by an explicit segment back to the start point, then Z
    const cmds = [
      { type: 'M', x: 0, y: 0 }, { type: 'L', x: 10, y: 0 },
      { type: 'Q', x1: 5, y1: -5, x: 0, y: 0 }, { type: 'Z' },
    ];
    const c = commandsToContours(cmds)[0];
    assert.equal(c.length, 2); // the closing (0,0) merged into the start, not a 3rd vertex
    // start's handleIn came from the quad's end-handle: 2/3*(C - P2) = 2/3*(5,-5)
    assert.ok(nearV(c[0].handleIn, [10 / 3, -10 / 3]), `in ${c[0].handleIn}`);
    assert.equal(c[0].vertexType, 'bezier');
  });

  check('degenerate contour (<2 pts) is dropped', () => {
    assert.deepEqual(commandsToContours([{ type: 'M', x: 5, y: 5 }, { type: 'Z' }]), []);
  });

  check('recenterContours moves bbox center to origin and reports it', () => {
    const cmds = [{ type: 'M', x: 100, y: 200 }, { type: 'L', x: 140, y: 200 }, { type: 'L', x: 140, y: 260 }, { type: 'L', x: 100, y: 260 }, { type: 'Z' }];
    const c = commandsToContours(cmds);
    const { center, contours } = recenterContours(c);
    assert.ok(nearV(center, [120, 230])); // bbox center
    const bb = contoursBBox(contours);
    assert.ok(near((bb.minX + bb.maxX) / 2, 0) && near((bb.minY + bb.maxY) / 2, 0));
    // recenter preserves shape: width/height unchanged
    assert.ok(near(bb.maxX - bb.minX, 40) && near(bb.maxY - bb.minY, 60));
  });

  check('recenter is pure (does not mutate input)', () => {
    const c = commandsToContours([{ type: 'M', x: 10, y: 10 }, { type: 'L', x: 20, y: 10 }, { type: 'L', x: 20, y: 20 }, { type: 'Z' }]);
    const snap = JSON.stringify(c);
    recenterContours(c);
    assert.equal(JSON.stringify(c), snap);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
