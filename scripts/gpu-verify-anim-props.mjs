// GPU harness for the wave-1A agent animation features (B46 setKeyframes / addShapeLayer /
// measureString, B33 colour keyframes, B47 keyframable glow / shadow, B50 keyframable layer blur +
// effect-stack params). Headless Chrome with WebGPU (scripts/lib/headless-gpu.mjs): NOT part of
// `npm test` (CI has no GPU). Run locally:  npm run gpu:anim-props
//
// Everything is built through the REAL agent runtime (window.__ffxAgent.run -> the real editor /
// history stores), then rendered by the REAL WebGPURenderer offscreen. Proves:
//  1. Every shader module compiles; no GPU validation error on any frame.
//  2. KEYED == STATIC: at each tested frame, the animated layer renders byte-identically to a "static
//     twin" (the same layer with the override's value at that frame written into its static field and
//     the animProps removed), for fill colour, text colour, glow intensity, layer blur radius and an
//     effect-stack param - so the renderer consumes keyed values exactly like hand-set ones (the
//     layer-Blur facade lesson: the twin path is the one already pixel-proven by gpu:adjustment).
//  3. The values really animate on screen: the fill-colour pixel follows the CPU evaluator (linear-light
//     mix, exact hold swap), the blur edge sharpens as the radius ramps to 0, the glow halo brightens,
//     the text recolours (its cached texture is invalidated per frame), the invert amount ramps.
//  4. Legacy: empty override tracks render byte-identically to no overrides.
//  5. Agent ergonomics: setKeyframes / addShapeLayer are one undo step each, addShapeLayer has no stroke,
//     measureString measures without a layer, getState lists background + tracks + animProps.

import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { bundleEntry, makeTempDir, withHeadlessPage } from './lib/headless-gpu.mjs';

