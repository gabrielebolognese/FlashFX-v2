// Deterministic compiler — acceptance. Compiles the permanent fixtures and asserts the properties
// you CANNOT see on the canvas: ids preserved, no milliseconds surviving (integral frames + beat
// math), no colors chosen outside the style contract, panels contiguous, presets expanded, the
// cloner path exercised, staggered reveal staggered, and boundary mismatches REPORTED. Finally it
// resolves several frames to prove the output is renderable (structurally). The VISUAL check is
// __aiCompile() in the browser; this guards the rest.
//   node scripts/verify-compiler.mjs   (or: npm run verify:compiler)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// interpolation.ts (via the expression engine) references Worker at load — stub it.
globalThis.Worker = class { constructor() {} postMessage() {} terminate() {} addEventListener() {} };
// Text measurement uses OffscreenCanvas (browser-only). Stub a coarse 2D context so the text path
// actually resolves in Node (the real measurement runs in the browser during the visual check).
globalThis.OffscreenCanvas = class {
  getContext() {
    return { font: '', measureText: (t) => ({ width: (t ? t.length : 0) * 10, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 }) };
  }
};

const tmp = mkdtempSync(join(tmpdir(), 'compiler-verify-'));
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
async function bundle(entry) {
  const out = join(tmp, entry.replace(/[\\/]/g, '_') + '.mjs');
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}
const isInt = (n) => Number.isInteger(n);

