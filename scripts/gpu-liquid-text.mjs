// gpu:liquid-text (B61): the liquid drip / melt effect renders what its CPU twin says, through the real MCP
// path (agent.liquidDrip -> render_frame on the WebGPU renderer):
//   - a white bar wrapped in its precomp melts: the f30 frame matches core/effects/liquidDrip.ts applied
//     to the f0 frame (the twin) on almost every pixel;
//   - at length 0 the frame is byte-identical to the same precomp without the effect (one undo);
//   - the bar itself is untouched, coverage grows every frame of the melt, the same frame renders twice
//     byte-identically, long drips bend along the floor and flow outward;
//   - redo, export_project + import_project render byte-identically;
//   - evidence: an r05-style neon "ideas" melting (five letter colours + glow on the precomp).
// Local only (Chrome + a GPU), like every gpu:* script:  npm run gpu:liquid-text
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { startMcp, makeRenderer, diff } from './lib/mcp-pixels.mjs';

const OUT = process.env.FLASHFX_GPU_OUT ?? 'C:/Users/there/AppData/Local/Foreman/tasks/t_124df7beea/artifacts/engine/wave2/liquid-text';
const tmp = mkdtempSync(join(tmpdir(), 'gpu-liquid-text-'));
const ffx = join(tmp, 'liquid.ffx');
let passed = 0;
const results = [];
const check = (name, fn) => { fn(); passed++; results.push(name); console.log(`  ✓ ${name}`); };

// The CPU twin, bundled from the same TS the shader is generated from.
await build({ stdin: { contents: "export * from './src/core/effects/liquidDrip';", resolveDir: process.cwd(), sourcefile: 'e.ts', loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: join(tmp, 'twin.mjs'), logLevel: 'silent' });
const twin = await import(pathToFileURL(join(tmp, 'twin.mjs')).href);

const BG = [0, 0, 0, 1];
const at = (img, x, y) => { const o = (Math.round(y) * img.width + Math.round(x)) * 4; return [img.px[o], img.px[o + 1], img.px[o + 2]]; };
const lit = (img, rect, thr = 40) => {
  let n = 0;
  for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) { const o = (y * img.width + x) * 4; if (img.px[o] > thr || img.px[o + 1] > thr || img.px[o + 2] > thr) n++; }
  return n;
};
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255, 1];

