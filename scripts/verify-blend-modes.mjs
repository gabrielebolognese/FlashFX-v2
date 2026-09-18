// Acceptance harness for the blend-mode reference math (B11c, pure). Bundles core/effects/blendModes.ts
// and asserts with node:assert against known W3C values. This is the spec the renderer's WGSL mirrors;
// the content-layer GPU wiring (pipeline variants / scene composite) is browser-gated (B11c-gpu).
//   node scripts/verify-blend-modes.mjs   (or: npm run verify:blend-modes)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'blend-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

try {
  const outfile = join(tmp, 'blendModes.mjs');
  await build({ entryPoints: ['src/core/effects/blendModes.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const M = await import(pathToFileURL(outfile).href);
  const { blendChannel, blendRGB, BLEND_MODES, BLEND_MODE_META, isHardwareBlend } = M;
  const bc = blendChannel;

  check('normal = source (identity over backdrop)', () => {
    assert.ok(near(bc(0.3, 0.7, 'normal'), 0.7));
    assert.ok(near(bc(0.0, 1.0, 'normal'), 1.0));
  });

  check('multiply / screen are complementary and match known values', () => {
    assert.ok(near(bc(0.5, 0.5, 'multiply'), 0.25));
    assert.ok(near(bc(0.5, 0.5, 'screen'), 0.75));
    // screen(a,b) = 1 - (1-a)(1-b); multiply(a,b)=a*b
    assert.ok(near(bc(0.2, 0.8, 'screen'), 1 - 0.8 * 0.2));
    assert.ok(near(bc(1, 0.4, 'multiply'), 0.4));
    assert.ok(near(bc(0, 0.4, 'screen'), 0.4));
  });

  check('darken / lighten pick min / max', () => {
    assert.ok(near(bc(0.3, 0.7, 'darken'), 0.3));
    assert.ok(near(bc(0.3, 0.7, 'lighten'), 0.7));
  });

  check('overlay = hardLight with args swapped; both match the piecewise form', () => {
    // backdrop 0.25, source 0.6 -> overlay uses hardLight(0.6, 0.25): 0.25<=0.5 -> 2*0.6*0.25 = 0.3
    assert.ok(near(bc(0.25, 0.6, 'overlay'), 0.3));
    // hardLight(0.25, 0.6): 0.6>0.5 -> 1 - 2*(1-0.25)*(1-0.6) = 1 - 2*0.75*0.4 = 0.4
    assert.ok(near(bc(0.25, 0.6, 'hardLight'), 0.4));
    // overlay(cb,cs) == hardLight(cs,cb)
    assert.ok(near(bc(0.7, 0.2, 'overlay'), bc(0.2, 0.7, 'hardLight')));
  });

  check('difference / exclusion', () => {
    assert.ok(near(bc(0.8, 0.3, 'difference'), 0.5));
    assert.ok(near(bc(0.5, 0.5, 'exclusion'), 0.5)); // 0.5+0.5-2*0.25 = 0.5
    assert.ok(near(bc(1, 1, 'difference'), 0));
  });

  check('colorDodge / colorBurn edge cases clamp correctly', () => {
    assert.ok(near(bc(0.5, 1, 'colorDodge'), 1));   // source 1 -> full dodge
    assert.ok(near(bc(0, 0.9, 'colorDodge'), 0));    // backdrop 0 -> 0
    assert.ok(near(bc(0.5, 0, 'colorBurn'), 0));      // source 0 -> 0
    assert.ok(near(bc(1, 0.5, 'colorBurn'), 1));      // backdrop 1 -> 1
    assert.ok(near(bc(0.5, 0.5, 'colorDodge'), 1));   // 0.5/(1-0.5)=1
  });

  check('add is linear dodge, clamped to 1', () => {
    assert.ok(near(bc(0.6, 0.6, 'add'), 1));
    assert.ok(near(bc(0.3, 0.4, 'add'), 0.7));
  });

  check('softLight is continuous at cs=0.5 (equals backdrop)', () => {
    assert.ok(near(bc(0.4, 0.5, 'softLight'), 0.4, 1e-9));
    assert.ok(near(bc(0.9, 0.5, 'softLight'), 0.9, 1e-9));
  });

  check('every channel result stays within [0,1] over a grid', () => {
    for (const mode of BLEND_MODES) {
      for (let cb = 0; cb <= 1.0001; cb += 0.1) {
        for (let cs = 0; cs <= 1.0001; cs += 0.1) {
          const v = bc(cb, cs, mode);
          assert.ok(v >= -1e-9 && v <= 1 + 1e-9, `${mode}(${cb.toFixed(1)},${cs.toFixed(1)})=${v}`);
        }
      }
    }
  });

  check('blendRGB applies per channel', () => {
    const out = blendRGB([0.2, 0.5, 0.8], [0.5, 0.5, 0.5], 'multiply');
    assert.ok(near(out[0], 0.1) && near(out[1], 0.25) && near(out[2], 0.4));
  });

  check('metadata: hardware set is exactly normal/darken/multiply/lighten/screen/add', () => {
    const hw = BLEND_MODES.filter((m) => isHardwareBlend(m)).sort();
    assert.deepEqual(hw, ['add', 'darken', 'lighten', 'multiply', 'normal', 'screen'].sort());
    assert.equal(isHardwareBlend('overlay'), false);
    assert.equal(isHardwareBlend('softLight'), false);
    // every mode in the union has a label + meta
    for (const m of BLEND_MODES) assert.ok(BLEND_MODE_META[m] && BLEND_MODE_META[m].label.length > 0, `meta for ${m}`);
    assert.equal(BLEND_MODES.length, 13);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ blend-modes harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
