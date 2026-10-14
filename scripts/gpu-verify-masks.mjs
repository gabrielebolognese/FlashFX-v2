// GPU harness for freeform path masks (B10d-mask). Runs in headless Chrome with WebGPU (see
// scripts/lib/headless-gpu.mjs) - NOT part of `npm test` (CI has no GPU); run locally:
//   node scripts/gpu-verify-masks.mjs   (or: npm run gpu:masks)
//
// Proves on the real GPU:
//  1. The SHIPPING mask WGSL (engine/maskWgsl.ts) compiles and, run as a compute shader over a pixel
//     grid, matches its CPU twin core/maskCoverage.ts maskStackCoverage for parametric stacks (the
//     legacy path, regression), freeform bezier/polyline/refit/inverted/feathered/concave/rotated
//     masks, and mixed stacks - pixel for pixel.
//  2. The REAL WebGPURenderer: every shader module it creates compiles with zero errors, and a
//     resolved composition with path masks (shape / image / text layers, animated path) renders the
//     expected coverage.
//  3. The REAL authoring UI: MaskOverlay + the editor store driven by genuine Chrome mouse events -
//     draw a path mask with the mask pen, drag a vertex, double-click to insert / convert, Delete.

import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { bundleEntry, findChrome, makeTempDir, runInHeadlessChrome, withHeadlessPage } from './lib/headless-gpu.mjs';