const ENTRY = String.raw`
import { installAgentRuntime } from '@/agent/runtime';
import { useEditorStore } from '@/store/editor';
import { useHistoryStore } from '@/store/history';
import { WebGPURenderer } from '@/engine/renderer';
import { resolveFrame } from '@/core/interpolation';
import { evalAnimColor, evalAnimNumber, ANIM_PROP_DEFS } from '@/core/animProps';
import { evalPathKeyframes } from '@/core/shapeModifiers';
installAgentRuntime();

const W = 320, H = 180;

async function newRenderer(modules) {
  const r = new WebGPURenderer();
  const orig = GPUDevice.prototype.createShaderModule;
  if (modules) GPUDevice.prototype.createShaderModule = function (desc) { const m = orig.call(this, desc); modules.push(m); return m; };
  let ok;
  try { ok = await r.initializeOffscreen(W, H); } finally { GPUDevice.prototype.createShaderModule = orig; }
  if (!ok) throw new Error('initializeOffscreen failed');
  return r;
}
async function readPixels(r) {
  const c2 = new OffscreenCanvas(W, H);
  const g = c2.getContext('2d');
  g.drawImage(r.getOffscreenCanvas(), 0, 0);
  return Array.from(g.getImageData(0, 0, W, H).data);
}
async function render(r, comp, frame) {
  const dev = r.offscreenGpu.device;
  dev.pushErrorScope('validation');
  await r.renderFrameAsync(resolveFrame(comp, frame), 'offscreen');
  const err = await dev.popErrorScope();
  // Text rasterizes asynchronously on a cache miss: render again until two passes agree.
  let px = await readPixels(r);
  for (let i = 0; i < 6; i++) {
    await new Promise((res) => setTimeout(res, 30));
    await r.renderFrameAsync(resolveFrame(comp, frame), 'offscreen');
    const again = await readPixels(r);
    if (again.every((v, k) => v === px[k])) break;
    px = again;
  }
  return { px, err: err ? err.message : null };
}
const maxDiff = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > m) m = d; } return m; };
const at = (px, x, y) => { const i = (y * W + x) * 4; return [px[i], px[i + 1], px[i + 2], px[i + 3]]; };

// The composition the stores hold, with only the given layers and a black background.
function compOf(ids) {
  const comp = structuredClone(useEditorStore.getState().composition);
  comp.layers = comp.layers.filter((l) => ids.includes(l.id));
  for (const b of comp.background.layers) for (const st of b.stops) st.color = [0, 0, 0];
  return comp;
}

// Static twin at a frame: write each keyed override's value into its static field, drop animProps.
const STATIC_PATH = {
  fillColor: 'shape.fillColor', strokeColor: 'shape.strokeColor', glowColor: 'glow.color', shadowColor: 'shadow.color',
  glowIntensity: 'glow.intensity', glowRadius: 'glow.radius', glowThreshold: 'glow.threshold',
  shadowBlur: 'shadow.blurRadius', shadowDistance: 'shadow.lightDistance', shadowAngle: 'shadow.lightAngle', shadowScale: 'shadow.shadowScale',
  blurRadius: 'blur.radius', blurStrength: 'blur.strength', blurAngle: 'blur.angle',
};
function setPath(obj, path, v) { const ks = path.split('.'); let o = obj; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = v; }
function getPath(obj, path) { return path.split('.').reduce((o, k) => o[k], obj); }
function staticTwin(comp, frame) {
  const c = structuredClone(comp);
  for (const l of c.layers) {
    // B62 morph: the evaluated outline written as the static path.
    if (l.type === 'shape' && l.shape.pathKeyframes) {
      const p = evalPathKeyframes(l.shape.pathKeyframes, frame);
      l.shape.vertices = p.vertices; l.shape.closed = p.closed; delete l.shape.pathKeyframes;
    }
    const ap = l.animProps;
    if (!ap) continue;
    for (const d of ANIM_PROP_DEFS) {
      const p = ap[d.key];
      if (!p || !p.keyframes.length) continue;
      if (d.key === 'textColor' || d.key === 'textStrokeColor') {
        const field = d.key === 'textColor' ? 'color' : 'strokeColor';
        for (const sp of l.content.spans) sp.style[field] = evalAnimColor(p, sp.style[field], frame);
        continue;
      }
      const path = STATIC_PATH[d.key];
      const cur = getPath(l, path);
      setPath(l, path, d.kind === 'color' ? evalAnimColor(p, cur, frame) : evalAnimNumber(p, cur, frame));
    }
    for (const [k, p] of Object.entries(ap.effectParams ?? {})) {
      const [type, idx] = k.split('_').map(Number);
      const e = l.effects.find((x) => x.type === type);
      e.params[idx] = evalAnimNumber(p, e.params[idx], frame);
    }
    delete l.animProps;
  }
  return c;
}

window.__animGpu = async () => {
  if (!navigator.gpu || !(await navigator.gpu.requestAdapter())) return { noAdapter: true };
  const a = window.__ffxAgent;
  const run = async (id, args) => { const r = await a.run(id, args); if (!r.ok) throw new Error(id + ': ' + r.error); return r; };
  const undoDepth = () => useHistoryStore.getState().undoStack.length;
  const layer = (id) => useEditorStore.getState().composition.layers.find((l) => l.id === id);
  const out = { agent: {}, scenes: {}, errors: [] };

  await run('editor.setCompositionSize', { width: W, height: H });

  // ── B46 agent ergonomics ──
  let d0 = undoDepth();
  const A = (await run('editor.addShapeLayer', { opts: { type: 'rectangle', x: 80, y: 90, width: 100, height: 80, fill: [1, 0, 0, 1], name: 'Swatch' } })).result;
  out.agent.addShapeUndoSteps = undoDepth() - d0;
  out.agent.addShapeStroke = layer(A).shape.strokeWidth.defaultValue;
  out.agent.addShapeName = layer(A).name;
  d0 = undoDepth();
  await run('editor.setKeyframes', { layerId: A, propertyPath: 'shape.fillColor', keyframes: [
    { frame: 0, value: [1, 0, 0, 1], ease: 'cubicOut' }, { frame: 20, value: [0, 0, 1, 1], ease: 'hold' }, { frame: 30, value: [0, 1, 0, 1] }] });
  out.agent.setKeyframesUndoSteps = undoDepth() - d0;
  out.agent.fillKeys = layer(A).animProps.fillColor.keyframes.length;
  out.agent.badPath = (await a.run('editor.setKeyframes', { layerId: A, propertyPath: 'shape.nope', keyframes: [{ frame: 0, value: 1 }] })).ok;
  out.agent.badShape = (await a.run('editor.setKeyframes', { layerId: A, propertyPath: 'shape.fillColor', keyframes: [{ frame: 0, value: 1 }] })).ok;
  out.agent.undoDepthAfterRejects = undoDepth() - d0;
  // Position with three different eases in one call (the B46 headline).
  await run('editor.setKeyframes', { layerId: A, propertyPath: 'transform.position', keyframes: [
    { frame: 0, value: [80, 90], ease: [0.22, 1, 0.36, 1] }, { frame: 10, value: [90, 90], ease: 'hold' }, { frame: 40, value: [90, 90] }] });
  out.agent.posInterp = layer(A).transform.position.keyframes.map((k) => k.interpolation);

  const B = (await run('editor.addShapeLayer', { opts: { type: 'rectangle', x: 240, y: 90, width: 90, height: 90, fill: [1, 1, 1, 1] } })).result;
  await run('editor.enableLayerEffect', { layerId: B, kind: 'blur' });
  await run('editor.setKeyframes', { layerId: B, propertyPath: 'blur.radius', keyframes: [{ frame: 0, value: 24, ease: 'expoOut' }, { frame: 30, value: 0 }] });

  const C = (await run('editor.addShapeLayer', { opts: { type: 'rectangle', x: 160, y: 90, width: 60, height: 60, fill: [1, 1, 1, 1] } })).result;
  await run('editor.enableLayerEffect', { layerId: C, kind: 'glow' });
  await run('editor.updateLayerProperty', { layerId: C, path: 'glow.threshold', value: 0.2 });
  await run('editor.addKeyframe', [C, 'glow.intensity', 0, 0]);
  await run('editor.addKeyframe', [C, 'glow.intensity', 30, 3]);
  await run('editor.addKeyframe', [C, 'glow.color', 0, [1, 1, 1, 1]]);
  await run('editor.addKeyframe', [C, 'glow.color', 30, [0, 0.6, 1, 1]]);

  const T = (await run('editor.createQuickText', { x: 160, y: 90, text: 'HI' })).result;
  await run('editor.updateLayerProperty', { layerId: T, path: 'animOverrides.fontSize.defaultValue', value: 110 });
  await run('editor.setKeyframes', { layerId: T, propertyPath: 'text.color', keyframes: [{ frame: 0, value: [1, 1, 1, 1], ease: 'linear' }, { frame: 30, value: [1, 0.45, 0, 1] }] });

  await run('editor.addAdjustmentLayer');
  const ADJ = useEditorStore.getState().selection.activeId;
  await run('editor.setLayerEffectParam', { layerId: ADJ, type: 121, paramIndex: 0, value: 0 });
  await run('editor.setKeyframes', { layerId: ADJ, propertyPath: 'effect.121.0', keyframes: [{ frame: 0, value: 0, ease: 'ease-in-out' }, { frame: 30, value: 1 }] });

  // B62 shape morph: square -> star (backOut pop) -> circle, one undo step.
  const D = (await run('editor.addShapeLayer', { opts: { type: 'rectangle', x: 160, y: 90, width: 100, height: 100, fill: [0.7, 0.97, 0.15, 1] } })).result;
  d0 = undoDepth();
  await run('editor.setShapeMorph', { layerId: D, poses: [
    { frame: 0, shape: { type: 'rectangle', width: 100, height: 100 }, ease: 'cubicInOut' },
    { frame: 15, shape: { type: 'star', width: 130, height: 130, points: 5, innerRatio: 0.45 }, ease: 'backOut' },
    { frame: 30, shape: { type: 'ellipse', width: 100, height: 100 } }] });
  out.agent.morphUndoSteps = undoDepth() - d0;
  out.agent.morphPoses = layer(D).shape.pathKeyframes.map((k) => [k.frame, k.ease ?? null, k.align ?? null]);
  out.agent.morphBad = (await a.run('editor.setShapeMorph', { layerId: D, poses: [{ frame: 0, shape: { type: 'blob' } }] })).ok;

  out.agent.measureHi = (await run('agent.measureString', { text: 'HI', fontSize: 110 })).result;
  out.agent.measureLong = (await run('agent.measureString', { text: 'HI THERE', fontSize: 110 })).result.width;
  const st = a.getState();
  out.agent.state = { background: st.background.length, tracks: st.tracks.length, animA: st.layers.find((l) => l.id === A).animProps, animAdj: st.layers.find((l) => l.id === ADJ).animProps };

  // ── rendering ──
  const modules = [];
  const R = await newRenderer(modules);
  for (const m of modules) { const info = await m.getCompilationInfo(); for (const msg of info.messages) if (msg.type === 'error') out.errors.push('compile: ' + msg.message); }
  out.modules = modules.length;

  const FRAMES = [0, 7, 15, 20, 25, 30];
  const scene = async (name, ids, probe) => {
    const comp = compOf(ids);
    const res = { frames: {} };
    for (const f of FRAMES) {
      const anim = await render(R, comp, f);
      const twinR = await newRenderer();
      const twin = await render(twinR, staticTwin(comp, f), f);
      twinR.destroy();
      if (anim.err) out.errors.push(name + ' f' + f + ': ' + anim.err);
      if (twin.err) out.errors.push(name + ' twin f' + f + ': ' + twin.err);
      res.frames[f] = { keyedVsStatic: maxDiff(anim.px, twin.px), probe: probe(anim.px) };
    }
    out.scenes[name] = res;
  };

  // Fill colour: centre pixel of the swatch (after the position keys settle it sits at x 90).
  await scene('fill colour', [A], (px) => at(px, 90, 90));
  // Blur: count soft (partially covered) pixels across B's left edge on the centre row.
  await scene('blur radius', [B], (px) => { let soft = 0; for (let x = 150; x < 240; x++) { const v = at(px, x, 90)[0]; if (v > 8 && v < 247) soft++; } return soft; });
  // Glow: a pixel 4 px outside C's right edge (x 190), inside the halo.
  await scene('glow intensity + colour', [C], (px) => at(px, 194, 90));
  // Text: count orange-ish vs white-ish text pixels.
  await scene('text colour', [T], (px) => { let white = 0, orange = 0; for (let i = 0; i < px.length; i += 4) { if (px[i] > 200 && px[i + 1] > 200 && px[i + 2] > 200) white++; if (px[i] > 200 && px[i + 1] > 60 && px[i + 1] < 170 && px[i + 2] < 60) orange++; } return { white, orange }; });
  // Effect param: an adjustment-layer invert ramping over the white swatch C (no glow: use B unblurred? use A).
  await scene('effect param (invert amount)', [A, ADJ], (px) => at(px, 90, 90));

  // Morph: a square corner (lit at f0) vs the circle (dark there at f30); the centre stays lit.
  await scene('shape morph', [D], (px) => ({ corner: at(px, 114, 44)[1], centre: at(px, 160, 90)[1], tip: at(px, 160, 28)[1] }));

  // Legacy: empty tracks == no tracks.
  const legacy = compOf([A, B, C]);
  const emptied = structuredClone(legacy);
  for (const l of emptied.layers) if (l.animProps) for (const k of Object.keys(l.animProps)) { if (k === 'effectParams') continue; l.animProps[k].keyframes = []; }
  const stripped = structuredClone(emptied);
  for (const l of stripped.layers) delete l.animProps;
  const e1 = await render(R, emptied, 15), e2 = await render(R, stripped, 15);
  out.legacyDiff = maxDiff(e1.px, e2.px);

  // ── B48 renderFrame / renderStrip: the agent's full-resolution PNG equals a direct offscreen render ──
  const pngPixels = async (exportId, bytes) => {
    const c = await a.readExport(exportId, 0, bytes);
    const bin = atob(c.base64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([u8], { type: 'image/png' }));
    const cv = new OffscreenCanvas(bmp.width, bmp.height); const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0);
    return { w: bmp.width, h: bmp.height, px: Array.from(g.getImageData(0, 0, bmp.width, bmp.height).data) };
  };
  const rf = (await run('agent.renderFrame', { frame: 15 })).result;
  const rfPx = await pngPixels(rf.exportId, rf.bytes);
  const full = structuredClone(useEditorStore.getState().composition);
  const direct = await render(R, full, 15);
  out.renderFrame = { w: rfPx.w, h: rfPx.h, diff: maxDiff(rfPx.px, direct.px), mime: rf.mimeType };
  const rf2 = (await run('agent.renderFrame', { frame: 30, width: 160 })).result;
  out.renderFrameHalf = [rf2.width, rf2.height];
  const strip = (await run('agent.renderStrip', { frames: [0, 15, 30], columns: 3, tileWidth: 160 })).result;
  out.strip = { w: strip.width, h: strip.height, cols: strip.columns, tile: [strip.tileWidth, strip.tileHeight] };
  out.renderNoDom = document.querySelectorAll('canvas').length;
  return out;
};
window.__ready = true;
`;

