// gpu:conic-gradient (B74): a conic (angular) material fill on a shape renders on the WebGPU renderer exactly like
// its CPU twin (core/fillSampler.ts) through the real MCP path (editor.addShapeLayer + updateLayerProperty
// "materialConfig" -> render_frame): a hue wheel with red at 12, yellow at 3, cyan at 6, blue at 9 o'clock, 16
// angles within a few levels of the twin, and the wheel spins with a keyed layer rotation.
// Local only (Chrome + a GPU), like every gpu:* script:  npm run gpu:conic-gradient
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startMcp, makeRenderer, idOf } from './lib/mcp-pixels.mjs';

const OUT = process.env.FLASHFX_GPU_OUT ?? 'C:/Users/there/AppData/Local/Foreman/tasks/t_124df7beea/artifacts/engine/wave2/conic';
const tmp = mkdtempSync(join(tmpdir(), 'gpu-conic-'));
await build({ stdin: { contents: `export * from './src/core/fillSampler'; export { resolveShapeFill } from './src/core/material';`, resolveDir: process.cwd(), sourcefile: 'e.ts', loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: join(tmp, 'f.mjs'), logLevel: 'silent' });
const { sampleResolvedFill, resolveShapeFill } = await import(pathToFileURL(join(tmp, 'f.mjs')).href);

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const px = (img, x, y) => { const o = (Math.round(y) * img.width + Math.round(x)) * 4; return [img.px[o], img.px[o + 1], img.px[o + 2]]; };
const WHEEL = { enabled: true, layers: [{ id: 'w', type: 'conic', blendMode: 'normal', opacity: 100, colorStops: [
  { id: 'a', color: '#ff0000', opacity: 100, position: 0 }, { id: 'b', color: '#ffff00', opacity: 100, position: 25 },
  { id: 'c', color: '#00ffff', opacity: 100, position: 50 }, { id: 'd', color: '#0000ff', opacity: 100, position: 75 },
  { id: 'e', color: '#ff0000', opacity: 100, position: 100 }] }] };
const C = [960, 540];
const D = 600;
const pt = (deg, r) => [C[0] + Math.sin((deg * Math.PI) / 180) * r, C[1] - Math.cos((deg * Math.PI) / 180) * r];

console.log('gpu:conic-gradient');
const mcp = await startMcp('gpu-conic-gradient');
try {
  await mcp.call('create_project', { name: 'B74 conic', format: 'long', durationFrames: 40, clipLength: 'comp', uiMode: 'pro' }, 400000);
  const id = idOf(await mcp.action('editor.addShapeLayer', { opts: { type: 'circle', x: C[0], y: C[1], width: D, height: D, fill: [1, 1, 1, 1], name: 'hue wheel' } }));
  const set = await mcp.action('editor.updateLayerProperty', { layerId: id, path: 'materialConfig', value: WHEEL });
  const render = makeRenderer(mcp, OUT);
  const img = await render('conic-wheel-f0', 0);
  const name = (c) => (c[0] > 220 && c[1] < 40 && c[2] < 40 ? 'red' : c[0] > 220 && c[1] > 220 && c[2] < 40 ? 'yellow' : c[0] < 40 && c[1] > 220 && c[2] > 220 ? 'cyan' : c[0] < 40 && c[1] < 40 && c[2] > 220 ? 'blue' : JSON.stringify(c));
  const clock = [0.8, 90, 180, 270].map((d) => name(px(img, ...pt(d, 200))));
  check(`hue wheel on the GPU: 12 / 3 / 6 / 9 o'clock = ${clock.join(' / ')}`, () => {
    assert.equal(set.ok, true);
    assert.deepEqual(clock, ['red', 'yellow', 'cyan', 'blue']);
  });
  const fill = resolveShapeFill(WHEEL, [1, 1, 1, 1]);
  let worst = 0;
  for (let k = 0; k < 16; k++) {
    const deg = 11.25 + k * 22.5;
    const [x, y] = pt(deg, 180);
    const uv = [(x - (C[0] - D / 2)) / D, (y - (C[1] - D / 2)) / D];
    const twin = sampleResolvedFill(fill, uv, [D, D]).slice(0, 3).map((v) => v * 255);
    const gpu = px(img, x, y);
    worst = Math.max(worst, ...gpu.map((v, i) => Math.abs(v - twin[i])));
  }
  check(`GPU == CPU twin at 16 angles (worst channel delta ${worst.toFixed(1)} / 255)`, () => {
    assert.ok(worst <= 6, `worst ${worst}`);
  });
  await mcp.action('editor.setKeyframes', { layerId: id, propertyPath: 'transform.rotation', keyframes: [{ frame: 0, value: 0 }, { frame: 30, value: 90 }] });
  const spun = await render('conic-wheel-rot90-f30', 30);
  const after = [0.8, 90, 180, 270].map((d) => name(px(spun, ...pt(d + 90, 200))));
  check(`keyed rotation spins the wheel: after 90 deg, red / yellow / cyan / blue sit at 3 / 6 / 9 / 12 (${after.join(' / ')})`, () => {
    assert.deepEqual(after, ['red', 'yellow', 'cyan', 'blue']);
  });
  console.log(`\n${passed} checks passed. Frames: ${OUT}`);
} catch (e) {
  console.error(`\nFAILED after ${passed} checks: ${e.stack ?? e.message}\n--- server stderr ---\n${mcp.stderr().slice(-3000)}`);
  process.exitCode = 1;
} finally {
  await mcp.close();
  rmSync(tmp, { recursive: true, force: true });
}