const ENTRY = String.raw`
import { MASK_WGSL } from '@/engine/maskWgsl';
import { packMaskSlots, maskStackCoverage, freeformCoverage, MASK_SLOT_FLOATS, FREEFORM_MASK_TYPE, MASK_BLOCK_FLOATS } from '@/core/maskCoverage';
import { pathMaskFromComp } from '@/core/maskPath';
import { WebGPURenderer } from '@/engine/renderer';
import { resolveFrame } from '@/core/interpolation';
import { createComposition, createRectangleLayer, createTextLayer, createImageLayer, createMask } from '@/core/factory';
import { mediaAssetManager } from '@/engine/media/assetManager';

const K = 0.5523;
const cv = (x, y) => ({ position: [x, y], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' });
const bv = (p, hin, hout) => ({ position: p, handleIn: hin, handleOut: hout, vertexType: 'smooth' });
const circle = () => [
  bv([0.5, 0], [0, -0.5 * K], [0, 0.5 * K]),
  bv([0, 0.5], [0.5 * K, 0], [-0.5 * K, 0]),
  bv([-0.5, 0], [0, 0.5 * K], [0, -0.5 * K]),
  bv([0, -0.5], [-0.5 * K, 0], [0.5 * K, 0]),
];
const square = () => [cv(-0.5, -0.5), cv(0.5, -0.5), cv(0.5, 0.5), cv(-0.5, 0.5)];
const starPoly = (n) => Array.from({ length: n * 2 }, (_, i) => {
  const a = (i / (n * 2)) * Math.PI * 2;
  const r = i % 2 === 0 ? 0.5 : 0.22;
  return cv(Math.cos(a) * r, Math.sin(a) * r);
});
// A smooth wavy blob with many vertices (forces the over-budget refit).
const wavy = (n) => {
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const r = 0.5 * (0.82 + 0.18 * Math.sin(a * 5));
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  return pts.map((p, i) => {
    const pr = pts[(i - 1 + n) % n], nx = pts[(i + 1) % n];
    const h = [(nx[0] - pr[0]) / 6, (nx[1] - pr[1]) / 6];
    return bv(p, [-h[0], -h[1]], h);
  });
};
const rm = (o) => ({ type: 'rectangle', centerX: 80, centerY: 60, sizeX: 70, sizeY: 70, rotation: 0, feather: 0, invert: false, opacity: 1, points: 5, innerRadius: 12, ...o });

const SCENES = {
  'parametric stack (legacy path)': [
    rm({ type: 'rectangle', sizeX: 120, sizeY: 90, feather: 3, rotation: 15 }),
    rm({ type: 'ellipse', centerX: 70, sizeX: 110, sizeY: 80, feather: 6 }),
    rm({ type: 'star', centerX: 90, centerY: 55, sizeX: 100, innerRadius: 22, points: 6, feather: 1.5, invert: true, opacity: 0.7 }),
    rm({ type: 'polygon', centerX: 75, sizeX: 130, points: 7, feather: 2 }),
  ],
  'freeform square, hard edge': [rm({ vertices: square(), sizeX: 63, sizeY: 47 })],
  'freeform bezier circle, rotated + feathered': [rm({ vertices: circle(), sizeX: 90, sizeY: 60, rotation: 30, feather: 4 })],
  'freeform per-vertex feather': [rm({ vertices: square(), sizeX: 80, sizeY: 60, feathers: [0, 14, 0, 14] })],
  'freeform inverted at 60% opacity': [rm({ vertices: circle(), sizeX: 70, sizeY: 70, invert: true, opacity: 0.6, feather: 2 })],
  'freeform concave star (10 corners)': [rm({ vertices: starPoly(5), sizeX: 110, sizeY: 110, feather: 1 })],
  'freeform over budget (24 vertices, refit) + rect': [
    rm({ vertices: wavy(24), sizeX: 110, sizeY: 100, feather: 1.5 }),
    rm({ type: 'rectangle', centerX: 95, centerY: 70, sizeX: 90, sizeY: 70, feather: 2 }),
  ],
  'two freeform + one parametric (slot sharing)': [
    rm({ vertices: circle(), centerX: 60, sizeX: 90, sizeY: 90, feather: 2 }),
    rm({ type: 'ellipse', centerX: 90, sizeX: 120, sizeY: 100, feather: 4 }),
    rm({ vertices: wavy(16), centerX: 85, centerY: 55, sizeX: 100, sizeY: 90, feather: 1 }),
  ],
  'freeform squeezed to a polyline (7th mask)': [
    ...Array.from({ length: 6 }, (_, i) => rm({ type: 'rectangle', sizeX: 150 - i * 4, sizeY: 110 - i * 3, feather: 1 })),
    rm({ vertices: circle(), sizeX: 80, sizeY: 80, feather: 1 }),
  ],
};

const COMPUTE = (wgsl) => '\n' +
  'struct MaskSlot { params: vec4f, center: vec2f, size: vec2f, rot: f32, points: f32, inner: f32, _pad: f32, }\n' +
  'struct U { maskCount: f32, w: f32, h: f32, _p: f32, masks: array<MaskSlot, 8>, }\n' +
  '@group(0) @binding(0) var<uniform> u: U;\n' +
  '@group(0) @binding(1) var<storage, read_write> outBuf: array<f32>;\n' +
  wgsl + '\n' +
  '@compute @workgroup_size(8, 8)\n' +
  'fn main(@builtin(global_invocation_id) id: vec3u) {\n' +
  '  let W = u32(u.w); let H = u32(u.h);\n' +
  '  if (id.x >= W || id.y >= H) { return; }\n' +
  '  let world = vec2f(f32(id.x) + 0.5, f32(id.y) + 0.5);\n' +
  '  outBuf[id.y * W + id.x] = computeMaskStackAlpha(world, i32(u.maskCount + 0.5), u.masks);\n' +
  '}\n';

// Is (x, y) within 'eps' of any freeform edge in the block? (f32 vs f64 winding may disagree there.)
function nearFreeformEdge(block, count, x, y, eps) {
  let i = 0;
  while (i < count) {
    const o = 4 + i * MASK_SLOT_FLOATS;
    if (Math.round(block[o]) === FREEFORM_MASK_TYPE) {
      if (Math.abs(freeformCoverage(block, o, x, y).signedDist) < eps) return true;
      i += Math.max(1, Math.round(block[o + 10]));
    } else i++;
  }
  return false;
}

async function shaderParity(device) {
  const module = device.createShaderModule({ code: COMPUTE(MASK_WGSL) });
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter((m) => m.type === 'error').map((m) => m.message + ' (line ' + m.lineNum + ')');
  if (errors.length) return { compileErrors: errors };
  const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
  const W = 160, H = 120;
  const results = {};
  for (const [name, masks] of Object.entries(SCENES)) {
    const block = new Float32Array(4 + MASK_BLOCK_FLOATS);
    const count = packMaskSlots(masks, block, 4);
    block[0] = count; block[1] = W; block[2] = H;
    const ubuf = device.createBuffer({ size: block.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(ubuf, 0, block);
    const sbuf = device.createBuffer({ size: W * H * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const rbuf = device.createBuffer({ size: W * H * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const bg = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubuf } }, { binding: 1, resource: { buffer: sbuf } }] });
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(Math.ceil(W / 8), Math.ceil(H / 8)); pass.end();
    enc.copyBufferToBuffer(sbuf, 0, rbuf, 0, W * H * 4);
    device.queue.submit([enc.finish()]);
    await rbuf.mapAsync(GPUMapMode.READ);
    const gpu = new Float32Array(rbuf.getMappedRange().slice(0));
    rbuf.unmap();
    let maxErr = 0, ambiguous = 0, sum = 0, mixed = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const g = gpu[y * W + x];
      const c = maskStackCoverage(block, 4, count, x + 0.5, y + 0.5);
      sum += c;
      if (c > 0.01 && c < 0.99) mixed++;
      const e = Math.abs(g - c);
      if (e > 0.02 && nearFreeformEdge(block, count, x + 0.5, y + 0.5, 0.05)) { ambiguous++; continue; }
      if (e > maxErr) maxErr = e;
    }
    const freeform = [];
    for (let i = 0; i < count;) {
      const o = 4 + i * MASK_SLOT_FLOATS;
      if (Math.round(block[o]) === FREEFORM_MASK_TYPE) { freeform.push({ count: block[o + 4], mode: block[o + 5], span: block[o + 10] }); i += block[o + 10]; } else i++;
    }
    results[name] = { slots: count, freeform, maxErr, ambiguous, meanCoverage: sum / (W * H), mixed };
    [ubuf, sbuf, rbuf].forEach((b) => b.destroy());
  }
  return { results };
}

async function readPixels(renderer, W, H) {
  const c2 = new OffscreenCanvas(W, H);
  const g = c2.getContext('2d');
  g.drawImage(renderer.getOffscreenCanvas(), 0, 0);
  return g.getImageData(0, 0, W, H).data;
}

function pathMaskFor(compVerts, extra = {}) {
  const { center, size, vertices } = pathMaskFromComp(compVerts);
  const m = createMask('rectangle', center[0], center[1], size[0], size[1]);
  return Object.assign(m, { vertices }, extra);
}

async function rendererIntegration() {
  const W = 320, H = 180;
  const r = new WebGPURenderer();
  const modules = [];
  const orig = GPUDevice.prototype.createShaderModule;
  GPUDevice.prototype.createShaderModule = function (desc) { const m = orig.call(this, desc); modules.push({ m, code: desc.code }); return m; };
  let ok;
  try { ok = await r.initializeOffscreen(W, H); } finally { GPUDevice.prototype.createShaderModule = orig; }
  if (!ok) return { initFailed: true };
  const compileErrors = [];
  for (const { m } of modules) {
    const info = await m.getCompilationInfo();
    for (const msg of info.messages) if (msg.type === 'error') compileErrors.push(msg.message + ' (line ' + msg.lineNum + ')');
  }
  const maskModules = modules.filter((x) => x.code.includes('computeFreeformMaskAlpha')).length;
  const device = r.offscreenGpu.device;
  const out = { modules: modules.length, maskModules, compileErrors, scenes: {} };

  const comp = createComposition('t', { width: W, height: H, frameRate: 30, durationFrames: 30, backgroundColor: [0, 0, 0, 1] });
  const scene = async (name, layers, check) => {
    comp.layers = layers;
    const frame = resolveFrame(comp, 0);
    device.pushErrorScope('validation');
    await r.renderFrameAsync(frame, 'offscreen');
    const err = await device.popErrorScope();
    const px = await readPixels(r, W, H);
    out.scenes[name] = { validationError: err ? err.message : null, ...check(px, frame) };
  };
  const at = (px, x, y) => [px[(y * W + x) * 4], px[(y * W + x) * 4 + 1], px[(y * W + x) * 4 + 2]];

  // Shape layer, triangle path mask, hard edge: compare every pixel's red channel against the CPU
  // coverage of the RESOLVED masks (bg + (fg - bg) * coverage).
  const coverageCompare = (px, frame, ch = 0) => {
    const block = new Float32Array(MASK_BLOCK_FLOATS);
    const count = packMaskSlots(frame.layers[0].masks, block, 0);
    const bgPx = at(px, 1, 1);
    const fg = 255;
    let maxErr = 0, ambiguous = 0, inside = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const cov = maskStackCoverage(block, 0, count, x + 0.5, y + 0.5);
      if (cov > 0.99) inside++;
      const expect = bgPx[ch] + (fg - bgPx[ch]) * cov;
      const e = Math.abs(px[(y * W + x) * 4 + ch] - expect);
      if (e > 4) {
        let near = false;
        for (let i = 0; i < count;) { const o = i * MASK_SLOT_FLOATS; if (Math.round(block[o]) === FREEFORM_MASK_TYPE) { if (Math.abs(freeformCoverage(block, o, x + 0.5, y + 0.5).signedDist) < 0.75) near = true; i += block[o + 10]; } else i++; }
        if (near) { ambiguous++; continue; }
      }
      if (e > maxErr) maxErr = e;
    }
    return { maxErr, ambiguous, inside, bg: bgPx, center: at(px, 160, 110) };
  };
  const tri = [cv(60, 160), cv(160, 20), cv(270, 150)];
  const red = () => createRectangleLayer('r', W / 2, H / 2, W, H, [1, 0, 0, 1], 30);

  await scene('shape + triangle path mask', [Object.assign(red(), { masks: [pathMaskFor(tri)] })], coverageCompare);
  await scene('shape + bezier blob, rotated, per-vertex feather', [Object.assign(red(), {
    masks: [Object.assign(pathMaskFor(wavy(8).map((v) => ({ ...v, position: [160 + v.position[0] * 200, 90 + v.position[1] * 140], handleIn: [v.handleIn[0] * 200, v.handleIn[1] * 140], handleOut: [v.handleOut[0] * 200, v.handleOut[1] * 140] }))), { feathers: [0, 6, 12, 6, 0, 6, 12, 6] })],
  })], coverageCompare);
  await scene('shape + inverted path mask + rect mask stack', [Object.assign(red(), {
    masks: [Object.assign(pathMaskFor(tri), { inverted: true }), createMask('rectangle', 160, 90, 280, 150)],
  })], coverageCompare);

  // Animated path (equal-count poses) resolved mid-morph by resolveFrame: the render must match the
  // interpolated outline (left edge 40 → 120 over frames 0 → 20, so x = 80 at frame 10).
  {
    const pm = pathMaskFor([cv(40, 30), cv(280, 30), cv(280, 150), cv(40, 150)]);
    const local = pm.vertices;
    const moved = local.map((v, i) => (i === 0 || i === 3 ? { ...v, position: [v.position[0] + 80 / 240, v.position[1]] } : v));
    pm.pathKeyframes = [{ frame: 0, vertices: local, closed: true }, { frame: 20, vertices: moved, closed: true }];
    comp.layers = [Object.assign(red(), { masks: [pm] })];
    const frame10 = resolveFrame(comp, 10);
    device.pushErrorScope('validation');
    await r.renderFrameAsync(frame10, 'offscreen');
    const err = await device.popErrorScope();
    const px = await readPixels(r, W, H);
    out.scenes['animated path mask, mid-morph'] = { validationError: err ? err.message : null, ...coverageCompare(px, frame10), left78: at(px, 78, 90), left82: at(px, 82, 90) };
  }

  // Image layer (image pipeline): an opaque green bitmap masked by a path.
  {
    const c = new OffscreenCanvas(W, H);
    const g = c.getContext('2d');
    g.fillStyle = '#00ff00';
    g.fillRect(0, 0, W, H);
    const bmp = await createImageBitmap(c);
    const orig = mediaAssetManager.getImageBitmap.bind(mediaAssetManager);
    mediaAssetManager.getImageBitmap = (id) => (id === 'gpu-mask-img' ? bmp : orig(id));
    const img = createImageLayer('img', W / 2, H / 2, 'gpu-mask-img', W, H, 'png', 0, 30);
    await scene('image + path mask', [Object.assign(img, { masks: [pathMaskFor(tri)] })], (px, frame) => coverageCompare(px, frame, 1));
    mediaAssetManager.getImageBitmap = orig;
  }

  // Text layer (text pipeline) masked to its left half by a path mask: no ink may survive on the right.
  const textScene = (masked) => (px) => {
    let left = 0, right = 0;
    for (let y = 40; y < 140; y++) for (let x = 20; x < 300; x++) {
      const v = px[(y * W + x) * 4 + 1];
      if (v > 120) { if (x < 160) left++; else if (x > 166) right++; }
    }
    return { masked, inkLeft: left, inkRight: right };
  };
  const text = () => { const t = createTextLayer('t', W / 2, H / 2, 'MMMMMMMM', 30, [1, 1, 1, 1]); t.content.spans[0].style.fontSize = 64; return t; };
  await scene('text unmasked', [text()], textScene(false));
  await scene('text + left-half path mask', [Object.assign(text(), { masks: [pathMaskFor([cv(0, 0), cv(160, 0), cv(160, 180), cv(0, 180)])] })], textScene(true));
  r.destroy();
  return out;
}

window.__maskGpu = async () => {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) return { noAdapter: true };
  const device = await adapter.requestDevice();
  const parity = await shaderParity(device);
  device.destroy();
  const renderer = await rendererIntegration();
  return { parity, renderer };
};
`;