const dir = makeTempDir('ffx-anim-props-');
try {
  await bundleEntry(ENTRY, dir);
  const r = await withHeadlessPage({ dir, timeoutMs: 300000 }, async (page) => {
    await page.evaluate("import('/bundle.js').then(() => true)");
    for (let i = 0; i < 100 && !(await page.evaluate('window.__ready === true')); i++) await new Promise((res) => setTimeout(res, 100));
    if (!(await page.evaluate('window.__ready === true'))) throw new Error(`bundle failed to load:\n${page.logs.join('\n')}`);
    try {
      return await page.evaluate('window.__animGpu()');
    } catch (e) {
      throw new Error(`${e.message}\n${page.logs.slice(-30).join('\n')}`);
    }
  });
  if (r.noAdapter) { console.log('SKIP: no WebGPU adapter in headless Chrome on this machine'); process.exit(0); }
  let passed = 0;
  const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
  const sc = r.scenes;
  console.log(JSON.stringify({ agent: r.agent, scenes: Object.fromEntries(Object.entries(sc).map(([k, v]) => [k, Object.fromEntries(Object.entries(v.frames).map(([f, x]) => [f, x]))])), legacyDiff: r.legacyDiff, modules: r.modules }, null, 1));

  check(`all ${r.modules} shader modules compile; no GPU validation errors on any frame`, () => assert.deepEqual(r.errors, []));

  check('B46 addShapeLayer: one undo step, clean defaults (no stroke), named', () => {
    assert.equal(r.agent.addShapeUndoSteps, 1);
    assert.equal(r.agent.addShapeStroke, 0);
    assert.equal(r.agent.addShapeName, 'Swatch');
  });
  check('B46 setKeyframes: one undo step for 3 keys + eases; bad path / wrong value shape rejected with nothing applied', () => {
    assert.equal(r.agent.setKeyframesUndoSteps, 1);
    assert.equal(r.agent.fillKeys, 3);
    assert.equal(r.agent.badPath, false);
    assert.equal(r.agent.badShape, false);
    assert.equal(r.agent.undoDepthAfterRejects, 1);
    assert.deepEqual(r.agent.posInterp, ['bezier', 'hold', 'linear']);
  });
  check('B46 measureString measures without a layer; getState lists background, tracks and animProps', () => {
    assert.ok(r.agent.measureHi.width > 50 && r.agent.measureHi.height > 50, JSON.stringify(r.agent.measureHi));
    assert.ok(r.agent.measureLong > r.agent.measureHi.width * 2);
    assert.ok(r.agent.state.background >= 1 && r.agent.state.tracks >= 1);
    assert.ok(r.agent.state.animA.includes('fillColor'));
    assert.deepEqual(r.agent.state.animAdj, ['effect 121_0']);
  });

  for (const [name, s] of Object.entries(sc)) {
    check(`${name}: keyed frames render byte-identically to their static twins (frames ${Object.keys(s.frames).join(', ')})`, () => {
      for (const [f, x] of Object.entries(s.frames)) assert.equal(x.keyedVsStatic, 0, `${name} f${f} differs by ${x.keyedVsStatic}`);
    });
  }

  check('B33 fill colour animates on screen: red -> eased -> exact blue hold -> green', () => {
    const p = (f) => sc['fill colour'].frames[f].probe;
    assert.deepEqual(p(0).slice(0, 3), [255, 0, 0]);
    const mid = p(7); assert.ok(mid[0] < 250 && mid[2] > 5, `f7 is between red and blue: ${mid}`);
    assert.deepEqual(p(20).slice(0, 3), [0, 0, 255]);
    assert.deepEqual(p(25).slice(0, 3), [0, 0, 255], 'hold keeps blue until the next key');
    assert.deepEqual(p(30).slice(0, 3), [0, 255, 0]);
  });
  check('B50 blur radius ramps on screen: the soft edge narrows to sharp as the radius keys to 0', () => {
    const w = (f) => sc['blur radius'].frames[f].probe;
    assert.ok(w(0) > w(15) && w(15) >= w(25) && w(25) >= w(30), `soft-edge widths ${[0, 15, 25, 30].map(w)}`);
    assert.ok(w(0) >= 8, `a 24 px blur has a wide soft edge (${w(0)})`);
    assert.ok(w(30) <= 1, `radius 0 is sharp (${w(30)})`);
  });
  check('B47 glow halo brightens with the keyed intensity and turns blue with the keyed colour', () => {
    const g = (f) => sc['glow intensity + colour'].frames[f].probe;
    assert.ok(g(0)[0] + g(0)[1] + g(0)[2] <= 6, `no glow at intensity 0: ${g(0)}`);
    assert.ok(g(30)[2] > g(15)[2] && g(15)[2] > g(0)[2], `halo blue rises: ${[0, 15, 30].map((f) => g(f)[2])}`);
    assert.ok(g(30)[2] > g(30)[0] + 20, `halo tinted blue at f30: ${g(30)}`);
  });
  check('B33 text colour animates on screen (white -> orange; the text texture re-rasterizes per frame)', () => {
    const t = (f) => sc['text colour'].frames[f].probe;
    assert.ok(t(0).white > 200 && t(0).orange === 0, JSON.stringify(t(0)));
    assert.ok(t(30).orange > 200 && t(30).white === 0, JSON.stringify(t(30)));
  });
  check('B50 effect-stack param (adjustment invert amount) ramps on screen', () => {
    const e = (f) => sc['effect param (invert amount)'].frames[f].probe;
    // Under the adjustment the swatch is red (f0, invert 0) ... green at f30 inverted to magenta.
    assert.deepEqual(e(0).slice(0, 3), [255, 0, 0]);
    assert.deepEqual(e(30).slice(0, 3), [255, 0, 255]);
  });
  check('legacy: empty override tracks render byte-identically to none', () => assert.equal(r.legacyDiff, 0));
  check('B62 setShapeMorph: one undo step, eases + auto-align stored per pose, bad shape rejected', () => {
    assert.equal(r.agent.morphUndoSteps, 1);
    assert.deepEqual(r.agent.morphPoses, [[0, 'cubicInOut', 'auto'], [15, 'backOut', 'auto'], [30, null, 'auto']]);
    assert.equal(r.agent.morphBad, false);
  });
  check('B62 morph renders on screen: square corner lit at f0, star tip at f15, circle (corner dark) at f30', () => {
    const p = (f) => sc['shape morph'].frames[f].probe;
    assert.ok(p(0).corner > 200 && p(0).centre > 200, JSON.stringify(p(0)));
    assert.ok(p(15).tip > 200, `star tip reaches above the square at f15: ${JSON.stringify(p(15))}`);
    assert.ok(p(30).corner < 10 && p(30).centre > 200, JSON.stringify(p(30)));
  });
  check('B48 agent.renderFrame: full-resolution PNG at comp size equals a direct offscreen render; no DOM canvas', () => {
    assert.equal(r.renderFrame.mime, 'image/png');
    assert.deepEqual([r.renderFrame.w, r.renderFrame.h], [320, 180]);
    assert.equal(r.renderFrame.diff, 0, `renderFrame vs direct render max diff ${r.renderFrame.diff}`);
    assert.deepEqual(r.renderFrameHalf, [160, 90], 'width alone keeps the aspect');
    assert.equal(r.renderNoDom, 0);
  });
  check('B48 agent.renderStrip: a labelled 3-up contact sheet with the right geometry', () => {
    assert.deepEqual(r.strip, { w: 3 * 160 + 4 * 4, h: 90 + 2 * 4, cols: 3, tile: [160, 90] });
  });

  console.log(`\ngpu:anim-props - ${passed} checks passed`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
