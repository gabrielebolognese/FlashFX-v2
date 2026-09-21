// Acceptance harness for the B30 practical-VFX catalog + sweep math (pure). Bundles
// core/vfx/vfxElements.ts and asserts with node:assert: the curated element catalog is well-formed
// (screen/add blend, valid pattern types, black-anchored warm palettes), and buildVfxSweep emits a
// correct opacity envelope + drift as keyframes. The generativePattern layer creation, screen/add
// blend render, and preview are browser-only.
//   node scripts/verify-vfx.mjs   (or: npm run verify:vfx)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'vfx-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const PATTERN_TYPES = ['waves', 'plasma', 'kaleidoscope', 'mosaic', 'clouds', 'voronoi', 'rings', 'spiral', 'interference', 'gradient', 'warp'];

try {
  const outfile = join(tmp, 'vfx.mjs');
  await build({ entryPoints: ['src/core/vfx/vfxElements.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const M = await import(pathToFileURL(outfile).href);
  const { VFX_ELEMENTS, getVfxElement, buildVfxSweep } = M;

  check('catalog: non-empty, unique ids, screen/add blend, valid pattern types, black-anchored warm palettes', () => {
    assert.ok(Array.isArray(VFX_ELEMENTS) && VFX_ELEMENTS.length >= 6, 'has a catalog');
    const ids = new Set();
    for (const e of VFX_ELEMENTS) {
      assert.ok(!ids.has(e.id), `unique id ${e.id}`); ids.add(e.id);
      assert.ok(e.label && typeof e.label === 'string', `${e.id} has label`);
      assert.ok(['light-leak', 'film-burn', 'atmosphere'].includes(e.category), `${e.id} category`);
      assert.ok(e.blend === 'screen' || e.blend === 'add', `${e.id} blend is screen/add (the only content-layer blend that renders)`);
      assert.ok(PATTERN_TYPES.includes(e.pattern.type), `${e.id} valid pattern type ${e.pattern.type}`);
      assert.ok(Array.isArray(e.pattern.palette) && e.pattern.palette.length >= 2, `${e.id} palette >= 2 stops`);
      const first = e.pattern.palette[0].color;
      assert.ok(first[0] === 0 && first[1] === 0 && first[2] === 0, `${e.id} palette starts at black (so screen/add only adds highlights)`);
      for (const s of e.pattern.palette) { for (const c of s.color) assert.ok(c >= 0 && c <= 1, `${e.id} colour in range`); assert.ok(s.pos >= 0 && s.pos <= 1, 'pos in range'); }
    }
  });

  check('getVfxElement resolves by id and returns undefined for unknown', () => {
    assert.equal(getVfxElement(VFX_ELEMENTS[0].id).id, VFX_ELEMENTS[0].id);
    assert.equal(getVfxElement('nope'), undefined);
  });

  check('buildVfxSweep: opacity envelope rises to peak then falls, values in [0,1], correct end frames', () => {
    const t = buildVfxSweep({ fadeInFrac: 0.2, fadeOutFrac: 0.2, peakOpacity: 0.8 }, { compWidth: 1920, compHeight: 1080 }, 0, 100);
    const o = t.opacity;
    assert.ok(o.length >= 3, 'has envelope keys');
    assert.equal(o[0].frame, 0); assert.equal(o[0].value, 0, 'starts transparent');
    assert.equal(o[o.length - 1].frame, 100); assert.equal(o[o.length - 1].value, 0, 'ends transparent');
    const peak = Math.max(...o.map((k) => k.value));
    assert.ok(Math.abs(peak - 0.8) < 1e-9, 'reaches peak 0.8');
    for (const k of o) assert.ok(k.value >= 0 && k.value <= 1, 'opacity in range');
    // rise-then-fall: strictly non-decreasing to the max index, then non-increasing
    let maxIdx = 0; for (let i = 1; i < o.length; i++) if (o[i].value > o[maxIdx].value) maxIdx = i;
    for (let i = 1; i <= maxIdx; i++) assert.ok(o[i].value >= o[i - 1].value - 1e-9, 'rising to peak');
    for (let i = maxIdx + 1; i < o.length; i++) assert.ok(o[i].value <= o[i - 1].value + 1e-9, 'falling from peak');
    // frames sorted + within [0,100]
    for (let i = 1; i < o.length; i++) assert.ok(o[i].frame > o[i - 1].frame, 'frames strictly increasing');
    assert.ok(o.every((k) => k.frame >= 0 && k.frame <= 100), 'frames in clip');
  });

  check('buildVfxSweep: no fades -> no opacity keyframes (constant peak); film-burn flash is asymmetric', () => {
    const flat = buildVfxSweep({ fadeInFrac: 0, fadeOutFrac: 0, peakOpacity: 0.5 }, { compWidth: 100, compHeight: 100 }, 0, 60);
    assert.equal(flat.opacity.length, 0, 'constant opacity has no keyframes');
    const burn = buildVfxSweep({ fadeInFrac: 0.1, fadeOutFrac: 0.4, peakOpacity: 1 }, { compWidth: 100, compHeight: 100 }, 0, 100);
    // fast in (~frame 10), slow out (~frame 60): the in-ramp is shorter than the out-ramp
    const inFrame = burn.opacity.find((k) => k.value === 1).frame;
    const outHold = [...burn.opacity].reverse().find((k) => k.value === 1).frame;
    assert.ok(inFrame < 100 - outHold, `flash rises faster than it falls (in ${inFrame}, out-from ${outHold})`);
  });

  check('buildVfxSweep: drift maps normalized endpoints to comp pixels; no drift -> null', () => {
    const t = buildVfxSweep({ fadeInFrac: 0.1, fadeOutFrac: 0.1, peakOpacity: 0.9, driftFrom: [-0.2, 0.3], driftTo: [1.2, 0.7] }, { compWidth: 1000, compHeight: 500 }, 0, 50);
    assert.ok(t.position && t.position.length === 2, 'has 2 position keys');
    assert.deepEqual(t.position[0].value, [-200, 150], 'start = from * comp');
    assert.deepEqual(t.position[1].value, [1200, 350], 'end = to * comp');
    assert.equal(t.position[0].frame, 0); assert.equal(t.position[1].frame, 50);
    const nodrift = buildVfxSweep({ fadeInFrac: 0.1, fadeOutFrac: 0.1, peakOpacity: 0.9 }, { compWidth: 100, compHeight: 100 }, 0, 50);
    assert.equal(nodrift.position, null, 'no drift -> null');
  });

  check('buildVfxSweep: startFrame offset carries through; determinism', () => {
    const t = buildVfxSweep({ fadeInFrac: 0.2, fadeOutFrac: 0.2, peakOpacity: 0.8 }, { compWidth: 800, compHeight: 600 }, 30, 60);
    assert.equal(t.opacity[0].frame, 30, 'envelope starts at startFrame');
    assert.equal(t.opacity[t.opacity.length - 1].frame, 90, 'ends at startFrame+dur');
    const a = buildVfxSweep({ fadeInFrac: 0.15, fadeOutFrac: 0.25, peakOpacity: 0.7, driftFrom: [0, 0], driftTo: [1, 1] }, { compWidth: 640, compHeight: 480 }, 5, 40);
    const b = buildVfxSweep({ fadeInFrac: 0.15, fadeOutFrac: 0.25, peakOpacity: 0.7, driftFrom: [0, 0], driftTo: [1, 1] }, { compWidth: 640, compHeight: 480 }, 5, 40);
    assert.deepEqual(a, b, 'identical inputs -> identical output');
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ vfx harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