const UI_ENTRY = String.raw`
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MaskOverlay } from '@/ui/panels/MaskOverlay';
import { useEditorStore } from '@/store/editor';
import { useMaskStore } from '@/store/mask';
import { useHistoryStore } from '@/store/history';
import { handleMaskKey } from '@/store/maskPen';
import { createRectangleLayer } from '@/core/factory';
import { maskPathToComp } from '@/core/maskPath';
import { evaluateVec2, evaluateNumber } from '@/core/interpolation';

// Tailwind is not loaded here: the few utility classes the overlay positions with.
const css = document.createElement('style');
css.textContent = '.absolute{position:absolute}.inset-0{top:0;right:0;bottom:0;left:0}.overflow-visible{overflow:visible}.pointer-events-none{pointer-events:none}.pointer-events-auto{pointer-events:auto}';
document.head.appendChild(css);
document.body.style.margin = '0';

const r10 = (x) => Math.round(x * 10) / 10;

window.__ui = {
  setup() {
    const st = useEditorStore.getState();
    const layer = createRectangleLayer('r', 960, 540, 1920, 1080, [1, 0, 0, 1], 150);
    useEditorStore.setState({ composition: { ...st.composition, layers: [layer] } });
    useEditorStore.getState().selectLayer(layer.id, false, 'canvas');
    const host = document.createElement('div');
    host.style.cssText = 'position:relative;width:960px;height:540px';
    document.body.appendChild(host);
    createRoot(host).render(React.createElement(MaskOverlay, { style: { position: 'absolute', left: 0, top: 0, width: 960, height: 540 } }));
    window.__layerId = layer.id;
    return layer.id;
  },
  startPen() { useMaskStore.getState().startMaskPen(window.__layerId); },
  key(k) { return handleMaskKey(new KeyboardEvent('keydown', { key: k })); },
  undo() { useHistoryStore.getState().undo(); },
  state() {
    const comp = useEditorStore.getState().composition;
    const layer = comp.layers.find((l) => l.id === window.__layerId);
    const ms = useMaskStore.getState();
    const m = layer.masks ? layer.masks[0] : undefined;
    const out = {
      maskCount: layer.masks ? layer.masks.length : 0, pen: ms.penLayerId, draft: ms.penDraft.length,
      selectedMaskId: ms.selectedMaskId, selectedVertex: ms.selectedVertex,
      history: useHistoryStore.getState().undoStack.map((c) => c.label),
    };
    if (m) {
      const pos = evaluateVec2(m.position, 0), size = evaluateVec2(m.size, 0);
      const cv = maskPathToComp(m.vertices, { cx: pos[0], cy: pos[1], sx: size[0], sy: size[1], rotation: evaluateNumber(m.rotation, 0) });
      Object.assign(out, {
        maskId: m.id, name: m.name, size,
        comp: cv.map((v) => ({ p: v.position.map(r10), i: v.handleIn.map(r10), o: v.handleOut.map(r10), t: v.vertexType })),
      });
    }
    return out;
  },
};
`;

