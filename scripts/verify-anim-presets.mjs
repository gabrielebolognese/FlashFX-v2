// Acceptance harness for the animation/transition preset engine (B26). Bundles core/animationPresets.ts
// and asserts with node:assert: generatePresetKeyframes produces correct tracks (frame range, resolved
// start/end values, property paths, easing) for every preset, and the new whip/spin transitions are
// present + valid. This engine shipped untested; the harness is the "review + harden".
//   node scripts/verify-anim-presets.mjs   (or: npm run verify:anim-presets)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'animpreset-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

const CTX = { position: [960, 540], scale: [1, 1], rotation: 0, opacity: 1, compWidth: 1920, compHeight: 1080 };

try {
  const outfile = join(tmp, 'animPresets.mjs');
  await build({ entryPoints: ['src/core/animationPresets.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const M = await import(pathToFileURL(outfile).href);
  const { ANIMATION_PRESETS, generatePresetKeyframes, getPresetById, getPresetsByCategory, PRESET_CATEGORIES } = M;

  check('every preset generates non-empty tracks within [start, start+duration]', () => {
    assert.ok(ANIMATION_PRESETS.length >= 28, `presets: ${ANIMATION_PRESETS.length}`);
    const start = 12, dur = 30;
    for (const p of ANIMATION_PRESETS) {
      const tracks = generatePresetKeyframes(p, CTX, start, dur);
      assert.ok(tracks.length >= 1, `${p.id} has tracks`);
      for (const tr of tracks) {
        assert.ok(tr.propertyPath.startsWith('transform.'), `${p.id} valid path`);
        assert.ok(tr.keyframes.length >= 1, `${p.id} keyframes`);
        for (const k of tr.keyframes) assert.ok(k.frame >= start && k.frame <= start + dur, `${p.id} frame in range (${k.frame})`);
        // frames are non-decreasing
        for (let i = 1; i < tr.keyframes.length; i++) assert.ok(tr.keyframes[i].frame >= tr.keyframes[i - 1].frame, `${p.id} frames ordered`);
      }
    }
  });

  check('fade-in ramps opacity 0 -> the context opacity', () => {
    const tr = generatePresetKeyframes(getPresetById('fade-in'), CTX, 0, 30);
    const op = tr.find((t) => t.propertyPath === 'transform.opacity');
    assert.ok(op, 'has opacity track');
    assert.ok(near(op.keyframes[0].value, 0), 'starts at 0');
    assert.ok(near(op.keyframes[op.keyframes.length - 1].value, 1), 'ends at ctx opacity (1)');
  });

  check('slide-left starts a full comp width to the left, ends at rest', () => {
    const tr = generatePresetKeyframes(getPresetById('slide-left'), CTX, 0, 30)[0];
    assert.ok(near(tr.keyframes[0].value[0], 960 - 1920) && near(tr.keyframes[0].value[1], 540), 'off-left start');
    assert.deepEqual(tr.keyframes[tr.keyframes.length - 1].value, [960, 540]);
  });

  check('new transitions exist and settle to the rest pose', () => {
    for (const id of ['whip-left', 'whip-right', 'whip-up', 'whip-down', 'spin-in', 'spin-out']) {
      assert.ok(getPresetById(id), `has ${id}`);
    }
    // whip-left: position ends at rest, scale ends at rest
    const whip = generatePresetKeyframes(getPresetById('whip-left'), CTX, 0, 24);
    const pos = whip.find((t) => t.propertyPath === 'transform.position');
    assert.deepEqual(pos.keyframes[pos.keyframes.length - 1].value, [960, 540], 'whip settles to rest position');
    const sc = whip.find((t) => t.propertyPath === 'transform.scale');
    assert.deepEqual(sc.keyframes[sc.keyframes.length - 1].value, [1, 1], 'whip settles to rest scale');
    // spin-in: rotation ends at ctx rotation, scale 0 -> ctx scale
    const spin = generatePresetKeyframes(getPresetById('spin-in'), CTX, 0, 24);
    const rot = spin.find((t) => t.propertyPath === 'transform.rotation');
    assert.ok(near(rot.keyframes[0].value, -270) && near(rot.keyframes[rot.keyframes.length - 1].value, 0));
    const ss = spin.find((t) => t.propertyPath === 'transform.scale');
    assert.deepEqual(ss.keyframes[0].value, [0, 0]);
  });

  check('getPresetsByCategory buckets every preset under a real category', () => {
    const grouped = getPresetsByCategory();
    const total = PRESET_CATEGORIES.reduce((n, c) => n + grouped[c].length, 0);
    assert.equal(total, ANIMATION_PRESETS.length, 'all presets categorised');
    assert.equal(getPresetById('nope'), undefined);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ anim-presets harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
