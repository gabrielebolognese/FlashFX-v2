// Acceptance harness for B74: conic (angular) gradient fills on shapes. The material resolver maps a 'conic'
// layer to gradientType 2 (start angle in radians, centre), and the CPU twin of the shape gradient shader
// (core/fillSampler.ts, a port of renderer.ts gradientT) sweeps clockwise from the start angle (0 = 12 o'clock).
// Linear / radial are unchanged. GPU proof: gpu:conic-gradient.
//   node scripts/verify-conic-gradient.mjs   (or: npm run verify:conic-gradient)
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = mkdtempSync(join(tmpdir(), 'conic-verify-'));
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

try {
  const outfile = join(tmp, 'bundle.mjs');
  await build({
    stdin: { contents: `export * from './src/core/fillSampler'; export { resolveShapeFill } from './src/core/material';`, resolveDir: process.cwd(), sourcefile: 'entry.ts', loader: 'ts' },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  const { sampleResolvedFill, resolveShapeFill } = await import(pathToFileURL(outfile).href);
  console.log('verify:conic-gradient');

  const wheel = (extra = {}) => ({ enabled: true, layers: [{ id: 'w', type: 'conic', blendMode: 'normal', opacity: 100, ...extra, colorStops: [
    { id: 'a', color: '#ff0000', opacity: 100, position: 0 }, { id: 'b', color: '#ffff00', opacity: 100, position: 25 },
    { id: 'c', color: '#00ffff', opacity: 100, position: 50 }, { id: 'd', color: '#0000ff', opacity: 100, position: 75 },
    { id: 'e', color: '#ff0000', opacity: 100, position: 100 }] }] });
  const BOX = [400, 400];
  // uv of a point at radius r (px) and clock angle deg (0 = top, clockwise) around the box centre.
  const at = (deg, r = 150, c = [0.5, 0.5]) => [c[0] + (Math.sin((deg * Math.PI) / 180) * r) / BOX[0], c[1] - (Math.cos((deg * Math.PI) / 180) * r) / BOX[1]];
  const rgb = (v) => v.slice(0, 3).map((x) => Math.round(x * 255));
  const near = (a, b, tol = 3) => a.every((x, i) => Math.abs(x - b[i]) <= tol);

  check("resolveShapeFill: a conic layer -> gradientType 2, start angle in radians, centre preset or explicit", () => {
    const f = resolveShapeFill(wheel({ angle: 90 }), [1, 1, 1, 1]);
    assert.equal(f.kind, 1);
    assert.equal(f.layers[0].gradientType, 2);
    assert.ok(Math.abs(f.layers[0].angle - Math.PI / 2) < 1e-12);
    assert.deepEqual([f.layers[0].centerX, f.layers[0].centerY], [0.5, 0.5]);
    const g = resolveShapeFill(wheel({ centerX: 0.25, centerY: 0.75 }), [1, 1, 1, 1]);
    assert.deepEqual([g.layers[0].centerX, g.layers[0].centerY, g.layers[0].angle], [0.25, 0.75, 0]);
  });
  check('hue wheel: red at 12, yellow at 3, cyan at 6, blue at 9 o\'clock (clockwise from the top)', () => {
    const f = resolveShapeFill(wheel(), [1, 1, 1, 1]);
    assert.ok(near(rgb(sampleResolvedFill(f, at(0.5), BOX)), [255, 3, 0], 4), `12: ${rgb(sampleResolvedFill(f, at(0.5), BOX))}`);
    assert.ok(near(rgb(sampleResolvedFill(f, at(90), BOX)), [255, 255, 0]), `3: ${rgb(sampleResolvedFill(f, at(90), BOX))}`);
    assert.ok(near(rgb(sampleResolvedFill(f, at(180), BOX)), [0, 255, 255]), `6: ${rgb(sampleResolvedFill(f, at(180), BOX))}`);
    assert.ok(near(rgb(sampleResolvedFill(f, at(270), BOX)), [0, 0, 255]), `9: ${rgb(sampleResolvedFill(f, at(270), BOX))}`);
    // halfway between 12 and 3 = halfway red -> yellow
    assert.ok(near(rgb(sampleResolvedFill(f, at(45), BOX)), [255, 128, 0], 4));
  });
  check('the colour depends only on the angle (same at any radius), seamless across 12 o\'clock', () => {
    const f = resolveShapeFill(wheel(), [1, 1, 1, 1]);
    for (const deg of [30, 120, 200, 300]) assert.deepEqual(rgb(sampleResolvedFill(f, at(deg, 40), BOX)), rgb(sampleResolvedFill(f, at(deg, 190), BOX)));
    assert.ok(near(rgb(sampleResolvedFill(f, at(359.5), BOX)), rgb(sampleResolvedFill(f, at(0.5), BOX)), 8));
  });
  check('the start angle rotates the wheel (angle 90: red at 3 o\'clock) and an explicit centre moves it', () => {
    const f = resolveShapeFill(wheel({ angle: 90 }), [1, 1, 1, 1]);
    assert.ok(near(rgb(sampleResolvedFill(f, at(90.5), BOX)), [255, 3, 0], 4));
    assert.ok(near(rgb(sampleResolvedFill(f, at(180), BOX)), [255, 255, 0]));
    const g = resolveShapeFill(wheel({ centerX: 0.25, centerY: 0.25 }), [1, 1, 1, 1]);
    assert.ok(near(rgb(sampleResolvedFill(g, at(90, 60, [0.25, 0.25]), BOX)), [255, 255, 0]));
  });
  check('linear and radial layers resolve and sample exactly as before (gradientType 0 / 1)', () => {
    const lin = resolveShapeFill({ enabled: true, layers: [{ id: 'l', type: 'linear', angle: 90, blendMode: 'normal', opacity: 100, colorStops: [{ id: 'a', color: '#000000', opacity: 100, position: 0 }, { id: 'b', color: '#ffffff', opacity: 100, position: 100 }] }] }, [1, 1, 1, 1]);
    assert.equal(lin.layers[0].gradientType, 0);
    assert.deepEqual(rgb(sampleResolvedFill(lin, [0.5, 0.5], BOX)), [128, 128, 128]);
    const rad = resolveShapeFill({ enabled: true, layers: [{ id: 'r', type: 'radial', radialType: 'center', blendMode: 'normal', opacity: 100, colorStops: [{ id: 'a', color: '#ffffff', opacity: 100, position: 0 }, { id: 'b', color: '#000000', opacity: 100, position: 100 }] }] }, [1, 1, 1, 1]);
    assert.equal(rad.layers[0].gradientType, 1);
    assert.deepEqual(rgb(sampleResolvedFill(rad, [0.5, 0.5], BOX)), [255, 255, 255]);
  });

  console.log(`\nconic-gradient: all ${passed} checks passed`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
