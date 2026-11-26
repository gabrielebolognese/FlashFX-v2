// gpu:glass (B38): frosted / liquid glass on a shape renders on the real WebGPU renderer exactly like its
// CPU twin (core/effects/glass.ts: the outline mask, the backdrop filters + gaussian blur of the composite
// below, glassMixPixel's rim bend + highlight), driven through the real MCP path (editor.addShapeLayer +
// editor.setShapeGlass + setKeyframes "glass.*" -> render_frame):
//  - the backdrop is blurred ONLY inside the outline: every pixel outside it is byte-identical to the frame
//    without glass, and the inside matches the twin within a few levels;
//  - the rim bend + highlight match the twin; the light follows a keyed lightAngle (top rim lit at -90 deg,
//    bottom rim at +90 deg); a keyed glass.blur of 0 leaves the backdrop sharp;
//  - one undo removes the glass and the frame is byte-identical to before; export_project + import_project
//    round trip renders the same pixels (the glass is saved and stays editable);
//  - evidence: the r06 frosted pill over the jungle stand-in photo.
// Local only (Chrome + a GPU), like every gpu:* script:  npm run gpu:glass
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startMcp, makeRenderer, idOf, diff } from './lib/mcp-pixels.mjs';

const OUT = process.env.FLASHFX_GPU_OUT ?? 'C:/Users/there/AppData/Local/Foreman/tasks/t_124df7beea/artifacts/engine/wave2/glass';
const JUNGLE = 'C:/Users/there/AppData/Local/Foreman/tasks/t_124df7beea/artifacts/replicas/r06/assets/jungle.png';
mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'gpu-glass-'));
await build({
  stdin: {
    contents: `export * from './src/core/effects/glass';
      export { packMaskSlots, maskStackField, MASK_BLOCK_FLOATS } from './src/core/maskCoverage';
      export { applyBasicFilters, IDENTITY_FILTERS } from './src/core/effects/adjustmentComposite';`,
    resolveDir: process.cwd(), sourcefile: 'e.ts', loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', outfile: join(tmp, 'g.mjs'), logLevel: 'silent',
});
const G = await import(pathToFileURL(join(tmp, 'g.mjs')).href);

let passed = 0;
const results = {};
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

// ---- CPU twin of the glass pass over a crop of the frame below ----
const PILL = { x: 960, y: 540, w: 830, h: 150, r: 75 };
const q8 = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255) / 255;
const gw = (x, s) => Math.exp(-0.5 * (x * x) / (s * s));
/** Float crop (0..1 RGBA) of a decoded frame. */
function cropOf(img, x0, y0, w, h) {
  const f = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = ((y0 + y) * img.width + (x0 + x)) * 4, i = (y * w + x) * 4;
    f[i] = img.px[o] / 255; f[i + 1] = img.px[o + 1] / 255; f[i + 2] = img.px[o + 2] / 255; f[i + 3] = 1;
  }
  return { f, w, h, x0, y0 };
}
const sampleAt = (c, px, py) => {
  const fx = px - 0.5, fy = py - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const cx = (v) => Math.min(c.w - 1, Math.max(0, v)), cy = (v) => Math.min(c.h - 1, Math.max(0, v));
  const o = [0, 0, 0, 0];
  for (const [xx, yy, w] of [[x0, y0, (1 - tx) * (1 - ty)], [x0 + 1, y0, tx * (1 - ty)], [x0, y0 + 1, (1 - tx) * ty], [x0 + 1, y0 + 1, tx * ty]]) {
    const i = (cy(yy) * c.w + cx(xx)) * 4;
    for (let k = 0; k < 4; k++) o[k] += c.f[i + k] * w;
  }
  return o;
};
const mapCrop = (c, fn) => { const f = new Float32Array(c.w * c.h * 4); for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) { const v = fn(x, y); const i = (y * c.w + x) * 4; for (let k = 0; k < 4; k++) f[i + k] = q8(v[k]); } return { ...c, f }; };
// BLUR_EFFECT_SHADER gaussian H / V (TAPS 15, sigma max(r / 2, 1)), 8-bit intermediates (same twin as gpu:adjustment).
const gaussPass = (c, r, horiz) => {
  if (r < 0.5) return mapCrop(c, (x, y) => sampleAt(c, x + 0.5, y + 0.5));
  const taps = 15, sigma = Math.max(r * 0.5, 1), step = r / taps;
  return mapCrop(c, (x, y) => {
    const acc = [0, 0, 0, 0]; let ws = 0;
    for (let i = -taps; i <= taps; i++) {
      const w = gw(i * step, sigma);
      const s = horiz ? sampleAt(c, x + 0.5 + i * step, y + 0.5) : sampleAt(c, x + 0.5, y + 0.5 + i * step);
      for (let k = 0; k < 4; k++) acc[k] += s[k] * w; ws += w;
    }
    return acc.map((v) => v / ws);
  });
};
/** The whole glass pass on a crop of the frame below: filters -> gaussian -> mix by the outline field. */
function twin(below, glass) {
  const filters = { ...G.IDENTITY_FILTERS, brightness: glass.brightness, saturation: glass.saturation };
  const applied = mapCrop(below, (x, y) => { const i = (y * below.w + x) * 4; return [...G.applyBasicFilters([below.f[i], below.f[i + 1], below.f[i + 2]], filters), 1]; });
  const blurred = gaussPass(gaussPass(applied, glass.blur, true), glass.blur, false);
  const shape = { renderType: 'rectangle', width: PILL.w, height: PILL.h, borderRadius: PILL.r, strokeWidth: 0, radius: 0, points: 0, outerRadius: 0, innerRadius: 0, vertices: [] };
  const t = { positionX: PILL.x, positionY: PILL.y, rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0, anchorY: 0, opacity: 1 };
  const mask = G.glassOutlineMask(shape, t);
  const block = new Float32Array(G.MASK_BLOCK_FLOATS);
  const n = G.packMaskSlots([mask], block, 0);
  const params = { refraction: glass.refraction, edgeWidth: glass.edgeWidth, highlight: glass.highlight, lightAngle: glass.lightAngle };
  const cov = new Float32Array(below.w * below.h);
  const out = mapCrop(below, (x, y) => {
    const px = below.x0 + x + 0.5, py = below.y0 + y + 0.5;
    const field = G.maskStackField(block, 0, n, px, py, Math.max(glass.edgeWidth, 0));
    cov[y * below.w + x] = field.alpha;
    const i = (y * below.w + x) * 4;
    return G.glassMixPixel([below.f[i], below.f[i + 1], below.f[i + 2], 1], (sx, sy) => sampleAt(blurred, sx - below.x0, sy - below.y0), px, py, field, 1, params);
  });
  return { out, cov, blurred };
}
/** GPU frame vs twin over the crop: inside (cov > 0) error stats, outside (cov == 0) vs the frame below. */
function compare(img, below, tw) {
  let maxErr = 0, sum = 0, n = 0, outsideMax = 0, outsideN = 0, worst = null;
  for (let y = 0; y < below.h; y++) for (let x = 0; x < below.w; x++) {
    const o = ((below.y0 + y) * img.width + (below.x0 + x)) * 4, i = (y * below.w + x) * 4;
    const k = tw.cov[y * below.w + x];
    for (let c = 0; c < 3; c++) {
      const g = img.px[o + c];
      if (k > 0) { const d = Math.abs(g - Math.round(tw.out.f[i + c] * 255)); sum += d; n++; if (d > maxErr) { maxErr = d; worst = { x: below.x0 + x, y: below.y0 + y, c, gpu: g, twin: Math.round(tw.out.f[i + c] * 255), cov: k }; } }
      else { const d = Math.abs(g - Math.round(below.f[i + c] * 255)); outsideMax = Math.max(outsideMax, d); outsideN++; }
    }
  }
  return { maxErr, meanErr: sum / Math.max(1, n), insideSamples: n / 3, outsideMax, outsidePixels: outsideN / 3, worst };
}
/** Mean luminance over a small rect (crop coords in comp px). */
const meanLum = (img, x0, y0, w, h) => { let s = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const o = (y * img.width + x) * 4; s += 0.2126 * img.px[o] + 0.7152 * img.px[o + 1] + 0.0722 * img.px[o + 2]; } return s / (w * h); };
/** Mean squared horizontal gradient inside a rect (edge energy): high on sharp stripes, low once blurred. */
const sharpness = (img, x0, y0, w, h) => { let s = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w - 1; x++) { const o = (y * img.width + x) * 4; const a = img.px[o] - img.px[o + 4], b = img.px[o + 2] - img.px[o + 6]; s += a * a + b * b; } return s / (w * h); };

