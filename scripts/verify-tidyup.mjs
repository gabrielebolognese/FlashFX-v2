// Acceptance harness for the Tidy Up core (core/align.ts: planTidyUp + computeTidyUp).
// Run: node scripts/verify-tidyup.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'tidyup-verify-'));
const outfile = join(tmp, 'tu.mjs');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const b = (id, x, y, w, h) => ({ id, x, y, w, h }); // x,y = CENTER

try {
  await build({ entryPoints: ['src/core/align.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  // align.ts → interpolation → textAtlas/expression engine spawns a Worker at load; Node has
  // none and Tidy Up never uses it, so stub it just so the module imports.
  if (typeof globalThis.Worker === 'undefined') {
    globalThis.Worker = class {
      postMessage() {}
      terminate() {}
      addEventListener() {}
      removeEventListener() {}
      set onmessage(_v) {}
      set onerror(_v) {}
    };
  }
  const { computeTidyUp, planTidyUp } = await import(pathToFileURL(outfile).href);

  check('fewer than 2 boxes → no-op', () => {
    assert.deepEqual(computeTidyUp([]), []);
    assert.deepEqual(computeTidyUp([b('a', 0, 0, 10, 10)]), []);
  });

  check('clean row is idempotent (row layout, modal gapX)', () => {
    // three 40-wide boxes, gap 20, same cy: centers 20, 80, 140
    const boxes = [b('a', 20, 0, 40, 40), b('b', 80, 0, 40, 40), b('c', 140, 0, 40, 40)];
    const plan = planTidyUp(boxes);
    assert.equal(plan.layout, 'row');
    assert.equal(plan.rows, 1); assert.equal(plan.cols, 3); assert.equal(plan.gapX, 20);
    assert.deepEqual(computeTidyUp(boxes), []); // already tidy
  });

  check('messy row → snaps to modal gap and unifies cy', () => {
    // gaps 20,20,26 → modal 20; y's jittered → unified
    const boxes = [b('a', 20, 1, 40, 40), b('b', 80, -2, 40, 40), b('c', 140, 3, 40, 40), b('d', 206, 0, 40, 40)];
    const plan = planTidyUp(boxes);
    assert.equal(plan.gapX, 20);
    const ys = plan.cells.map((c) => c.y);
    assert.ok(ys.every((y) => near(y, ys[0])), 'all cy unified');
    // last box should move from 206 to 20+3*(40+20)=200
    assert.ok(near(plan.cells.find((c) => c.id === 'd').x, 200));
  });

  check('single column (one item per row)', () => {
    const boxes = [b('a', 0, 20, 40, 40), b('b', 0, 80, 40, 40), b('c', 0, 144, 40, 40)];
    const plan = planTidyUp(boxes);
    assert.equal(plan.layout, 'column');
    assert.equal(plan.cols, 1); assert.equal(plan.rows, 3); assert.equal(plan.gapY, 20);
  });

  check('clean 2x3 grid is idempotent', () => {
    const boxes = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) boxes.push(b(`${r}${c}`, 20 + c * 60, 20 + r * 60, 40, 40));
    const plan = planTidyUp(boxes);
    assert.equal(plan.layout, 'grid'); assert.equal(plan.rows, 2); assert.equal(plan.cols, 3);
    assert.deepEqual(computeTidyUp(boxes), []);
  });

  check('messy 2x3 grid → equal gaps, unified rows and columns', () => {
    const boxes = [
      b('00', 22, 18, 40, 40), b('01', 79, 21, 40, 40), b('02', 141, 19, 40, 40),
      b('10', 18, 81, 40, 40), b('11', 82, 78, 40, 40), b('12', 139, 82, 40, 40),
    ];
    const plan = planTidyUp(boxes);
    assert.equal(plan.rows, 2); assert.equal(plan.cols, 3);
    // each row's cy unified, each column's cx unified
    const row0 = plan.cells.filter((c) => c.id[0] === '0').map((c) => c.y);
    assert.ok(row0.every((y) => near(y, row0[0])));
    const col0 = plan.cells.filter((c) => c.id[1] === '0').map((c) => c.x);
    assert.ok(col0.every((x) => near(x, col0[0])));
  });

  check('ragged last row fills left→right from column 0', () => {
    // 5 boxes, cols inferred 2 → rows 3, last box alone in row 2 lands in column 0
    const boxes = [
      b('a', 20, 20, 40, 40), b('b', 80, 20, 40, 40),
      b('c', 20, 80, 40, 40), b('d', 80, 80, 40, 40),
      b('e', 20, 140, 40, 40),
    ];
    const plan = planTidyUp(boxes);
    assert.equal(plan.cols, 2); assert.equal(plan.rows, 3);
    const e = plan.cells.find((c) => c.id === 'e');
    const a = plan.cells.find((c) => c.id === 'a');
    assert.ok(near(e.x, a.x), 'e lands in column 0 (same cx as a)');
  });

  check('column count is the mode of row lengths', () => {
    // rows of lengths 3,3,2 → mode 3
    const boxes = [
      b('a', 20, 20, 40, 40), b('b', 80, 20, 40, 40), b('c', 140, 20, 40, 40),
      b('d', 20, 80, 40, 40), b('e', 80, 80, 40, 40), b('f', 140, 80, 40, 40),
      b('g', 20, 140, 40, 40), b('h', 80, 140, 40, 40),
    ];
    assert.equal(planTidyUp(boxes).cols, 3);
  });

  check('modal-gap tie → smaller value wins', () => {
    // gaps 10,20 (each once) → tie → 10
    const boxes = [b('a', 20, 0, 40, 40), b('b', 70, 0, 40, 40), b('c', 130, 0, 40, 40)];
    // edges: a right=40, b left=50 → gap 10; b right=90, c left=110 → gap 20
    assert.equal(planTidyUp(boxes).gapX, 10);
  });

  check('opts.gap overrides both axes', () => {
    const boxes = [b('a', 22, 18, 40, 40), b('b', 79, 21, 40, 40), b('c', 18, 81, 40, 40), b('d', 82, 78, 40, 40)];
    const plan = planTidyUp(boxes, { gap: 15 });
    assert.equal(plan.gapX, 15); assert.equal(plan.gapY, 15);
  });

  check('input-order independent (purity)', () => {
    const boxes = [b('a', 22, 18, 40, 40), b('b', 79, 21, 40, 40), b('c', 18, 81, 40, 40), b('d', 82, 78, 40, 40)];
    const shuffled = [boxes[2], boxes[0], boxes[3], boxes[1]];
    assert.deepEqual(planTidyUp(shuffled), planTidyUp(boxes));
  });

  check('block anchor (min left/top) preserved', () => {
    const boxes = [b('a', 22, 18, 40, 40), b('b', 79, 21, 40, 40), b('c', 18, 81, 40, 40), b('d', 82, 78, 40, 40)];
    const inMinL = Math.min(...boxes.map((x) => x.x - x.w / 2));
    const inMinT = Math.min(...boxes.map((x) => x.y - x.h / 2));
    const plan = planTidyUp(boxes);
    const outMinL = Math.min(...plan.cells.map((c) => c.x - 20)); // w/2 = 20
    const outMinT = Math.min(...plan.cells.map((c) => c.y - 20));
    assert.ok(near(outMinL, inMinL) && near(outMinT, inMinT));
  });

  check('mixed widths: column edge gap equals gapX (columns sized to content)', () => {
    // row with a wide box then a narrow one; gap should be edge-to-edge
    const boxes = [b('a', 40, 0, 80, 40), b('b', 140, 3, 40, 40), b('c', 40, 80, 80, 40), b('d', 140, 78, 40, 40)];
    const plan = planTidyUp(boxes);
    // between col0 (width 80) and col1: right edge of col0 center + 40, left edge of col1 center - 20
    const c0 = plan.cells.find((c) => c.id === 'a');
    const c1 = plan.cells.find((c) => c.id === 'b');
    const edgeGap = (c1.x - 20) - (c0.x + 40);
    assert.ok(near(edgeGap, plan.gapX), `edgeGap ${edgeGap} vs gapX ${plan.gapX}`);
  });

  check('-0 normalized to +0 in output positions', () => {
    const boxes = [b('a', 0, 0, 0, 0), b('b', -0, -0, 0, 0), b('c', 60, 0, 40, 40)];
    for (const c of planTidyUp(boxes).cells) {
      assert.ok(Object.is(c.x, c.x + 0) && !Object.is(c.x, -0));
      assert.ok(!Object.is(c.y, -0));
    }
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
