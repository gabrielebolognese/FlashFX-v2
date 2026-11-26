// Acceptance harness for B58 gradient-blob field (pattern type 'blobField', src/patterns/blobField.ts).
// Pure, GPU-free: seeded determinism, frame purity, drift, the cloud-floor edge, palette use, the agent
// option builder, config persistence, and that every older pattern type samples exactly as before.
// The GPU twin (PATTERN_SHADER pattern id 11) is proven against this module by gpu:blob-field.
//   node scripts/verify-blob-field.mjs   (or: npm run verify:blob-field)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'blob-field-verify-'));
const outfile = join(tmp, 'bundle.mjs');
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

try {
  await build({
    stdin: {
      contents: `
        export { patternValue, samplePalette, patternSample } from './src/patterns/patterns';
        export { parsePatternConfig, serializePatternConfig } from './src/patterns/config';
        export { PATTERN_PRESETS, DEFAULT_PATTERN } from './src/patterns/presets';
        export { PATTERN_TYPES, PATTERN_TYPE } from './src/patterns/types';
        export * from './src/patterns/blobField';
        export { createGenerativePatternLayer } from './src/core/factory';
        export { validateComposition } from './src/project-system/services/validation';
      `,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  const m = await import(pathToFileURL(outfile).href);
  const {
    patternValue, samplePalette, patternSample, parsePatternConfig, serializePatternConfig, PATTERN_PRESETS, DEFAULT_PATTERN,
    PATTERN_TYPES, PATTERN_TYPE, blobFieldSample, resolveBlobParams, applyBlobFieldOptions, hashU32, rand3, blobAt,
    BLOB_FLOOR_COLORS, parseHexRgb, createGenerativePatternLayer, validateComposition,
  } = m;

  console.log('B58 gradient-blob field - acceptance\n');

  const field = applyBlobFieldOptions(null, { mode: 'field', seed: 3, count: 6 });
  const floor = applyBlobFieldOptions(null, { mode: 'floor', seed: 1, floor: 0.4, lumps: 0.1, warp: 0, billow: 0 });
  const A = 16 / 9;
  const grid = (cfg, t, n = 24) => {
    const out = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) out.push(patternSample(cfg, (i + 0.5) / n, (j + 0.5) / n, A, t));
    return out;
  };
  const maxDiff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(a[i][c] - b[i][c])); return d; };

  check('type ids: blobField appended as 11, every older id unchanged', () => {
    assert.equal(PATTERN_TYPE.blobField, 11);
    assert.deepEqual(PATTERN_TYPES.slice(0, 11), ['waves', 'plasma', 'kaleidoscope', 'mosaic', 'clouds', 'voronoi', 'rings', 'spiral', 'interference', 'gradient', 'warp']);
    PATTERN_TYPES.slice(0, 11).forEach((t, i) => assert.equal(PATTERN_TYPE[t], i));
  });

  check('older pattern types: patternSample == samplePalette(patternValue) with alpha 1 (byte-identical CPU path)', () => {
    for (const p of PATTERN_PRESETS.filter((x) => x.config.type !== 'blobField')) {
      for (const t of [0, 1.3, 7.7]) for (let k = 0; k < 40; k++) {
        const u = ((k * 7) % 40) / 39, v = ((k * 13) % 40) / 39;
        const want = samplePalette(p.config.palette, patternValue(p.config, u, v, A, t), p.config.paletteMode === 'smooth');
        const got = patternSample(p.config, u, v, A, t);
        assert.deepEqual(got, [want[0], want[1], want[2], 1], `${p.name} @ ${u},${v},${t}`);
      }
    }
  });

  check('integer hash: deterministic, u32 range, rand in [0, 1), negative lattice coordinates wrap', () => {
    assert.equal(hashU32(12345), hashU32(12345));
    for (let i = -50; i < 50; i++) {
      const h = hashU32(i);
      assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff);
      const r = rand3(i, -i * 3, 7);
      assert.ok(r >= 0 && r < 1);
    }
    assert.equal(rand3(-1, 0, 0), rand3(0xffffffff | 0, 0, 0));
    let mean = 0; for (let i = 0; i < 4000; i++) mean += rand3(i, 1, 2); mean /= 4000;
    assert.ok(Math.abs(mean - 0.5) < 0.02, `rand is uniform-ish (mean ${mean.toFixed(4)})`);
  });

  check('field + floor: finite, in [0, 1], over the frame and over time', () => {
    for (const cfg of [field, floor]) for (const t of [0, 0.5, 3.3, 40]) for (const s of grid(cfg, t, 12)) {
      for (const c of s) assert.ok(Number.isFinite(c) && c >= 0 && c <= 1, JSON.stringify(s));
    }
  });

  check('seeded determinism: the same config gives the same pixels; patternSample routes to blobFieldSample', () => {
    assert.equal(maxDiff(grid(field, 1.7), grid(field, 1.7)), 0);
    assert.deepEqual(patternSample(field, 0.3, 0.6, A, 2), blobFieldSample(field, 0.3, 0.6, A, 2));
  });

  check('frame purity: a frame renders the same whatever was rendered before it', () => {
    const fresh = grid(field, 50 / 30);
    for (const t of [10, 3, 120, 3, 0]) grid(field, t / 30);
    assert.equal(maxDiff(fresh, grid(field, 50 / 30)), 0);
    const freshF = grid(floor, 50 / 30);
    for (const t of [200, 7]) grid(floor, t / 30);
    assert.equal(maxDiff(freshF, grid(floor, 50 / 30)), 0);
  });

  check('seeds differ: another seed lays the blobs out differently', () => {
    const other = { ...field, seed: 4 };
    assert.ok(maxDiff(grid(field, 0), grid(other, 0)) > 0.1);
  });

  check('drift: the field moves over time; speed 0 holds still', () => {
    assert.ok(maxDiff(grid(field, 0), grid(field, 2)) > 0.05);
    const still = { ...field, speed: 0 };
    assert.equal(maxDiff(grid(still, 0), grid(still, 9)), 0);
    const b0 = blobAt(0, 3, 6, A, 1, 0), b1 = blobAt(0, 3, 6, A, 1, 1);
    assert.ok(Math.hypot(b1.x - b0.x, b1.y - b0.y) > 0.01, 'blob 0 centre moves');
  });

  check('field mode is opaque everywhere (alpha 1)', () => {
    for (const s of grid(field, 1.1)) assert.equal(s[3], 1);
  });

  const edgeAt = (cfg, u, t) => {
    // first v (top down) where alpha crosses 0.5
    let prev = patternSample(cfg, u, 0, A, t)[3];
    for (let j = 1; j <= 400; j++) {
      const v = j / 400, a = patternSample(cfg, u, v, A, t)[3];
      if (prev < 0.5 && a >= 0.5) return v;
      prev = a;
    }
    return NaN;
  };

  check('floor: transparent above the edge, opaque at the bottom', () => {
    for (let i = 0; i < 20; i++) {
      const u = (i + 0.5) / 20;
      assert.equal(patternSample(floor, u, 0.02, A, 1)[3], 0, `top transparent @ u ${u}`);
      assert.equal(patternSample(floor, u, 0.995, A, 1)[3], 1, `bottom opaque @ u ${u}`);
    }
  });

  check('floor: the edge sits near floor x height from the bottom and is lumpy across x; lumps 0 = flat', () => {
    const edges = Array.from({ length: 40 }, (_, i) => edgeAt(floor, (i + 0.5) / 40, 1));
    assert.ok(edges.every(Number.isFinite));
    const mean = edges.reduce((a, b) => a + b, 0) / edges.length;
    assert.ok(Math.abs(mean - 0.6) < 0.08, `mean edge v ${mean.toFixed(3)} ~ 1 - floor`);
    const range = Math.max(...edges) - Math.min(...edges);
    assert.ok(range > 0.03, `lumpy edge range ${range.toFixed(3)}`);
    const flat = { ...floor, lumps: 0 };
    const fe = Array.from({ length: 40 }, (_, i) => edgeAt(flat, (i + 0.5) / 40, 1));
    assert.ok(Math.max(...fe) - Math.min(...fe) < 0.004, 'flat edge');
  });

  check('floor: the edge billows over time (the silhouette changes between frames)', () => {
    const e0 = Array.from({ length: 20 }, (_, i) => edgeAt(floor, (i + 0.5) / 20, 0));
    const e1 = Array.from({ length: 20 }, (_, i) => edgeAt(floor, (i + 0.5) / 20, 3));
    assert.ok(Math.max(...e0.map((e, i) => Math.abs(e - e1[i]))) > 0.01);
  });

  check('floor: colour runs the ramp from the edge colour (first stop) to the bottom colour (last stop)', () => {
    const first = parseHexRgb(BLOB_FLOOR_COLORS[0]), last = parseHexRgb(BLOB_FLOOR_COLORS[3]);
    const u = 0.5, e = edgeAt(floor, u, 1);
    const atEdge = patternSample(floor, u, e + 0.01, A, 1), bottom = patternSample(floor, u, 0.999, A, 1);
    const d = (a, b) => Math.max(...[0, 1, 2].map((c) => Math.abs(a[c] - b[c])));
    assert.ok(d(atEdge, first) < 0.08, `edge colour ${atEdge.map((x) => x.toFixed(2))}`);
    assert.ok(d(bottom, last) < 0.12, `bottom colour ${bottom.map((x) => x.toFixed(2))}`);
  });

  check('field: every palette colour shows up somewhere (sharp blobs reach their own colour)', () => {
    const sharp = { ...field, softness: 0.15, warp: 0 };
    const samples = grid(sharp, 0, 64);
    const n = Math.min(sharp.palette.length, sharp.blobCount);
    for (let i = 0; i < n; i++) {
      const c = sharp.palette[i].color;
      const best = Math.min(...samples.map((s) => Math.max(...[0, 1, 2].map((k) => Math.abs(s[k] - c[k])))));
      assert.ok(best < 0.06, `palette[${i}] within ${best.toFixed(3)}`);
    }
  });

  check('resolveBlobParams: defaults when absent, clamps when out of range', () => {
    const d = resolveBlobParams({});
    assert.deepEqual(d, { count: 6, seed: 0, floor: 0, lumps: 0.12, softness: 1, billow: 0.25 });
    const c = resolveBlobParams({ blobCount: 99, seed: -5, floor: 3, lumps: -1, softness: 0, billow: 9 });
    assert.deepEqual(c, { count: 16, seed: 0, floor: 1, lumps: 0, softness: 0.05, billow: 2 });
    assert.equal(resolveBlobParams({ seed: 2.6 }).seed, 3);
  });

  check('config: older configs serialize unchanged (no blob keys added); blob configs round-trip every field', () => {
    for (const p of PATTERN_PRESETS.filter((x) => x.config.type !== 'blobField')) {
      const back = parsePatternConfig(serializePatternConfig(p.config));
      for (const k of ['blobCount', 'seed', 'floor', 'lumps', 'softness', 'billow']) assert.equal(k in back, false, `${p.name} gained ${k}`);
    }
    const back = parsePatternConfig(serializePatternConfig(floor));
    for (const k of ['type', 'blobCount', 'seed', 'floor', 'lumps', 'softness', 'billow', 'scale', 'speed', 'warp']) assert.deepEqual(back[k], floor[k], k);
    assert.deepEqual(back.palette, floor.palette);
    const junk = parsePatternConfig(JSON.stringify({ ...floor, seed: 'x', floor: null }));
    assert.equal('seed' in junk, false);
    assert.equal('floor' in junk, false);
  });

  check('agent options: field / floor defaults, hex + [r, g, b] colours, mode switches, bad input throws', () => {
    const f = applyBlobFieldOptions(null, {});
    assert.equal(f.type, 'blobField');
    assert.equal(resolveBlobParams(f).floor, 0);
    const fl = applyBlobFieldOptions(null, { mode: 'floor' });
    assert.equal(fl.floor, 0.4);
    assert.deepEqual(fl.palette[0].color, parseHexRgb('#215cc4'));
    const c = applyBlobFieldOptions(null, { colors: ['#ff0000', [0, 1, 0, 1], '#00f'] });
    assert.deepEqual(c.palette.map((s) => s.color), [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    assert.deepEqual(c.palette.map((s) => s.pos), [0, 0.5, 1]);
    assert.equal(applyBlobFieldOptions(null, { colors: ['#123456'] }).palette.length, 2, 'one colour is doubled');
    const toField = applyBlobFieldOptions(fl, { mode: 'field' });
    assert.equal(toField.floor, 0);
    const back = applyBlobFieldOptions(toField, { mode: 'floor' });
    assert.equal(back.floor, 0.4);
    const keep = applyBlobFieldOptions(fl, { seed: 9 });
    assert.equal(keep.floor, 0.4, 'a patch keeps the mode');
    assert.equal(keep.seed, 9);
    assert.equal(applyBlobFieldOptions(null, { count: 40 }).blobCount, 16);
    assert.throws(() => applyBlobFieldOptions(null, { colors: ['red'] }), /colors\[0\]/);
    assert.throws(() => applyBlobFieldOptions(null, { colors: Array(9).fill('#fff') }), /at most 8/);
    assert.throws(() => applyBlobFieldOptions(null, { seed: 'x' }), /seed must be a finite number/);
    assert.throws(() => applyBlobFieldOptions(null, { mode: 'sky' }), /mode/);
    const conv = applyBlobFieldOptions({ ...DEFAULT_PATTERN }, { seed: 2 });
    assert.equal(conv.type, 'blobField', 'another pattern type converts');
  });

  check('persistence: a blob-field layer survives the project validation round-trip', () => {
    const json = serializePatternConfig(floor);
    const layer = createGenerativePatternLayer('Cloud Floor', 960, 540, 1920, 1080, json, { scale: 1, rotation: 0, warp: 0, contrast: 0 }, 150);
    const comp = { id: 'c1', name: 'C', settings: { width: 1920, height: 1080, frameRate: 30, durationFrames: 150, backgroundColor: [0, 0, 0, 1] }, layers: [layer], tracks: [], markers: [] };
    const v = validateComposition(comp);
    const back = (v.layers ?? v.composition?.layers ?? []).find((l) => l.id === layer.id);
    assert.ok(back, 'layer kept');
    assert.equal(back.generativePattern.configJSON, json);
  });

  console.log(`\n✅ ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
