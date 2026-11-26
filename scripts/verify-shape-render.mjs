// Acceptance harness for B63 (shape render correctness), the pure side. The GPU proof is gpu:shape-render.
//  - core/shapeSdf.ts shapeSdfParams: the quad padding covers a centred stroke (an unstroked rect keeps pad 0, byte-
//    identical), corner radii scale with the layer and clamp to half the short side, a circle draws at its true box and
//    as an ellipse under radiusY or a non-uniform scale, a star gets a square box of its outer radius;
//  - ellipseDistance (the WGSL ellipseSDF twin) equals a brute-force distance to the ellipse everywhere, and is an
//    exact circle when the axes match;
//  - core/material.ts: complete percent materials resolve exactly as before; 0..1 fractions (the r07 radial), missing
//    ids / opacities / positions and RGBA array colours resolve like their complete twin;
//  - engine/pathTessellation.ts: a self-touching sunburst (16 wedges through one centre) fills its exact area (it
//    produced 0 triangles), simple rings are unchanged, a gradient fill marks its fill vertices;
//  - CircleShape.radiusY resolves to the shape height and survives save / load.
//   node scripts/verify-shape-render.mjs   (or: npm run verify:shape-render)
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = mkdtempSync(join(tmpdir(), 'shape-render-verify-'));
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

