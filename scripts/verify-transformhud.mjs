// Acceptance harness for the pure transform-HUD formatting/positioning core
// (ui/panels/transformHud.ts). Bundles the real TS with esbuild and asserts with
// node:assert. Run: node scripts/verify-transformhud.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'hud-verify-'));
const outfile = join(tmp, 'hud.mjs');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

try {
  await build({ entryPoints: ['src/ui/panels/transformHud.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { fmtNum, normalizeAngle, hudLabel, clampHud } = await import(pathToFileURL(outfile).href);

  // ── fmtNum ──
  check('fmtNum: whole numbers drop the decimal', () => {
    assert.equal(fmtNum(100), '100');
    assert.equal(fmtNum(0), '0');
    assert.equal(fmtNum(99.96), '100'); // rounds up to a whole → no ".0"
  });
  check('fmtNum: fractional keeps one decimal', () => {
    assert.equal(fmtNum(100.5), '100.5');
    assert.equal(fmtNum(100.04), '100');   // rounds to 100.0 → "100"
    assert.equal(fmtNum(100.05), '100.1');  // rounds to 100.1
  });
  check('fmtNum: -0 normalizes to 0 (never "-0")', () => {
    assert.equal(fmtNum(-0), '0');
    assert.equal(fmtNum(-0.01), '0'); // rounds to -0 → "0"
  });
  check('fmtNum: negatives keep the sign', () => {
    assert.equal(fmtNum(-45), '-45');
    assert.equal(fmtNum(-12.5), '-12.5');
  });

  // ── normalizeAngle → (-180, 180] ──
  check('normalizeAngle folds into (-180, 180]', () => {
    assert.equal(normalizeAngle(0), 0);
    assert.equal(normalizeAngle(45), 45);
    assert.equal(normalizeAngle(350), -10);
    assert.equal(normalizeAngle(-350), 10);
    assert.equal(normalizeAngle(360), 0);
    assert.equal(normalizeAngle(-360), 0);
    assert.equal(normalizeAngle(180), 180);
    assert.equal(normalizeAngle(-180), 180);   // lower bound folds to +180
    assert.equal(normalizeAngle(540), 180);
    assert.equal(normalizeAngle(270), -90);
  });

  // ── hudLabel ──
  check('hudLabel: move → "X, Y" absolute', () => {
    assert.equal(hudLabel('move', 20, 30), '20, 30');
    assert.equal(hudLabel('move', -5.5, 0), '-5.5, 0');
  });
  check('hudLabel: resize → "W × H" with U+00D7', () => {
    assert.equal(hudLabel('resize', 100, 60), '100 × 60');
    assert.ok(hudLabel('resize', 100, 60).includes('×'));
    assert.ok(!hudLabel('resize', 100, 60).includes('x')); // real ×, not letter x
  });
  check('hudLabel: rotate → signed degrees, normalized', () => {
    assert.equal(hudLabel('rotate', 45), '45°');
    assert.equal(hudLabel('rotate', 350), '-10°'); // absolute angle wrapped
    assert.equal(hudLabel('rotate', 0), '0°');
  });
  check('hudLabel: radius → "R n"', () => {
    assert.equal(hudLabel('radius', 12), 'R 12');
    assert.equal(hudLabel('radius', 0), 'R 0');
  });

  // ── clampHud ──
  check('clampHud: default offset down-right of the cursor', () => {
    const p = clampHud(100, 100, 60, 20, 1000, 800);
    assert.deepEqual(p, { x: 116, y: 116 });
  });
  check('clampHud: flips left near the right edge', () => {
    const p = clampHud(980, 100, 60, 20, 1000, 800); // 980+16+60+10 > 1000 → flip
    assert.ok(p.x < 980, `x=${p.x} should be left of the cursor`);
    assert.ok(p.x >= 10, 'stays inside left margin');
  });
  check('clampHud: flips up near the bottom edge', () => {
    const p = clampHud(100, 790, 60, 20, 1000, 800);
    assert.ok(p.y < 790, `y=${p.y} should be above the cursor`);
    assert.ok(p.y >= 10, 'stays inside top margin');
  });
  check('clampHud: never leaves the viewport margins', () => {
    for (const [cx, cy] of [[0, 0], [1000, 800], [-50, 900], [5, 5]]) {
      const p = clampHud(cx, cy, 60, 20, 1000, 800);
      assert.ok(p.x >= 10 && p.x <= 1000 - 60 - 10, `x=${p.x} out of bounds`);
      assert.ok(p.y >= 10 && p.y <= 800 - 20 - 10, `y=${p.y} out of bounds`);
    }
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