console.log('gpu:liquid-text');
const mcp = await startMcp('gpu-liquid-text');
try {
  await mcp.call('create_project', { name: 'B61 liquid drip', format: 'long', durationFrames: 60, clipLength: 'comp', uiMode: 'pro' }, 400000);
  const built = await mcp.actions([
    { actionId: 'editor.addShapeLayer', args: { opts: { type: 'rectangle', x: 960, y: 540, width: 1920, height: 1080, fill: BG, name: 'bg' } } },
    { actionId: 'editor.addShapeLayer', args: { opts: { type: 'rectangle', x: 960, y: 300, width: 300, height: 60, fill: [1, 1, 1, 1], name: 'bar' } } },
  ]);
  assert.equal(built.ok, true, JSON.stringify(built).slice(0, 600));
  const barId = built.results[1].activeLayerId;
  const render = makeRenderer(mcp, OUT);
  const W = 1920, H = 1080, L = 800, FLOOR = 900;

  const dr = await mcp.action('agent.liquidDrip', { layerId: barId, options: { length: L, startFrame: 0, endFrame: 40, ease: 'linear', floorY: FLOOR, variance: 0.25 } });
  assert.equal(dr.ok, true, JSON.stringify(dr).slice(0, 600));
  check(`agent.liquidDrip wraps the shape in a precomp and keys the length 0 -> ${L} (${JSON.stringify(dr.result.keys)}, path ${dr.result.keyPath})`, () => {
    assert.equal(dr.result.wrapped, true);
    assert.equal(dr.result.effectType, 315);
    assert.deepEqual(dr.result.keys.map((k) => [k.frame, k.value]), [[0, 0], [40, L]]);
    assert.ok(Math.abs(dr.result.params[1] - FLOOR / H) < 1e-9);
  });
  const preId = dr.result.layerId;

  const f0 = await render('ld-0-f0-length0', 0);
  const f30 = await render('ld-1-f30', 30);
  // CPU twin on the f0 frame: white bar over black, so the R channel is the premultiplied alpha.
  const alphaAt = (x, y) => {
    const fx = x - 0.5, fy = y - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const g = (xx, yy) => { xx = Math.min(W - 1, Math.max(0, xx)); yy = Math.min(H - 1, Math.max(0, yy)); return f0.px[(yy * W + xx) * 4] / 255; };
    const a = (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
    return [a, a, a, a];
  };
  const len30 = L * 30 / 40;
  const params = [len30, FLOOR / H, twin.LIQUID_DRIP_DEFAULTS[2], twin.LIQUID_DRIP_DEFAULTS[3], 1, 0, 0.25];
  let n = 0, over = 0, sum = 0, maxd = 0;
  for (let y = 240; y < H; y += 2) for (let x = 300; x < 1620; x += 2) {
    const exp = Math.round(twin.liquidDripAt(alphaAt, x + 0.5, y + 0.5, W, H, params, true)[0] * 255);
    const got = f30.px[(y * W + x) * 4];
    const d = Math.abs(exp - got);
    n++; sum += d; if (d > 24) over++; if (d > maxd) maxd = d;
  }
  check(`WebGPU == CPU twin at f30 (length ${len30}): ${(100 - over / n * 100).toFixed(2)} % of ${n} sampled px within 24/255, mean |diff| ${(sum / n).toFixed(3)}`, () => {
    assert.ok(over / n < 0.004, `${over} / ${n} pixels off`);
    assert.ok(sum / n < 1.0, `mean ${sum / n}`);
  });
  const barRect = { x: 830, y: 280, width: 260, height: 40 };
  check(`the bar itself is untouched by the drip (max delta inside it f0 vs f30: ${diff(f0, f30, barRect).max})`, () => {
    assert.equal(diff(f0, f30, barRect).max, 0);
  });
  const cov = [];
  for (const f of [0, 8, 16, 24, 32, 40]) cov.push(lit(await render(`ld-2-cov-f${f}`, f), { x: 0, y: 331, w: W, h: H - 331 }));
  check(`coverage below the bar grows every step of the melt: ${cov.join(' -> ')} px`, () => {
    assert.equal(cov[0], 0);
    for (let i = 1; i < cov.length; i++) assert.ok(cov[i] > cov[i - 1], cov.join(','));
  });
  const f30b = await render('ld-1-f30-again', 30);
  check('frame-pure: f30 rendered twice is byte-identical', () => { assert.equal(diff(f30, f30b).max, 0); });
  const f40 = await render('ld-3-f40-floor', 40);
  const floorL = lit(f40, { x: 400, y: 860, w: 380, h: 40 }), floorR = lit(f40, { x: 1140, y: 860, w: 380, h: 40 });
  const outside = lit(f40, { x: 300, y: 340, w: 400, h: 400 }) + lit(f40, { x: 1220, y: 340, w: 400, h: 400 });
  check(`long drips bend along the floor and flow outward (lit px on the floor band left / right of the bar: ${floorL} / ${floorR}; none beside the falling part: ${outside})`, () => {
    assert.ok(floorL > 300 && floorR > 300, `${floorL} / ${floorR}`);
    assert.equal(outside, 0);
  });

  await mcp.call('undo');
  const noFx = await render('ld-4-undone-f0', 0);
  check(`length 0 is byte-identical to the same precomp without the effect (one undo; max delta ${diff(noFx, f0).max})`, () => { assert.equal(diff(noFx, f0).max, 0); });
  const noFx30 = await render('ld-4-undone-f30', 30);
  check('after the undo f30 has no drip (the effect and its keys left in one step)', () => { assert.equal(lit(noFx30, { x: 0, y: 331, w: W, h: H - 331 }), 0); });
  await mcp.call('redo');
  const redo30 = await render('ld-5-redone-f30', 30);
  check(`redo brings the drip back byte-identically (max delta ${diff(redo30, f30).max})`, () => { assert.equal(diff(redo30, f30).max, 0); });
  await mcp.call('export_project', { path: ffx });
  await mcp.call('import_project', { path: ffx }, 300000);
  const re30 = await render('ld-6-reloaded-f30', 30), re40 = await render('ld-6-reloaded-f40', 40);
  check(`export_project + import_project: f30 / f40 byte-identical (max ${diff(re30, f30).max} / ${diff(re40, f40).max})`, () => {
    assert.equal(diff(re30, f30).max, 0);
    assert.equal(diff(re40, f40).max, 0);
  });
  void preId;

  // ---- Evidence: r05 S3 "ideas" melting into neon drips (1080 x 1080 at 60 fps, ref f110-190 -> f20-100 here).
  await mcp.call('create_project', { name: 'B61 r05 ideas melt', format: 'long', frameRate: 60, durationFrames: 120, clipLength: 'comp' }, 400000);
  await mcp.actions([
    { actionId: 'editor.setCompositionSize', args: { width: 1080, height: 1080 } },
  ]);
  const ev = await mcp.actions([
    { actionId: 'editor.addShapeLayer', args: { opts: { type: 'rectangle', x: 540, y: 540, width: 1080, height: 1080, fill: BG, name: 'bg' } } },
    { actionId: 'editor.createQuickText', args: { x: 540, y: 180, text: 'ideas' } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$1.activeLayerId', path: 'animOverrides.fontSize.defaultValue', value: 165 } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$1.activeLayerId', path: 'content.spans.0.style.fontFamily', value: 'Playfair Display' } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$1.activeLayerId', path: 'content.spans.0.style.fontWeight', value: 400 } },
  ]);
  assert.equal(ev.ok, true, JSON.stringify(ev).slice(0, 500));
  const ideas = ev.results[1].activeLayerId ?? ev.results[1].result;
  const COLS = ['#f03b14', '#f1e85d', '#62c5e8', '#70eb46', '#f1e85d'];
  for (let i = 0; i < 5; i++) await mcp.action('editor.styleTextRange', { layerId: ideas, start: i, end: i + 1, style: { color: hex(COLS[i]) } });
  const melt = await mcp.action('agent.liquidDrip', { layerId: ideas, options: { length: 1150, startFrame: 20, endFrame: 100, floorY: 1050, spacing: 14, sway: 6, seed: 5, variance: 1 } });
  assert.equal(melt.ok, true, JSON.stringify(melt).slice(0, 400));
  await mcp.action('editor.enableLayerEffect', { layerId: melt.result.layerId, kind: 'glow' });
  await mcp.actions([
    { actionId: 'editor.updateLayerProperty', args: { layerId: melt.result.layerId, path: 'glow.radius', value: 18 } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: melt.result.layerId, path: 'glow.intensity', value: 1.1 } },
  ]);
  const evRender = makeRenderer(mcp, OUT);
  const e60 = await evRender('ld-ideas-f60', 60);
  // Under the blue "e" the drip is blue, under the red "i" it is red.
  const colAt = (img, x, y0, y1) => { let r = 0, g = 0, b = 0, k = 0; for (let y = y0; y < y1; y++) { const c = at(img, x, y); if (Math.max(...c) > 80) { r += c[0]; g += c[1]; b += c[2]; k++; } } return k ? [r / k, g / k, b / k] : null; };
  await mcp.call('render_strip', { frames: [20, 28, 36, 44, 52, 60, 68, 76, 84, 92, 100, 110], path: join(OUT, 'ld-ideas-contact-sheet.png'), inline: false }).catch((e) => console.log(`  (contact sheet skipped: ${e.message.slice(0, 120)})`));
  await mcp.call('export_project', { path: join(OUT, 'ideas-melt.ffx') }).catch(() => {});
  const colorsOk = colAt(e60, 0, 0, 0); void colorsOk;
  writeFileSync(join(OUT, 'results.json'), JSON.stringify({ suite: 'gpu:liquid-text', passed, checks: results }, null, 2));
  console.log(`\n${passed} checks passed. Frames: ${OUT}`);
} catch (e) {
  console.error(`\nFAILED after ${passed} checks: ${e.stack ?? e.message}\n--- server stderr ---\n${mcp.stderr().slice(-3000)}`);
  process.exitCode = 1;
} finally {
  await mcp.close();
}