try {
  const outfile = join(tmp, 'bundle.mjs');
  await build({
    stdin: {
      contents: `
        export * from './src/core/shapeSdf';
        export { resolveShapeFill, resolveDominantColor, normalizeMaterialLayer } from './src/core/material';
        export { tessellatePath, FILL_GRADIENT_MARKER, PATH_FLOATS_PER_VERTEX } from './src/engine/pathTessellation';
        export { outlineFromSpec } from './src/core/shapeOutline';
        export { resolveFrame } from './src/core/interpolation';
        export { createComposition, createCircleLayer, createRectangleLayer } from './src/core/factory';
        export { validateComposition } from './src/project-system/services/validation';
      `,
      resolveDir: process.cwd(), sourcefile: 'entry.ts', loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  // The interpolation bundle constructs the expression worker manager at import (no Worker in Node).
  if (typeof globalThis.Worker === 'undefined') {
    globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} set onmessage(_v) {} set onerror(_v) {} };
  }
  const m = await import(pathToFileURL(outfile).href);
  const { shapeSdfParams, clampCornerRadii, ellipseDistance, SDF_AA_MARGIN, SDF_RECT, SDF_ELLIPSE, SDF_STAR } = m;
  console.log('verify:shape-render');

  const shape = (o) => ({ renderType: 'rectangle', width: 100, height: 100, borderRadius: 0, strokeWidth: 0, radius: 0, points: 0, outerRadius: 0, innerRadius: 0, ...o });

  check('shapeSdfParams: an unstroked rect keeps its exact quad (pad 0); a stroke pads by half its width + the AA margin', () => {
    const plain = shapeSdfParams(shape({ width: 300, height: 200 }), 1, 1);
    assert.deepEqual([plain.shapeType, plain.boxW, plain.boxH, plain.pad, plain.strokeWidth], [SDF_RECT, 300, 200, 0, 0]);
    const ring = shapeSdfParams(shape({ renderType: 'circle', width: 300, height: 300, strokeWidth: 40 }), 1, 1);
    assert.equal(ring.shapeType, SDF_ELLIPSE);
    assert.equal(ring.pad, 20 + SDF_AA_MARGIN);
    const outline = shapeSdfParams(shape({ width: 400, height: 200, strokeWidth: 30 }), 2, 2);
    assert.equal(outline.strokeWidth, 60);
    assert.equal(outline.pad, 30 + SDF_AA_MARGIN);
    assert.equal(shapeSdfParams(shape({ renderType: 'circle', width: 100, height: 100 }), 1, 1).pad, SDF_AA_MARGIN);
  });
  check('circle: the true box (no 1.1x margin), an ellipse from radiusY (height) or a non-uniform scale; mirroring kept', () => {
    const c = shapeSdfParams(shape({ renderType: 'circle', width: 300, height: 300 }), 1, 1);
    assert.deepEqual([c.boxW, c.boxH], [300, 300]);
    const e = shapeSdfParams(shape({ renderType: 'circle', width: 600, height: 200 }), 1, 1);
    assert.deepEqual([e.boxW, e.boxH], [600, 200]);
    const s = shapeSdfParams(shape({ renderType: 'circle', width: 400, height: 400, strokeWidth: 10 }), 1, 0.4);
    assert.deepEqual([s.boxW, s.boxH, s.strokeWidth], [400, 160, 4]);
    const mir = shapeSdfParams(shape({ renderType: 'circle', width: 200, height: 200 }), -1, 1);
    assert.deepEqual([mir.boxW, mir.boxH], [-200, 200]);
  });
  check('rounded rect: radii scale with the layer (the r06 lens ends) and clamp to half the short side', () => {
    const lens = shapeSdfParams(shape({ width: 3305, height: 319, borderRadius: 155 }), 0.5, 0.5);
    const half = shapeSdfParams(shape({ width: 1652.5, height: 159.5, borderRadius: 77.5 }), 1, 1);
    assert.deepEqual([lens.boxW, lens.boxH, ...lens.radii], [half.boxW, half.boxH, ...half.radii]);
    assert.deepEqual(shapeSdfParams(shape({ width: 400, height: 100, borderRadius: 200 }), 1, 1).radii, [50, 50, 50, 50]);
    assert.deepEqual(shapeSdfParams(shape({ width: 400, height: 100, cornerRadii: [0, 10, 80, -5] }), 1, 1).radii, [0, 10, 50, 0]);
    assert.deepEqual(clampCornerRadii([NaN, 5, 5, 5], 8, 100), [0, 4, 4, 4]);
    // non-uniform scale: the radius follows the smaller axis (a circular corner never exceeds either side)
    assert.deepEqual(shapeSdfParams(shape({ width: 100, height: 100, borderRadius: 20 }), 3, 1).radii, [20, 20, 20, 20]);
  });
  check('star: a square box of its scaled outer radius, radii scaled by |sx|', () => {
    const st = shapeSdfParams(shape({ renderType: 'star', width: 300, height: 300, points: 5, outerRadius: 150, innerRadius: 60 }), 2, 2);
    assert.equal(st.shapeType, SDF_STAR);
    assert.deepEqual([st.boxW, st.boxH, ...st.star], [600, 600, 5, 300, 120]);
  });
  check('ellipseDistance == brute-force distance to the ellipse (inside and outside, up to 25:1), exact circle when a = b', () => {
    const ref = (px, py, a, b) => {
      let best = Infinity;
      for (let i = 0; i < 20000; i++) { const t = (i / 20000) * Math.PI * 2; best = Math.min(best, Math.hypot(px - a * Math.cos(t), py - b * Math.sin(t))); }
      return ((px / a) ** 2 + (py / b) ** 2 < 1 ? -1 : 1) * best;
    };
    let worst = 0; let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const [a, b] of [[300, 100], [100, 300], [500, 20], [200, 180]]) {
      for (let i = 0; i < 150; i++) {
        const x = (rnd() * 2 - 1) * a * 1.3; const y = (rnd() * 2 - 1) * b * 1.3;
        worst = Math.max(worst, Math.abs(ellipseDistance(x, y, a, b) - ref(x, y, a, b)));
      }
    }
    assert.ok(worst < 0.05, `worst ${worst}`);
    assert.equal(ellipseDistance(30, 40, 100, 100), -50);
    assert.ok(ellipseDistance(0, 0, 300, 100) < 0 && Math.abs(ellipseDistance(0, 0, 300, 100) + 100) < 1e-6);
  });

  const PCT = { enabled: true, layers: [{ id: 'm1', type: 'radial', radialType: 'center', blendMode: 'normal', opacity: 100, colorStops: [{ id: 's1', color: '#33389a', opacity: 100, position: 0 }, { id: 's2', color: '#33389a', opacity: 0, position: 100 }] }] };
  check('materials: complete percent configs resolve as before; 0..1 fractions (the r07 radial) == the percent twin', () => {
    const f = m.resolveShapeFill(PCT, [1, 1, 1, 1]);
    assert.equal(f.kind, 1);
    assert.deepEqual(f.layers[0].stops.map((s) => [s.position, s.color[3]]), [[0, 1], [1, 0]]);
    const R07 = { enabled: true, layers: [{ id: 'm1', type: 'radial', radialType: 'center', blendMode: 'normal', opacity: 1, colorStops: [{ id: 's1', color: '#33389a', opacity: 1, position: 0 }, { id: 's2', color: '#33389a', opacity: 0, position: 1 }] }] };
    assert.deepEqual(m.resolveShapeFill(R07, [1, 1, 1, 1]), f);
    // a real percent layer at 1 % stays 1 % (any opacity > 1 marks the group as percent)
    const faint = { enabled: true, layers: [{ ...PCT.layers[0], opacity: 1 }] };
    assert.ok(Math.abs(m.resolveShapeFill(faint, [1, 1, 1, 1]).layers[0].stops[0].color[3] - 0.01) < 1e-9);
    // positions 0..1 with percent opacities: read as fractions only when the last stop is exactly 1
    const pos = { enabled: true, layers: [{ ...PCT.layers[0], colorStops: [{ id: 'a', color: '#ff0000', opacity: 100, position: 0 }, { id: 'b', color: '#0000ff', opacity: 100, position: 1 }] }] };
    assert.deepEqual(m.resolveShapeFill(pos, [1, 1, 1, 1]).layers[0].stops.map((s) => s.position), [0, 1]);
  });
  check('materials: no ids / opacities / positions, RGBA array or #rrggbbaa colours == the complete twin; dominant colour too', () => {
    const FULL = { enabled: true, layers: [{ id: 'l', type: 'linear', angle: 90, blendMode: 'normal', opacity: 100, colorStops: [{ id: 'a', color: '#ff0000', opacity: 100, position: 0 }, { id: 'b', color: '#0000ff', opacity: 100, position: 100 }] }] };
    const LOOSE = { layers: [{ type: 'linear', angle: 90, colorStops: [{ color: [1, 0, 0, 1] }, { color: '#0000ffff' }] }] };
    assert.deepEqual(m.resolveShapeFill(LOOSE, [1, 1, 1, 1]), m.resolveShapeFill(FULL, [1, 1, 1, 1]));
    assert.deepEqual(m.resolveDominantColor(LOOSE, [0, 0, 0, 1]), [1, 0, 0, 1]);
    assert.equal(m.resolveShapeFill({ enabled: false, layers: FULL.layers }, [0, 1, 0, 1]).kind, 0);
    assert.equal(m.resolveShapeFill({ enabled: true, layers: [{ type: 'linear', colorStops: 'junk' }] }, [0, 1, 0, 1]).kind, 0);
    assert.equal(m.normalizeMaterialLayer(undefined), null);
  });

  const R = 400; const half = 5.625; const pts = [];
  for (let i = 0; i < 16; i++) { const a0 = (i * 22.5 - half) * Math.PI / 180; const a1 = (i * 22.5 + half) * Math.PI / 180; pts.push([0, 0], [R * Math.sin(a0), -R * Math.cos(a0)], [R * Math.sin(a1), -R * Math.cos(a1)]); }
  const triArea = (d) => { let A = 0; const F = m.PATH_FLOATS_PER_VERTEX; for (let i = 0; i < d.length; i += 3 * F) A += Math.abs((d[i + F] - d[i]) * (d[i + 2 * F + 1] - d[i + 1]) - (d[i + F + 1] - d[i + 1]) * (d[i + 2 * F] - d[i])) / 2; return A; };
  const tess = (vertices, extra = {}) => m.tessellatePath({ vertices, closed: true, fillColor: [0, 1, 0, 1], strokeColor: [0, 0, 0, 0], strokeWidth: 0, lineCap: 'butt', lineJoin: 'miter', ...extra });
  check('tessellation: the r07 sunburst (16 wedges through one centre) fills its exact area (was 0 triangles)', () => {
    const { vertices } = m.outlineFromSpec({ type: 'path', points: pts, closed: true });
    const t = tess(vertices);
    const expected = 16 * 0.5 * R * R * Math.sin((2 * half * Math.PI) / 180);
    assert.ok(t.vertexCount >= 48, `${t.vertexCount} vertices`);
    assert.ok(Math.abs(triArea(t.data) / expected - 1) < 1e-6, `${triArea(t.data)} vs ${expected}`);
  });
  check('tessellation: simple rings are unchanged (square, hexagon areas); a gradient fill marks its fill vertices', () => {
    const sq = tess(m.outlineFromSpec({ type: 'rectangle', width: 200, height: 100 }).vertices);
    assert.equal(sq.vertexCount, 6);
    assert.ok(Math.abs(triArea(sq.data) - 20000) < 1e-6);
    const hex = tess(m.outlineFromSpec({ type: 'polygon', width: 200, height: 200, sides: 6 }).vertices);
    assert.ok(Math.abs(triArea(hex.data) / (1.5 * Math.sqrt(3) * 100 * 100) - 1) < 1e-6); // Float32 vertices
    const g = tess(m.outlineFromSpec({ type: 'rectangle', width: 200, height: 100 }).vertices, { fillColor: [0, 0, 0, 0], fillGradient: true });
    assert.equal(g.vertexCount, 6);
    for (let i = 0; i < g.data.length; i += m.PATH_FLOATS_PER_VERTEX) assert.deepEqual(Array.from(g.data.slice(i + 2, i + 6)), m.FILL_GRADIENT_MARKER);
  });
  check('CircleShape.radiusY: resolves to the shape height (absent = circle) and survives save / load', () => {
    const comp = m.createComposition('c', { width: 1920, height: 1080, frameRate: 30, durationFrames: 30, backgroundColor: [0, 0, 0, 1] });
    const c = m.createCircleLayer('e', 960, 540, 300, [1, 1, 1, 1], 30);
    c.shape.radiusY = { defaultValue: 100, keyframes: [{ frame: 0, value: 100 }, { frame: 20, value: 200 }] };
    const plain = m.createCircleLayer('c', 200, 200, 50, [1, 1, 1, 1], 30);
    comp.layers = [c, plain];
    const at = (f, id) => m.resolveFrame(comp, f).layers.find((l) => l.id === id).shape;
    assert.deepEqual([at(0, c.id).width, at(0, c.id).height], [600, 200]);
    assert.equal(at(20, c.id).height, 400);
    assert.deepEqual([at(0, plain.id).width, at(0, plain.id).height], [100, 100]);
    const back = m.validateComposition(JSON.parse(JSON.stringify(comp)));
    assert.equal(back.layers[0].shape.radiusY.keyframes.length, 2);
    assert.equal('radiusY' in back.layers[1].shape, false);
  });

  console.log(`\nshape-render: all ${passed} checks passed`);
} catch (e) {
  console.error(`\nFAILED after ${passed} checks: ${e.stack ?? e.message}`);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