const chrome = findChrome();
if (!chrome) {
  console.error('✖ gpu:masks needs Chrome/Chromium/Edge with WebGPU (set CHROME_PATH).');
  process.exit(2);
}

const dir = makeTempDir('gpu-masks-');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

try {
  await bundleEntry(ENTRY, dir);
  const { value, logs } = await runInHeadlessChrome({ dir, expression: `(async () => { await import('/bundle.js'); return await window.__maskGpu(); })()` });
  if (!value || value.noAdapter) throw new Error('no WebGPU adapter in headless Chrome');
  const { parity, renderer } = value;

  check('shipping mask WGSL compiles (compute harness)', () => {
    assert.ok(!parity.compileErrors, `WGSL errors: ${JSON.stringify(parity.compileErrors)}`);
  });
  for (const [name, r] of Object.entries(parity.results)) {
    check(`GPU == CPU twin: ${name} (max err ${r.maxErr.toFixed(4)}, ${r.ambiguous} edge px, slots ${r.slots}${r.freeform.length ? `, freeform ${JSON.stringify(r.freeform)}` : ''})`, () => {
      assert.ok(r.maxErr < 0.02, `max |gpu - cpu| = ${r.maxErr}`);
      assert.ok(r.ambiguous < 40, `${r.ambiguous} edge-ambiguous pixels`);
      assert.ok(r.meanCoverage > 0.02 && r.meanCoverage < 0.98, `scene is non-trivial (mean coverage ${r.meanCoverage})`);
    });
  }
  check('slot packing: refit stays bezier, the 7th-mask squeeze falls back to a polyline', () => {
    const over = parity.results['freeform over budget (24 vertices, refit) + rect'].freeform[0];
    assert.equal(over.mode, 0);
    assert.ok(over.count >= 3 && over.count < 24, `refit to ${over.count} vertices`);
    const squeezed = parity.results['freeform squeezed to a polyline (7th mask)'].freeform[0];
    assert.equal(squeezed.mode, 1);
    assert.equal(squeezed.span, 2);
  });

  check(`real WebGPURenderer: all ${renderer.modules} shader modules compile (mask WGSL in ${renderer.maskModules})`, () => {
    assert.ok(!renderer.initFailed, 'offscreen init failed');
    assert.deepEqual(renderer.compileErrors, []);
    assert.ok(renderer.maskModules >= 4, `mask WGSL reached ${renderer.maskModules} pipelines`);
  });
  for (const name of ['shape + triangle path mask', 'shape + bezier blob, rotated, per-vertex feather', 'shape + inverted path mask + rect mask stack', 'animated path mask, mid-morph', 'image + path mask']) {
    const s = renderer.scenes[name];
    check(`real render: ${name} matches CPU coverage (max err ${s.maxErr.toFixed(1)}/255, ${s.ambiguous} edge px, ${s.inside} px inside)`, () => {
      assert.equal(s.validationError, null);
      assert.ok(s.maxErr <= 4, `max channel error ${s.maxErr}`);
      assert.ok(s.ambiguous < 200, `${s.ambiguous} ambiguous edge pixels`);
      assert.ok(s.inside > 500, 'mask encloses real area');
    });
  }
  check('real render: the mid-morph outline is the vertex-for-vertex interpolation (edge at x = 80)', () => {
    const s = renderer.scenes['animated path mask, mid-morph'];
    assert.ok(s.left78[0] < 60 && s.left82[0] > 200, `left edge between 78 and 82: ${s.left78} / ${s.left82}`);
  });
  check('real render: text pipeline honours a path mask (ink only on the masked half)', () => {
    const u = renderer.scenes['text unmasked'];
    const m = renderer.scenes['text + left-half path mask'];
    assert.equal(m.validationError, null);
    assert.ok(u.inkLeft > 200 && u.inkRight > 200, `unmasked text has ink on both halves (${u.inkLeft}/${u.inkRight})`);
    assert.ok(m.inkLeft > 200, `masked text keeps its left half (${m.inkLeft})`);
    assert.equal(m.inkRight, 0, `masked text has no ink on the right (${m.inkRight})`);
  });
  // ── 3. Authoring UI, real mouse events ──
  const uiDir = join(dir, 'ui');
  mkdirSync(uiDir);
  await bundleEntry(UI_ENTRY, uiDir);
  const ui = await withHeadlessPage({ dir: uiDir }, async (page) => {
    const ev = (expr) => page.evaluate(expr);
    const mouse = (type, x, y, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
    const click = async (x, y, clickCount = 1) => {
      await mouse('mouseMoved', x, y, { buttons: 0, button: 'none' });
      await mouse('mousePressed', x, y, { clickCount });
      await mouse('mouseReleased', x, y, { clickCount });
    };
    const dragTo = async (x0, y0, x1, y1) => {
      await mouse('mouseMoved', x0, y0, { buttons: 0, button: 'none' });
      await mouse('mousePressed', x0, y0);
      for (let k = 1; k <= 4; k++) await mouse('mouseMoved', x0 + ((x1 - x0) * k) / 4, y0 + ((y1 - y0) * k) / 4);
      await mouse('mouseReleased', x1, y1);
    };
    const settle = () => ev('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
    const snap = async () => { await settle(); return ev('window.__ui.state()'); };
    await ev(`(async () => { await import('/bundle.js'); return window.__ui.setup(); })()`);
    await settle();
    const r = {};
    // Pen: corner, corner, a dragged smooth point, then close on the first point. The overlay is
    // 960x540 for a 1920x1080 comp, so screen (x, y) = comp (2x, 2y).
    await ev('window.__ui.startPen()');
    await settle();
    await click(100, 100);
    await click(500, 100);
    await dragTo(500, 400, 560, 400);
    r.drafting = await snap();
    await click(100, 100);
    r.drawn = await snap();
    // Drag anchor 1 (screen 500,100) by (+20, +30).
    await dragTo(500, 100, 520, 130);
    r.dragged = await snap();
    // Double-click the top edge (anchor 0 at 100,100 to the dragged anchor 1 at 520,130 - y = 114.3
    // at x = 300) to insert a vertex, then Delete it.
    await click(300, 114, 1);
    await click(300, 114, 2);
    r.inserted = await snap();
    r.deleteConsumed = await ev("window.__ui.key('Delete')");
    r.deleted = await snap();
    // Double-click anchor 0: corner -> smooth; undo restores the corner.
    await click(100, 100, 1);
    await click(100, 100, 2);
    r.converted = await snap();
    await ev('window.__ui.undo()');
    r.undone = await snap();
    // Esc clears a draft, a second Esc leaves the pen; neither touches the existing mask.
    await ev('window.__ui.startPen()');
    await settle();
    await click(700, 300);
    r.escDraft = await snap();
    await ev("window.__ui.key('Escape')");
    r.esc1 = await snap();
    await ev("window.__ui.key('Escape')");
    r.esc2 = await snap();
    r.logs = page.logs.filter((l) => /^(error|exception)/.test(l));
    return r;
  });

  const P = (v) => v.p;
  check('UI: the mask pen drafts corners and a dragged smooth point', () => {
    assert.notEqual(ui.drafting.pen, null);
    assert.equal(ui.drafting.draft, 3);
    assert.equal(ui.drafting.maskCount, 0);
  });
  check('UI: clicking the first point closes the draft into an undoable path mask (comp-space outline kept)', () => {
    const d = ui.drawn;
    assert.equal(d.pen, null);
    assert.equal(d.maskCount, 1);
    assert.equal(d.selectedMaskId, d.maskId, 'new mask selected');
    assert.equal(d.history.at(-1), 'Add Path Mask');
    assert.deepEqual(d.comp.map(P), [[200, 200], [1000, 200], [1000, 800]]);
    assert.deepEqual(d.comp[2].o, [120, 0]);
    assert.deepEqual(d.comp[2].i, [-120, 0]);
    assert.equal(d.comp[0].t, 'corner');
  });
  check('UI: dragging an anchor moves only that vertex, as one undo step', () => {
    const g = ui.dragged;
    assert.deepEqual(g.comp.map(P), [[200, 200], [1040, 260], [1000, 800]]);
    assert.deepEqual(g.size, ui.drawn.size, 'mask frame untouched');
    assert.equal(g.history.length, ui.drawn.history.length + 1);
    assert.equal(g.history.at(-1), 'Mask Path');
    assert.equal(g.selectedVertex, 1);
  });
  check('UI: double-clicking the outline inserts a vertex ON the edge and selects it; Delete removes it', () => {
    const n = ui.inserted;
    assert.equal(n.comp.length, 4);
    assert.equal(n.selectedVertex, 1);
    const [x, y] = n.comp[1].p;
    const t = (x - 200) / 840;
    assert.ok(t > 0.3 && t < 0.7 && Math.abs(y - (200 + 60 * t)) < 1, `inserted on the edge: ${x},${y}`);
    assert.equal(n.history.at(-1), 'Add Mask Vertex');
    assert.equal(ui.deleteConsumed, true, 'Delete went to the vertex, not the layer');
    assert.deepEqual(ui.deleted.comp.map(P), ui.dragged.comp.map(P));
    assert.equal(ui.deleted.maskCount, 1);
  });
  check('UI: double-clicking an anchor converts corner -> smooth; undo restores it', () => {
    assert.equal(ui.converted.comp[0].t, 'smooth');
    assert.ok(ui.converted.comp[0].o.some((x) => x !== 0));
    assert.equal(ui.undone.comp[0].t, 'corner');
  });
  check('UI: Esc clears the draft, then exits the pen; the existing mask is untouched', () => {
    assert.equal(ui.escDraft.draft, 1);
    assert.equal(ui.esc1.draft, 0);
    assert.notEqual(ui.esc1.pen, null);
    assert.equal(ui.esc2.pen, null);
    assert.equal(ui.esc2.maskCount, 1);
  });
  check('UI: no React / runtime errors logged while authoring', () => {
    assert.deepEqual(ui.logs, []);
  });

  const gpuErrors = logs.filter((l) => /WGSL|validation|GPUValidationError|Invalid ShaderModule/i.test(l));
  check('no WebGPU validation / WGSL errors logged by the page', () => {
    assert.deepEqual(gpuErrors, []);
  });

  console.log(`\n✓ all ${passed} GPU checks passed`);
} catch (err) {
  console.error('\n✖ gpu:masks failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