try {
  const ai = await bundle('src/ai/index.ts');
  const fx = await bundle('src/ai/fixtures.ts');
  const interp = await bundle('src/core/interpolation.ts');
  const material = await bundle('src/core/material.ts');
  const { compile, PRESET_CATALOG } = ai;
  const { FIXTURES } = fx;
  const { resolveFrame } = interp;
  const { hexToVec4 } = material;

  console.log('Deterministic compiler — acceptance\n');

  // Catalog / schema agreement.
  ok('preset catalog covers exactly the 8 named presets', () => {
    const names = Object.keys(PRESET_CATALOG).sort();
    assert.deepEqual(names, ['emphasisPulse', 'fadeIn', 'fadeOut', 'popIn', 'scaleOut', 'slideIn', 'slideOut', 'staggerReveal']);
  });

  const r = compile(FIXTURES.showreel.director, FIXTURES.showreel.fragments, { fps: 30, tier: 'pro', seed: 1 });

  ok('showreel compiles clean (no error issues)', () => {
    assert.equal(r.report.ok, true, JSON.stringify(r.report.issues, null, 2));
  });

  ok('beat conversion happened once: beat=8f, panels rebuilt on the grid, duration=128f', () => {
    assert.equal(r.plan.beatFrames, 8);            // round(250ms * 30 / 1000) = 8
    assert.equal(r.plan.durationFrames, 128);      // 4000ms → 16 beats → 128f
    assert.deepEqual(r.plan.panels.map((p) => [p.start, p.end]), [[0, 64], [64, 128]]);
  });

  const comp = r.composition;
  const layerIds = comp.layers.map((l) => l.id);

  ok('every Coder layer id survives assembly unchanged (never re-minted)', () => {
    const emitted = FIXTURES.showreel.fragments.flatMap((f) => f.layers.map((l) => l.id));
    for (const id of emitted) assert.ok(layerIds.includes(id), `missing id ${id}`);
    // and no timestamp-minted ids leaked in
    for (const id of layerIds) assert.ok(/^p\d+:/.test(id), `layer id not namespaced: ${id}`);
  });

  ok('no milliseconds survive: all frame fields are integers', () => {
    assert.ok(isInt(comp.settings.durationFrames));
    for (const l of comp.layers) {
      assert.ok(isInt(l.inPoint) && isInt(l.outPoint), `layer ${l.id} in/out not integral`);
      const t = l.transform;
      if (t) for (const key of Object.keys(t)) {
        const p = t[key];
        if (p && Array.isArray(p.keyframes)) for (const k of p.keyframes) assert.ok(isInt(k.frame), `${l.id}.${key} kf frame ${k.frame} not integral`);
      }
    }
    for (const p of r.plan.panels) assert.ok(isInt(p.start) && isInt(p.end));
  });

  ok('no colors chosen outside the contract (styles ⊆ palette; links resolve)', () => {
    const palette = FIXTURES.showreel.director.styleContract.palette;
    const paletteLiterals = palette.map((e) => JSON.stringify(hexToVec4(e.color)));
    // registered styles are exactly the palette
    const styleColors = Object.values(r.styles).map((s) => JSON.stringify(s.value.color)).sort();
    assert.deepEqual(styleColors, [...paletteLiterals].sort());
    // every fill/stroke style link points at a registered style
    for (const l of comp.layers) {
      if (l.fillStyleId) assert.ok(r.styles[l.fillStyleId], `dangling fillStyleId ${l.fillStyleId}`);
      if (l.strokeStyleId) assert.ok(r.styles[l.strokeStyleId], `dangling strokeStyleId ${l.strokeStyleId}`);
      // shape fill literals must be a palette color or the neutral default
      if (l.type === 'shape') {
        const fc = JSON.stringify(l.shape.fillColor);
        assert.ok(paletteLiterals.includes(fc) || fc === JSON.stringify([0.6, 0.6, 0.6, 1]), `shape ${l.id} fill outside contract`);
      }
    }
  });

  ok('panels are contiguous and gapless', () => {
    const ps = [...r.plan.panels].sort((a, b) => a.order - b.order);
    for (let i = 0; i < ps.length - 1; i++) assert.equal(ps[i].end, ps[i + 1].start, `gap between panel ${i} and ${i + 1}`);
  });

  ok('presets expanded to real keyframe tracks', () => {
    const card = comp.layers.find((l) => l.id === 'p0:card');
    assert.ok(card.transform.scale.keyframes.length >= 2, 'popIn should produce scale keyframes');
    const sub = comp.layers.find((l) => l.id === 'p0:sub');
    assert.ok(sub.transform.opacity.keyframes.length >= 2, 'fadeIn should produce opacity keyframes');
    assert.ok(sub.transform.scale.keyframes.length >= 2, 'emphasisPulse should produce scale keyframes');
  });

  ok('the cloner/effector path is materialised as a real cloner layer', () => {
    const cl = comp.layers.find((l) => l.id === 'p1:grid');
    assert.equal(cl.type, 'cloner');
    assert.equal(cl.distribution.type, 'grid');
    assert.equal(cl.distribution.countX, 7);
    assert.equal(cl.renderCount, 7);
    assert.equal(cl.sourceRef.layerId, 'p1:src');
  });

  ok('staggerReveal staggers: each chip enters later than the previous', () => {
    const starts = ['p1:chip1', 'p1:chip2', 'p1:chip3'].map((id) => {
      const chip = comp.layers.find((l) => l.id === id);
      return chip.transform.scale.keyframes[0].frame;
    });
    assert.deepEqual(starts, [0, 6, 12], `expected staggered starts, got ${starts}`);
  });

  ok('parenting preserved (chips reference the group)', () => {
    for (const id of ['p1:chip1', 'p1:chip2', 'p1:chip3']) {
      assert.equal(comp.layers.find((l) => l.id === id).parentId, 'p1:row');
    }
  });

  ok('the compiled composition resolves at multiple frames without throwing (renderable)', () => {
    for (const f of [0, 10, 40, 64, 90, 127]) {
      const frame = resolveFrame(comp, f);
      assert.ok(Array.isArray(frame.layers), `frame ${f} did not resolve`);
    }
  });

  ok('determinism: recompiling the same inputs is byte-identical', () => {
    const r2 = compile(FIXTURES.showreel.director, FIXTURES.showreel.fragments, { fps: 30, tier: 'pro', seed: 1 });
    assert.deepStrictEqual(r2.composition, comp);
    assert.equal(r2.aiMeta.digest, r.aiMeta.digest);
  });

  // Negative: boundary mismatch must be REPORTED, not papered over.
  ok('a boundary mismatch is reported as an error (not silently fixed)', () => {
    const bad = compile(FIXTURES.boundaryMismatch.director, FIXTURES.boundaryMismatch.fragments, { fps: 30, tier: 'pro', seed: 1 });
    assert.equal(bad.report.ok, false);
    assert.ok(bad.report.issues.some((i) => i.code === 'boundary-mismatch'), 'expected a boundary-mismatch issue');
  });

  console.log(`\n✅ ${passed} checks passed`);
} catch (err) {
  console.error('\n❌ verify-compiler failed:\n', err);
  process.exit(1);
}
