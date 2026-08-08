// Acceptance harness for the rulers core (core/rulers.ts): nice-number ticks + pixel snap.
// Run: node scripts/verify-rulers.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'rulers-verify-'));
const outfile = join(tmp, 'r.mjs');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

try {
  await build({ entryPoints: ['src/core/rulers.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { niceStep, generateRulerTicks, formatTickLabel, snapToPixel, snapRectToPixel } = await import(pathToFileURL(outfile).href);

  check('niceStep follows the 1/2/5 progression across decades', () => {
    assert.ok(near(niceStep(0.3), 0.5)); // 0.5 = 5×0.1, the nice number ≥ 0.3
    assert.equal(niceStep(1), 1);
    assert.equal(niceStep(1.5), 2);
    assert.equal(niceStep(3), 5);
    assert.equal(niceStep(7), 10);
    assert.equal(niceStep(23), 50);
    assert.ok(near(niceStep(0.06), 0.1));
    assert.equal(niceStep(400), 500);
  });

  check('major step keeps label spacing in a sane px band across zooms', () => {
    for (const ppu of [0.1, 0.5, 1, 4, 10, 64]) {
      const { step } = generateRulerTicks(0, 4000, ppu, 70);
      const px = step * ppu;
      assert.ok(px >= 35 && px <= 160, `ppu ${ppu} → ${px}px label spacing`);
    }
  });

  check('labels appear only on major ticks (which sit on the step)', () => {
    const { ticks, step } = generateRulerTicks(0, 500, 1, 70);
    for (const t of ticks) {
      if (t.label !== undefined) {
        assert.equal(t.major, true);
        assert.ok(Math.abs(t.value / step - Math.round(t.value / step)) < 1e-6);
      } else {
        assert.equal(t.major, false);
      }
    }
  });

  check('0 is included and is a labelled major at screenPos 0', () => {
    const { ticks } = generateRulerTicks(0, 1000, 1, 70);
    const zero = ticks.find((t) => t.value === 0);
    assert.ok(zero && zero.major && zero.label === '0' && zero.screenPos === 0);
  });

  check('screenPos = value * pxPerUnit', () => {
    const { ticks } = generateRulerTicks(0, 300, 2.5, 70);
    for (const t of ticks) assert.ok(near(t.screenPos, t.value * 2.5));
  });

  check('tick count is bounded on a huge range / tiny scale', () => {
    const { ticks } = generateRulerTicks(0, 1_000_000, 0.01, 70);
    assert.ok(ticks.length <= 2000, `got ${ticks.length}`);
  });

  check('minStep floors the step at extreme zoom (no sub-pixel labels)', () => {
    const { step } = generateRulerTicks(0, 100, 64, 70, 1);
    assert.ok(step >= 1);
    const { ticks } = generateRulerTicks(0, 100, 64, 70, 1);
    assert.ok(ticks.every((t) => Number.isInteger(t.value)));
  });

  check('deterministic', () => {
    assert.deepEqual(generateRulerTicks(0, 1920, 1.3, 70), generateRulerTicks(0, 1920, 1.3, 70));
  });

  check('no -0 in any screenPos; snapToPixel normalizes -0', () => {
    const { ticks } = generateRulerTicks(-50, 50, 1, 70);
    for (const t of ticks) assert.ok(!Object.is(t.screenPos, -0));
    assert.equal(snapToPixel(-0.4), 0);
    assert.ok(!Object.is(snapToPixel(-0.4), -0));
    assert.ok(!Object.is(snapToPixel(-0), -0));
  });

  check('negative rangeStart still includes 0 as a major tick', () => {
    const { ticks } = generateRulerTicks(-200, 200, 1, 70);
    const zero = ticks.find((t) => t.value === 0);
    assert.ok(zero && zero.major);
  });

  check('snapToPixel / snapRectToPixel round to integers', () => {
    assert.equal(snapToPixel(100.4), 100);
    assert.equal(snapToPixel(100.6), 101);
    assert.deepEqual(snapRectToPixel({ x: 10.2, y: 5.9, w: 100.4, h: 50.6 }), { x: 10, y: 6, w: 100, h: 51 });
  });

  check('formatTickLabel: integers plain, fractions trimmed', () => {
    assert.equal(formatTickLabel(100), '100');
    assert.equal(formatTickLabel(0), '0');
    assert.equal(formatTickLabel(2.5), '2.5');
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