console.log('gpu:glass');
const mcp = await startMcp('gpu-glass');
try {
  await mcp.call('create_project', { name: 'B38 glass', format: 'long', durationFrames: 40, clipLength: 'comp', uiMode: 'pro' }, 400000);
  // Backdrop: a black plate + 24 hard vertical stripes (red / white / blue / yellow) + 6 thin horizontal bars,
  // so a blur, a bend or a highlight all show up in the pixels.
  const steps = [{ actionId: 'editor.addShapeLayer', args: { opts: { type: 'rectangle', x: 960, y: 540, width: 1920, height: 1080, fill: [0, 0, 0, 1], name: 'plate' } } }];
  const COLS = [[0.9, 0.1, 0.1, 1], [1, 1, 1, 1], [0.1, 0.25, 0.95, 1], [1, 0.85, 0.1, 1]];
  for (let k = 0; k < 24; k++) steps.push({ actionId: 'editor.addShapeLayer', args: { opts: { type: 'rectangle', x: 40 + k * 80, y: 540, width: 34, height: 1080, fill: COLS[k % 4], name: `stripe ${k}` } } });
  for (let k = 0; k < 6; k++) steps.push({ actionId: 'editor.addShapeLayer', args: { opts: { type: 'rectangle', x: 960, y: 380 + k * 64, width: 1920, height: 10, fill: [0.05, 0.9, 0.4, 1], name: `bar ${k}` } } });
  const built = await mcp.actions(steps);
  assert.equal(built.ok, true, JSON.stringify(built).slice(0, 400));
  const pill = idOf(await mcp.action('editor.addShapeLayer', { opts: { type: 'rectangle', x: PILL.x, y: PILL.y, width: PILL.w, height: PILL.h, radius: PILL.r, fill: [1, 1, 1, 0], name: 'glass pill' } }));
  const render = makeRenderer(mcp, OUT);
  const before = await render('glass-0-before', 10);
  const margin = 90;
  const below = cropOf(before, PILL.x - PILL.w / 2 - margin, PILL.y - PILL.h / 2 - margin, PILL.w + 2 * margin, PILL.h + 2 * margin);

  // 1. Pure frosted blur (no bend, no light, no filters).
  const g1 = { blur: 20, refraction: 0, highlight: 0, lightAngle: -90, edgeWidth: 16, brightness: 0, saturation: 0 };
  const set1 = await mcp.action('editor.setShapeGlass', { layerId: pill, glass: g1 });
  const frosted = await render('glass-1-frosted-blur20', 10);
  const s1 = compare(frosted, below, twin(below, g1));
  const whole1 = diff(frosted, before);
  results.frosted = s1;
  check(`frosted blur 20 px: outside the outline byte-identical to the frame without glass (${s1.outsidePixels} px checked, max delta ${s1.outsideMax}); whole frame differs only inside (${whole1.n} px changed)`, () => {
    assert.equal(set1.ok, true);
    assert.equal(s1.outsideMax, 0);
    assert.ok(whole1.n > 0 && whole1.n <= PILL.w * PILL.h, `changed ${whole1.n}`);
  });
  check(`frosted blur == CPU twin inside the outline (max ${s1.maxErr} / 255, mean ${s1.meanErr.toFixed(3)}, ${s1.insideSamples} px)`, () => {
    assert.ok(s1.maxErr <= 4, JSON.stringify(s1.worst));
    assert.ok(s1.meanErr <= 0.6, `mean ${s1.meanErr}`);
  });
  const sharpIn = sharpness(before, 800, 520, 300, 40), blurIn = sharpness(frosted, 800, 520, 300, 40), sharpOut = sharpness(frosted, 800, 740, 300, 40), sharpOutBefore = sharpness(before, 800, 740, 300, 40);
  check(`the stripes are blurred behind the glass (edge energy ${sharpIn.toFixed(1)} -> ${blurIn.toFixed(1)}) and stay sharp outside (${sharpOut.toFixed(1)})`, () => {
    assert.ok(blurIn < sharpIn * 0.5, `${blurIn} vs ${sharpIn}`);
    assert.equal(sharpOut, sharpOutBefore);
  });

  // 2. Liquid glass: rim bend + highlight from the top + brighten / saturate.
  const g2 = { blur: 24, refraction: 14, highlight: 0.6, lightAngle: -90, edgeWidth: 18, brightness: 0.06, saturation: 0.15 };
  await mcp.action('editor.setShapeGlass', { layerId: pill, glass: g2 });
  const liquid = await render('glass-2-liquid-top-light', 10);
  const s2 = compare(liquid, below, twin(below, g2));
  results.liquid = s2;
  check(`liquid glass (bend 14 px, highlight 0.6, brightness / saturation) == CPU twin (max ${s2.maxErr} / 255, mean ${s2.meanErr.toFixed(3)}); outside still byte-identical (max ${s2.outsideMax})`, () => {
    assert.equal(s2.outsideMax, 0);
    assert.ok(s2.maxErr <= 6, JSON.stringify(s2.worst));
    assert.ok(s2.meanErr <= 0.8, `mean ${s2.meanErr}`);
  });
  const topRim = meanLum(liquid, 860, PILL.y - PILL.h / 2 + 2, 200, 6), botRim = meanLum(liquid, 860, PILL.y + PILL.h / 2 - 8, 200, 6);
  const topRimF = meanLum(frosted, 860, PILL.y - PILL.h / 2 + 2, 200, 6), botRimF = meanLum(frosted, 860, PILL.y + PILL.h / 2 - 8, 200, 6);
  check(`light from -90 deg lights the top rim (luma +${(topRim - topRimF).toFixed(1)}) more than the bottom rim (+${(botRim - botRimF).toFixed(1)})`, () => {
    assert.ok(topRim - topRimF > 8, `${topRim} vs ${topRimF}`);
    assert.ok(topRim - topRimF > (botRim - botRimF) + 5);
  });

  // 3. Keyframes: lightAngle -90 -> 90 (f0 -> f30) and blur 0 -> 24 (f0 -> f30).
  const k1 = await mcp.action('editor.setKeyframes', { layerId: pill, propertyPath: 'glass.lightAngle', keyframes: [{ frame: 0, value: -90 }, { frame: 30, value: 90 }] });
  const k2 = await mcp.action('editor.setKeyframes', { layerId: pill, propertyPath: 'glass.blur', keyframes: [{ frame: 0, value: 0 }, { frame: 30, value: 24 }] });
  const f30 = await render('glass-3-keyed-f30-light-bottom', 30);
  const s3 = compare(f30, below, twin(below, { ...g2, lightAngle: 90 }));
  const topRim30 = meanLum(f30, 860, PILL.y - PILL.h / 2 + 2, 200, 6), botRim30 = meanLum(f30, 860, PILL.y + PILL.h / 2 - 8, 200, 6);
  check(`keyed glass.lightAngle reaches +90 at f30: the bottom rim is now the lit one (bottom +${(botRim30 - botRimF).toFixed(1)}, top +${(topRim30 - topRimF).toFixed(1)}); f30 == twin (max ${s3.maxErr})`, () => {
    assert.equal(k1.ok, true);
    assert.ok(botRim30 - botRimF > (topRim30 - topRimF) + 5);
    assert.ok(s3.maxErr <= 6, JSON.stringify(s3.worst));
  });
  const f0 = await render('glass-4-keyed-f0-blur0', 0);
  const s4 = compare(f0, below, twin(below, { ...g2, blur: 0, lightAngle: -90 }));
  const sharp0 = sharpness(f0, 800, 520, 300, 40);
  check(`keyed glass.blur 0 at f0: the backdrop behind the glass stays sharp (edge energy ${sharp0.toFixed(1)} vs ${sharpIn.toFixed(1)} unglassed) and == twin (max ${s4.maxErr})`, () => {
    assert.equal(k2.ok, true);
    assert.ok(sharp0 > sharpIn * 0.8, `${sharp0}`);
    assert.ok(s4.maxErr <= 6, JSON.stringify(s4.worst));
  });

  // 4. Save / load round trip: the glass and its keys persist and render the same pixels.
  const ffx = join(OUT, 'glass-roundtrip.ffx');
  if (existsSync(ffx)) rmSync(ffx);
  const exp = await mcp.call('export_project', { path: ffx });
  const imp = await mcp.call('import_project', { path: ffx }, 300000);
  const st = await mcp.call('get_state');
  const pillAfter = (st.layers ?? []).find((l) => l.name === 'glass pill');
  const reloaded = await render('glass-5-after-reload-f30', 30);
  const rt = diff(reloaded, f30);
  check(`export_project + import_project: the glass pill reloads with its glass + keys and renders f30 byte-identically (max delta ${rt.max})`, () => {
    assert.ok(exp && imp, 'export / import ran');
    assert.ok(pillAfter, 'the pill is in the reloaded project');
    assert.equal(rt.max, 0);
  });
  const layer = await mcp.action('agent.getLayer', { layerId: pillAfter.id });
  const lj = JSON.stringify(layer);
  check('agent.getLayer shows the saved glass material (blur keys, lightAngle keys, edgeWidth 18) on the reloaded layer', () => {
    const g = layer.result?.glass ?? layer.result?.layer?.glass;
    assert.ok(g, lj.slice(0, 300));
    assert.equal(g.blur.keyframes.length, 2);
    assert.equal(g.lightAngle.keyframes.length, 2);
    assert.equal(g.edgeWidth, 18);
  });

  // 5. Undo: removing the glass gives back the frame without it, byte for byte.
  const rm = await mcp.action('editor.setShapeGlass', { layerId: pillAfter.id, glass: null });
  const removed = await render('glass-6-removed', 10);
  const back = diff(removed, before);
  check(`setShapeGlass(null) removes the glass: f10 is byte-identical to the frame before any glass (max delta ${back.max})`, () => {
    assert.equal(rm.ok, true);
    assert.equal(back.max, 0);
  });
  const un = await mcp.call('undo');
  const restored = await render('glass-7-undo-restores', 30);
  check(`one undo brings the glass back (f30 == the saved render, max delta ${diff(restored, f30).max})`, () => {
    assert.ok(un);
    assert.equal(diff(restored, f30).max, 0);
  });

  // 6. Evidence: the r06 frosted pill over the jungle photo (tint + hairline stroke on top of the glass).
  await mcp.call('create_project', { name: 'B38 r06 pill', format: 'long', durationFrames: 90, clipLength: 'comp' }, 400000);
  if (existsSync(JUNGLE)) {
    const img = await mcp.call('import_image', { path: JUNGLE });
    if (img.activeLayerId) await mcp.action('editor.fitLayerToCanvas', { layerId: img.activeLayerId, mode: 'cover' }).catch(() => null);
  }
  const photoOnly = await render('glass-r06-photo-only-f40', 40);
  // The glass-pill recipe (mcp/recipes/glass-pill.json) builds the r06 caption pill in one apply_recipe call.
  const rec = await mcp.call('apply_recipe', { id: 'glass-pill', params: { x: 965, y: 546, width: 830, height: 150, label: 'Unleash your Creativity', sweep: true }, startFrame: 0 });
  const recId = rec?.returns?.layerId ?? rec?.result?.returns?.layerId;
  const recLayer = recId ? await mcp.action('agent.getLayer', { layerId: recId }) : null;
  const rg = recLayer?.result?.glass ?? recLayer?.result?.layer?.glass;
  const midEntrance = await render('glass-r06-pill-recipe-f8', 8);
  const settled = await render('glass-r06-pill-recipe-f40', 40);
  check(`apply_recipe glass-pill builds the r06 frosted caption pill: a glass shape (blur ${rg?.blur?.defaultValue}, lightAngle keyed ${rg?.lightAngle?.keyframes?.length} keys) sliding into place`, () => {
    assert.ok(recId, JSON.stringify(rec).slice(0, 300));
    assert.ok(rg && rg.blur.defaultValue === 28 && rg.lightAngle.keyframes.length === 2, JSON.stringify(rg).slice(0, 300));
    assert.ok(diff(midEntrance, settled).n > 1000, 'the pill moves between f8 and f40');
    assert.ok(diff(settled, photoOnly, { x: 560, y: 481, width: 810, height: 130 }).n > 80000, 'the settled pill frosts the photo inside its outline');
    assert.equal(diff(settled, photoOnly, { x: 0, y: 0, width: 1920, height: 400 }).max, 0, 'the photo away from the pill is untouched');
  });
  writeFileSync(join(OUT, 'gpu-glass-results.json'), JSON.stringify(results, null, 2));
  console.log(`\n${passed} checks passed. Frames: ${OUT}`);
} catch (e) {
  console.error(`\nFAILED after ${passed} checks: ${e.stack ?? e.message}\n--- server stderr ---\n${mcp.stderr().slice(-3000)}`);
  process.exitCode = 1;
} finally {
  await mcp.close();
  rmSync(tmp, { recursive: true, force: true });
}
