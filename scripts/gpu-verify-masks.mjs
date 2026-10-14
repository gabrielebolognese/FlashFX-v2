// GPU harness for freeform path masks (B10d-mask) + mask modes / expansion / Refine Edge (B10e). Runs in headless Chrome with WebGPU (see
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
//  4. B10e: mask modes + expansion (GPU == CPU twin, real render), the combined signed-distance field
//     (computeMaskStack with normals == maskStackField), the Refine Edge WGSL (== refineEdgeAt), and the
//     REAL image pipeline refining a too-big roto onto the footage's edge + decontaminating the fringe.
//  5. B10e: the REAL Inspector (Masks tab) on the real stores, genuine mouse + keyboard: Mode select,
//     typed Expand on a pre-B10e mask, the Refine Edge toggle and a Radius drag (one undo entry).

import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { bundleEntry, findChrome, makeTempDir, runInHeadlessChrome, withHeadlessPage } from './lib/headless-gpu.mjs';

const ENTRY = String.raw`
import { MASK_WGSL } from '@/engine/maskWgsl';
import { packMaskSlots, maskStackCoverage, maskStackField, freeformCoverage, MASK_SLOT_FLOATS, FREEFORM_MASK_TYPE, MASK_BLOCK_FLOATS } from '@/core/maskCoverage';
import { REFINE_WGSL } from '@/engine/refineWgsl';
import { refineEdgeAt } from '@/core/refineEdge';
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
  'B10e modes: add + subtract(feathered) + difference': [
    rm({ type: 'ellipse', centerX: 65, sizeX: 90, sizeY: 80, feather: 2, mode: 'add' }),
    rm({ type: 'rectangle', centerX: 95, centerY: 55, sizeX: 60, sizeY: 50, feather: 3, mode: 'subtract' }),
    rm({ vertices: circle(), centerX: 105, centerY: 70, sizeX: 70, sizeY: 70, feather: 1, mode: 'difference' }),
  ],
  'B10e modes: lighten + darken + intersect at partial opacity': [
    rm({ type: 'star', centerX: 80, sizeX: 110, innerRadius: 25, points: 5, feather: 1.5, mode: 'add', opacity: 0.8 }),
    rm({ type: 'ellipse', centerX: 70, sizeX: 100, sizeY: 70, feather: 4, mode: 'lighten', opacity: 0.5 }),
    rm({ vertices: wavy(10), centerX: 90, sizeX: 110, sizeY: 90, feather: 2, mode: 'darken', opacity: 0.9 }),
    rm({ type: 'polygon', centerX: 85, sizeX: 140, points: 6, feather: 2, mode: 'intersect', opacity: 0.7 }),
  ],
  'B10e lone subtract (starts full) + expansion grow / choke': [
    rm({ type: 'rectangle', sizeX: 60, sizeY: 40, rotation: 20, feather: 1, mode: 'subtract', expansion: 8 }),
    rm({ vertices: circle(), centerX: 120, centerY: 40, sizeX: 50, sizeY: 50, feather: 1, mode: 'subtract', expansion: -6 }),
  ],
  'B10e expansion on an inverted freeform + legacy (no-mode) mask': [
    rm({ vertices: starPoly(5), sizeX: 100, sizeY: 100, feather: 1, invert: true, expansion: 5 }),
    rm({ type: 'ellipse', centerX: 85, sizeX: 140, sizeY: 110, feather: 3 }),
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

// ── B10e: the combined signed-distance field + Refine Edge, GPU vs CPU twin ──
const SLOT_STRUCT = 'struct MaskSlot { params: vec4f, center: vec2f, size: vec2f, rot: f32, points: f32, inner: f32, _pad: f32, }\n';

async function runGrid(device, code, uniform, W, H, perPixel) {
  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter((m) => m.type === 'error').map((m) => m.message + ' (line ' + m.lineNum + ')');
  if (errors.length) return { compileErrors: errors };
  const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
  const size = W * H * perPixel * 4;
  const ubuf = device.createBuffer({ size: uniform.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(ubuf, 0, uniform);
  const sbuf = device.createBuffer({ size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const rbuf = device.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const bg = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubuf } }, { binding: 1, resource: { buffer: sbuf } }] });
  const enc = device.createCommandEncoder();
  const pass = enc.beginComputePass();
  pass.setPipeline(pipeline); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(Math.ceil(W / 8), Math.ceil(H / 8)); pass.end();
  enc.copyBufferToBuffer(sbuf, 0, rbuf, 0, size);
  device.queue.submit([enc.finish()]);
  await rbuf.mapAsync(GPUMapMode.READ);
  const out = new Float32Array(rbuf.getMappedRange().slice(0));
  rbuf.unmap();
  [ubuf, sbuf, rbuf].forEach((b) => b.destroy());
  return { out };
}

const FIELD_SCENES = {
  'add + subtract + difference': SCENES['B10e modes: add + subtract(feathered) + difference'],
  'inverted freeform + expansion + legacy': SCENES['B10e expansion on an inverted freeform + legacy (no-mode) mask'],
  'freeform union (wavy + circle)': [rm({ vertices: wavy(12), centerX: 70, sizeX: 90, sizeY: 80, mode: 'add', feather: 2 }), rm({ vertices: circle(), centerX: 110, centerY: 70, sizeX: 60, sizeY: 60, mode: 'add' })],
};

async function fieldParity(device) {
  const W = 160, H = 120;
  const code = '\n' + SLOT_STRUCT +
    'struct U { maskCount: f32, w: f32, h: f32, _p: f32, masks: array<MaskSlot, 8>, }\n' +
    '@group(0) @binding(0) var<uniform> u: U;\n@group(0) @binding(1) var<storage, read_write> outBuf: array<f32>;\n' +
    MASK_WGSL + '\n@compute @workgroup_size(8, 8)\nfn main(@builtin(global_invocation_id) id: vec3u) {\n' +
    '  let W = u32(u.w); let H = u32(u.h);\n  if (id.x >= W || id.y >= H) { return; }\n' +
    '  let f = computeMaskStack(vec2f(f32(id.x) + 0.5, f32(id.y) + 0.5), i32(u.maskCount + 0.5), u.masks, 1e6);\n' +
    '  let o = (id.y * W + id.x) * 4u;\n  outBuf[o] = f.x; outBuf[o + 1u] = f.y; outBuf[o + 2u] = f.z; outBuf[o + 3u] = f.w;\n}\n';
  const results = {};
  for (const [name, masks] of Object.entries(FIELD_SCENES)) {
    const block = new Float32Array(4 + MASK_BLOCK_FLOATS);
    const count = packMaskSlots(masks, block, 4);
    block[0] = count; block[1] = W; block[2] = H;
    const r = await runGrid(device, code, block, W, H, 4);
    if (r.compileErrors) return { compileErrors: r.compileErrors };
    let alphaErr = 0, sdErr = 0, normalMismatch = 0, ambiguous = 0, edges = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const c = maskStackField(block, 4, count, x + 0.5, y + 0.5, 1e6);
      if (nearFreeformEdge(block, count, x + 0.5, y + 0.5, 0.05)) { ambiguous++; continue; }
      alphaErr = Math.max(alphaErr, Math.abs(r.out[o] - c.alpha));
      if (Math.abs(c.sd) < 1e20) {
        edges++;
        sdErr = Math.max(sdErr, Math.abs(r.out[o + 1] - c.sd));
        if (r.out[o + 2] * c.gx + r.out[o + 3] * c.gy < 0.98) normalMismatch++;
      }
    }
    results[name] = { slots: count, alphaErr, sdErr, normalMismatch, ambiguous, edges };
  }
  return { results };
}

// The analytic footage both sides refine against: a red disc (radius 30 at 80, 60) on blue, with a
// linear transition soft px wide.
const discJs = (soft) => (x, y) => {
  const t = Math.min(1, Math.max(0, (Math.hypot(x - 80, y - 60) - 30) / soft + 0.5));
  return [1 - t, 0, t];
};
const REFINE_SCENES = {
  'too-big freeform roto, hard footage edge': { masks: [rm({ vertices: circle(), centerX: 80, centerY: 60, sizeX: 72, sizeY: 72, mode: 'add' })], soft: 1, radius: 8, contrast: 0.25, decon: 0.7 },
  'too-small ellipse roto, soft footage edge': { masks: [rm({ type: 'ellipse', centerX: 80, centerY: 60, sizeX: 50, sizeY: 50, mode: 'add', feather: 1 })], soft: 8, radius: 10, contrast: 0, decon: 1 },
  'hole (subtract + expansion) in a rect': { masks: [rm({ type: 'rectangle', centerX: 80, centerY: 60, sizeX: 150, sizeY: 110, mode: 'add' }), rm({ vertices: circle(), centerX: 80, centerY: 60, sizeX: 66, sizeY: 66, mode: 'subtract', expansion: 2 })], soft: 3, radius: 8, contrast: 0.5, decon: 0.5 },
};

async function refineParity(device) {
  const W = 160, H = 120;
  const code = '\n' + SLOT_STRUCT +
    'struct U { maskCount: f32, w: f32, h: f32, soft: f32, radius: f32, contrast: f32, decon: f32, _p: f32, masks: array<MaskSlot, 8>, }\n' +
    '@group(0) @binding(0) var<uniform> u: U;\n@group(0) @binding(1) var<storage, read_write> outBuf: array<f32>;\n' +
    MASK_WGSL + '\n' + REFINE_WGSL + '\n' +
    'fn refine_sample(p: vec2f) -> vec3f {\n  let t = clamp((length(p - vec2f(80.0, 60.0)) - 30.0) / u.soft + 0.5, 0.0, 1.0);\n  return vec3f(1.0 - t, 0.0, t);\n}\n' +
    '@compute @workgroup_size(8, 8)\nfn main(@builtin(global_invocation_id) id: vec3u) {\n' +
    '  let W = u32(u.w); let H = u32(u.h);\n  if (id.x >= W || id.y >= H) { return; }\n' +
    '  let world = vec2f(f32(id.x) + 0.5, f32(id.y) + 0.5);\n' +
    '  let f = computeMaskStack(world, i32(u.maskCount + 0.5), u.masks, u.radius);\n' +
    '  let r = refineEdgeAt(world, f, u.radius, u.contrast, u.decon);\n' +
    '  let o = (id.y * W + id.x) * 4u;\n  outBuf[o] = r.x; outBuf[o + 1u] = r.y; outBuf[o + 2u] = r.z; outBuf[o + 3u] = r.w;\n}\n';
  const results = {};
  for (const [name, sc] of Object.entries(REFINE_SCENES)) {
    const block = new Float32Array(8 + MASK_BLOCK_FLOATS);
    const count = packMaskSlots(sc.masks, block, 8);
    block.set([count, W, H, sc.soft, sc.radius, sc.contrast, sc.decon, 0], 0);
    const r = await runGrid(device, code, block, W, H, 4);
    if (r.compileErrors) return { compileErrors: r.compileErrors };
    const img = discJs(sc.soft);
    let maxErr = 0, bad = 0, changed = 0, ambiguous = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const f = maskStackField(block, 8, count, x + 0.5, y + 0.5, sc.radius);
      const c = refineEdgeAt(x + 0.5, y + 0.5, f, { radius: sc.radius, contrast: sc.contrast, decontaminate: sc.decon }, img);
      if (Math.abs(c.alpha - f.alpha) > 0.2) changed++;
      if (nearFreeformEdge(block.subarray(4), count, x + 0.5, y + 0.5, 0.05)) { ambiguous++; continue; }
      const e = Math.max(Math.abs(r.out[o] - c.alpha), Math.abs(r.out[o + 1] - c.delta[0]), Math.abs(r.out[o + 2] - c.delta[1]), Math.abs(r.out[o + 3] - c.delta[2]));
      if (e > 0.01) bad++;
      else if (e > maxErr) maxErr = e;
    }
    results[name] = { maxErr, bad, changed, ambiguous };
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
  const maskModules = modules.filter((x) => x.code.includes('mask_freeformEval')).length;
  const device = r.offscreenGpu.device;
  const out = { modules: modules.length, maskModules, compileErrors, scenes: {} };

  const comp = createComposition('t', { width: W, height: H, frameRate: 30, durationFrames: 30, backgroundColor: [0, 0, 0, 1] });
  // The renderer paints comp.background (a solid layer, default dark slate), not settings.backgroundColor:
  // make it truly black so uncovered pixels read 0 and (R + B) / 255 reads a red/blue layer's alpha.
  for (const l of comp.background.layers) for (const st of l.stops) st.color = [0, 0, 0];
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
  // bg: the comp background under uncovered pixels - sampled at (1, 1) unless given (a stack that
  // starts full covers that corner); border: skip the shape layer's own anti-aliased canvas edge.
  const coverageCompare = (px, frame, ch = 0, bg = null, border = 0) => {
    const block = new Float32Array(MASK_BLOCK_FLOATS);
    const count = packMaskSlots(frame.layers[0].masks, block, 0);
    const bgPx = bg ?? at(px, 1, 1);
    const fg = 255;
    let maxErr = 0, ambiguous = 0, inside = 0, worst = null;
    for (let y = border; y < H - border; y++) for (let x = border; x < W - border; x++) {
      const cov = maskStackCoverage(block, 0, count, x + 0.5, y + 0.5);
      if (cov > 0.99) inside++;
      const expect = bgPx[ch] + (fg - bgPx[ch]) * cov;
      const e = Math.abs(px[(y * W + x) * 4 + ch] - expect);
      if (e > 4) {
        let near = false;
        for (let i = 0; i < count;) { const o = i * MASK_SLOT_FLOATS; if (Math.round(block[o]) === FREEFORM_MASK_TYPE) { if (Math.abs(freeformCoverage(block, o, x + 0.5, y + 0.5).signedDist) < 0.75) near = true; i += block[o + 10]; } else i++; }
        if (near) { ambiguous++; continue; }
      }
      if (e > maxErr) { maxErr = e; worst = [x, y, px[(y * W + x) * 4 + ch], Math.round(expect)]; }
    }
    // On failure, attach the 5x5 neighbourhood of the worst pixel as got/want pairs.
    if (worst && maxErr > 4) {
      const [wx, wy] = worst;
      const win = [];
      for (let dy = -2; dy <= 2; dy++) { const row = []; for (let dx = -2; dx <= 2; dx++) { const X = wx + dx, Y = wy + dy; row.push(px[(Y * W + X) * 4 + ch] + '/' + Math.round(bgPx[ch] + (fg - bgPx[ch]) * maskStackCoverage(block, 0, count, X + 0.5, Y + 0.5))); } win.push(row.join('  ')); }
      worst.push(win);
    }
    return { maxErr, ambiguous, inside, worst, bg: bgPx, center: at(px, 160, 110) };
  };
  const tri = [cv(60, 160), cv(160, 20), cv(270, 150)];
  const red = () => createRectangleLayer('r', W / 2, H / 2, W, H, [1, 0, 0, 1], 30);

  await scene('shape + triangle path mask', [Object.assign(red(), { masks: [pathMaskFor(tri)] })], coverageCompare);
  await scene('shape + bezier blob, rotated, per-vertex feather', [Object.assign(red(), {
    masks: [Object.assign(pathMaskFor(wavy(8).map((v) => ({ ...v, position: [160 + v.position[0] * 200, 90 + v.position[1] * 140], handleIn: [v.handleIn[0] * 200, v.handleIn[1] * 140], handleOut: [v.handleOut[0] * 200, v.handleOut[1] * 140] }))), { feathers: [0, 6, 12, 6, 0, 6, 12, 6] })],
  })], coverageCompare);
  await scene('shape + inverted path mask + rect mask stack', [Object.assign(red(), {
    // New masks default to Add (B10e); the rect is pinned to Intersect so this stays the legacy product.
    masks: [Object.assign(pathMaskFor(tri), { inverted: true }), Object.assign(createMask('rectangle', 160, 90, 280, 150), { mode: 'intersect' })],
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
  // ── B10e: mask modes + expansion through the real shape pipeline ──
  const mk = (type, cx, cy, w, h, o = {}) => {
    const m = createMask(type, cx, cy, w, h);
    if (o.mode) m.mode = o.mode;
    if (o.inverted) m.inverted = true;
    m.feather = { ...m.feather, defaultValue: o.feather ?? 0 };
    m.expansion = { ...m.expansion, defaultValue: o.expansion ?? 0 };
    return m;
  };
  await scene('B10e shape: add ellipse + feathered subtract rect (expanded) + difference ellipse', [Object.assign(red(), {
    masks: [
      mk('ellipse', 140, 90, 220, 140, { mode: 'add', feather: 2 }),
      mk('rectangle', 190, 70, 90, 60, { mode: 'subtract', feather: 3, expansion: 6 }),
      mk('ellipse', 230, 120, 110, 90, { mode: 'difference', feather: 1 }),
    ],
  })], coverageCompare);
  await scene('B10e shape: lone subtract path mask (starts full) choked by -8 px', [Object.assign(red(), {
    masks: [Object.assign(pathMaskFor(tri), { mode: 'subtract', expansion: { ...createMask('rectangle', 0, 0, 1, 1).expansion, defaultValue: -8 } })],
  })], (px, frame) => coverageCompare(px, frame, 0, [0, 0, 0], 2));

  // ── B10e: Refine Edge on the REAL image pipeline ──
  {
    const c = new OffscreenCanvas(W, H);
    const g = c.getContext('2d');
    g.fillStyle = '#0000ff';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#ff0000';
    g.beginPath();
    g.arc(160, 90, 50, 0, Math.PI * 2);
    g.fill();
    const src = g.getImageData(0, 0, W, H).data;
    const bmp = await createImageBitmap(c);
    const orig = mediaAssetManager.getImageBitmap.bind(mediaAssetManager);
    mediaAssetManager.getImageBitmap = (id) => (id === 'gpu-refine-img' ? bmp : orig(id));
    // The renderer's sampler (bilinear, clamp-to-edge) over the same pixels; the quad maps comp px 1:1.
    const texel = (ix, iy, ch) => src[(Math.min(H - 1, Math.max(0, iy)) * W + Math.min(W - 1, Math.max(0, ix))) * 4 + ch] / 255;
    const sample = (x, y) => {
      const fx = x - 0.5, fy = y - 0.5;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      return [0, 1, 2].map((ch) => (texel(x0, y0, ch) * (1 - tx) + texel(x0 + 1, y0, ch) * tx) * (1 - ty) + (texel(x0, y0 + 1, ch) * (1 - tx) + texel(x0 + 1, y0 + 1, ch) * tx) * ty);
    };
    const circleAt = (cx, cy, rad) => circle().map((v) => ({
      ...v,
      position: [cx + v.position[0] * 2 * rad, cy + v.position[1] * 2 * rad],
      handleIn: [v.handleIn[0] * 2 * rad, v.handleIn[1] * 2 * rad],
      handleOut: [v.handleOut[0] * 2 * rad, v.handleOut[1] * 2 * rad],
    }));
    const run = async (refineEdge) => {
      const img = createImageLayer('img', W / 2, H / 2, 'gpu-refine-img', W, H, 'png', 0, 30);
      img.masks = [pathMaskFor(circleAt(160, 90, 56))]; // a rough roto 6 px too big
      if (refineEdge) img.refineEdge = refineEdge;
      comp.layers = [img];
      const frame = resolveFrame(comp, 0);
      device.pushErrorScope('validation');
      await r.renderFrameAsync(frame, 'offscreen');
      const err = await device.popErrorScope();
      return { frame, px: await readPixels(r, W, H), err: err ? err.message : null };
    };
    const plain = await run(null);
    const refined = await run({ enabled: true, radius: 10, contrast: 0, decontaminate: 0 });
    const decon = await run({ enabled: true, radius: 10, contrast: 0, decontaminate: 1 });
    // Alpha read back: footage is red/blue (r + b = 255) composited over black, so (R + B) / 255 = alpha.
    const block = new Float32Array(MASK_BLOCK_FLOATS);
    const count = packMaskSlots(refined.frame.layers[0].masks, block, 0);
    let maxErr = 0, ambiguous = 0, inBand = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const f = maskStackField(block, 0, count, x + 0.5, y + 0.5, 10);
      if (Math.abs(f.sd) < 10) inBand++;
      const want = refineEdgeAt(x + 0.5, y + 0.5, f, { radius: 10, contrast: 0, decontaminate: 0 }, sample).alpha;
      const i = (y * W + x) * 4;
      const got = (refined.px[i] + refined.px[i + 2]) / 255;
      const e = Math.abs(got - want);
      if (e > 0.035 && Math.abs(freeformCoverage(block, 0, x + 0.5, y + 0.5).signedDist) < 0.75) { ambiguous++; continue; }
      if (e > maxErr) maxErr = e;
    }
    const ring = (px, lo, hi) => {
      let red = 0, blue = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d = Math.hypot(x + 0.5 - 160, y + 0.5 - 90);
        if (d >= lo && d <= hi) { red += px[(y * W + x) * 4]; blue += px[(y * W + x) * 4 + 2]; }
      }
      return { red, blue };
    };
    const probe = (px, rad) => [0, 1.3, 2.6, 4.2].map((a) => at(px, Math.round(160 + rad * Math.cos(a) - 0.5), Math.round(90 + rad * Math.sin(a) - 0.5)));
    out.refine = {
      errors: [plain.err, refined.err, decon.err].filter(Boolean),
      maxErr, ambiguous, inBand,
      refineUniform: refined.frame.layers[0].refineEdge ?? null,
      plainOutside: probe(plain.px, 53.5), refinedOutside: probe(refined.px, 53.5), refinedInside: probe(refined.px, 46.5),
      ringPlain: ring(plain.px, 48.5, 51.5), ringRefined: ring(refined.px, 48.5, 51.5), ringDecon: ring(decon.px, 48.5, 51.5),
    };
    mediaAssetManager.getImageBitmap = orig;
  }
  r.destroy();
  return out;
}

window.__maskGpu = async () => {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) return { noAdapter: true };
  const device = await adapter.requestDevice();
  const parity = await shaderParity(device);
  const field = await fieldParity(device);
  const refine = await refineParity(device);
  device.destroy();
  const renderer = await rendererIntegration();
  return { parity, field, refine, renderer };
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

// ── 5. B10e: the REAL Inspector Masks tab (mode / expansion / Refine Edge), genuine mouse + keys ──
const INSPECTOR_ENTRY = String.raw`
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Inspector } from '@/ui/panels/Inspector';
import { useEditorStore } from '@/store/editor';
import { useMaskStore } from '@/store/mask';
import { useHistoryStore } from '@/store/history';
import { createImageLayer, createRectangleLayer, createMask } from '@/core/factory';

document.body.style.margin = '0';

const find = (sel, pred) => Array.from(document.querySelectorAll(sel)).find(pred) ?? null;
const rectOf = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
// A DragInput's clickable value box: the row whose label (DragInput's own span, or a row <label>)
// reads 'label', then its value div.
const dragBox = (label) => {
  const span = find('span, label', (s) => s.textContent.trim() === label && s.className.includes('w-14'));
  return span ? span.parentElement.querySelector('div.cursor-ew-resize') : null;
};

window.__insp = {
  setup() {
    const st = useEditorStore.getState();
    const img = createImageLayer('img', 960, 540, 'asset-x', 1920, 1080, 'png', 0, 150);
    const a = createMask('ellipse', 960, 540, 600, 400);
    const legacy = createMask('rectangle', 960, 540, 800, 500);
    delete legacy.mode;
    delete legacy.expansion;
    img.masks = [a, legacy];
    const shape = createRectangleLayer('r', 960, 540, 400, 300, [1, 0, 0, 1], 150);
    shape.masks = [createMask('ellipse', 960, 540, 300, 200)];
    useEditorStore.setState({ composition: { ...st.composition, layers: [img, shape] } });
    useEditorStore.getState().selectLayer(img.id, false, 'canvas');
    const host = document.createElement('div');
    host.style.cssText = 'position:relative;width:360px;';
    document.body.appendChild(host);
    createRoot(host).render(React.createElement(Inspector));
    window.__ids = { img: img.id, shape: shape.id, a: a.id, legacy: legacy.id, shapeMask: shape.masks[0].id };
    return window.__ids;
  },
  openMasksTab() {
    const b = find('button', (x) => x.title === 'Masks' || x.textContent.trim() === 'Masks');
    if (b) b.click();
    return !!b;
  },
  selectMask(key) { useMaskStore.getState().setSelectedMaskId(window.__ids[key]); },
  selectLayer(key) { useEditorStore.getState().selectLayer(window.__ids[key], false, 'canvas'); },
  modeSelect() {
    const s = find('select', (x) => Array.from(x.options).some((o) => o.value === 'difference'));
    return s ? { value: s.value, options: Array.from(s.options).map((o) => o.value) } : null;
  },
  setMode(v) {
    const s = find('select', (x) => Array.from(x.options).some((o) => o.value === 'difference'));
    s.value = v;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  },
  boxAt(label) { return rectOf(dragBox(label)); },
  inputAt() { return rectOf(document.querySelector('input[data-scrubby="true"]')); },
  refineToggle() {
    const label = find('label', (l) => l.textContent.trim() === 'Refine Edge');
    if (!label) return null;
    const btn = label.parentElement.querySelector('button');
    return { text: btn.textContent.trim(), at: rectOf(btn) };
  },
  rowTags() { return Array.from(document.querySelectorAll('span[title="Mask mode"]')).map((s) => s.textContent); },
  undo() { useHistoryStore.getState().undo(); },
  state() {
    const comp = useEditorStore.getState().composition;
    const img = comp.layers.find((l) => l.id === window.__ids.img);
    const m = (id) => img.masks.find((x) => x.id === id);
    const pick = (x) => ({ mode: x.mode ?? null, expansion: x.expansion ? { v: x.expansion.defaultValue, keys: x.expansion.keyframes.length } : null });
    return {
      a: pick(m(window.__ids.a)), legacy: pick(m(window.__ids.legacy)),
      refine: img.refineEdge ?? null,
      history: useHistoryStore.getState().undoStack.map((c) => c.label),
      hasRefineUi: !!find('label', (l) => l.textContent.trim() === 'Refine Edge'),
    };
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
  const { parity, field, refine, renderer } = value;

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

  // ── B10e: the combined field (sd + normal) and the Refine Edge WGSL vs their CPU twins ──
  check('B10e: computeMaskStack(field) + refineEdgeAt compile as shipped', () => {
    assert.ok(!field.compileErrors, `field WGSL errors: ${JSON.stringify(field.compileErrors)}`);
    assert.ok(!refine.compileErrors, `refine WGSL errors: ${JSON.stringify(refine.compileErrors)}`);
  });
  for (const [name, r] of Object.entries(field.results)) {
    check(`B10e field GPU == CPU: ${name} (alpha err ${r.alphaErr.toFixed(4)}, sd err ${r.sdErr.toFixed(4)} px, ${r.normalMismatch}/${r.edges} normals off, ${r.ambiguous} edge px)`, () => {
      assert.ok(r.alphaErr < 0.02, `alpha ${r.alphaErr}`);
      assert.ok(r.sdErr < 0.05, `signed distance ${r.sdErr}`);
      assert.ok(r.normalMismatch <= r.edges * 0.005, `${r.normalMismatch} normals disagree`);
      assert.ok(r.ambiguous < 60);
    });
  }
  for (const [name, r] of Object.entries(refine.results)) {
    check(`B10e refine GPU == CPU: ${name} (max err ${r.maxErr.toFixed(4)}, ${r.bad} px off, ${r.changed} px refined, ${r.ambiguous} edge px)`, () => {
      assert.ok(r.maxErr <= 0.01, `max err ${r.maxErr}`);
      assert.ok(r.bad <= 24, `${r.bad} pixels beyond tolerance`);
      assert.ok(r.changed > 100, `refine changed only ${r.changed} pixels`);
    });
  }

  check(`real WebGPURenderer: all ${renderer.modules} shader modules compile (mask WGSL in ${renderer.maskModules})`, () => {
    assert.ok(!renderer.initFailed, 'offscreen init failed');
    assert.deepEqual(renderer.compileErrors, []);
    assert.ok(renderer.maskModules >= 4, `mask WGSL reached ${renderer.maskModules} pipelines`);
  });
  for (const name of ['shape + triangle path mask', 'shape + bezier blob, rotated, per-vertex feather', 'shape + inverted path mask + rect mask stack', 'animated path mask, mid-morph', 'image + path mask', 'B10e shape: add ellipse + feathered subtract rect (expanded) + difference ellipse', 'B10e shape: lone subtract path mask (starts full) choked by -8 px']) {
    const s = renderer.scenes[name];
    check(`real render: ${name} matches CPU coverage (max err ${s.maxErr.toFixed(1)}/255, ${s.ambiguous} edge px, ${s.inside} px inside)`, () => {
      assert.equal(s.validationError, null);
      assert.ok(s.maxErr <= 4, `max channel error ${s.maxErr} at [x, y, got, want] ${JSON.stringify(s.worst)}, bg ${s.bg}`);
      assert.ok(s.ambiguous < 200, `${s.ambiguous} ambiguous edge pixels`);
      assert.ok(s.inside > 500, 'mask encloses real area');
    });
  }
  check('real render: the mid-morph outline is the vertex-for-vertex interpolation (edge at x = 80)', () => {
    const s = renderer.scenes['animated path mask, mid-morph'];
    assert.ok(s.left78[0] < 60 && s.left82[0] > 200, `left edge between 78 and 82: ${s.left78} / ${s.left82}`);
  });
  check(`B10e real render: Refine Edge on the image pipeline matches the CPU twin (max alpha err ${renderer.refine.maxErr.toFixed(3)}, ${renderer.refine.ambiguous} edge px, ${renderer.refine.inBand} px in band)`, () => {
    const R = renderer.refine;
    assert.deepEqual(R.errors, []);
    assert.deepEqual(R.refineUniform, { enabled: true, radius: 10, contrast: 0, decontaminate: 0 });
    assert.ok(R.maxErr <= 0.035, `alpha err ${R.maxErr}`);
    assert.ok(R.ambiguous < 40, `${R.ambiguous} ambiguous`);
    assert.ok(R.inBand > 2000, 'a real band was refined');
  });
  check('B10e real render: the too-big roto snaps to the footage edge (background inside the roto cut away, subject kept)', () => {
    const R = renderer.refine;
    for (const p of R.plainOutside) assert.ok(p[2] > 200 && p[0] < 30, `plain roto shows the blue background inside it: ${p}`);
    for (const p of R.refinedOutside) assert.ok(p[0] + p[2] < 20, `refined: background removed: ${p}`);
    for (const p of R.refinedInside) assert.ok(p[0] > 225 && p[2] < 25, `refined: subject kept: ${p}`);
  });
  check('B10e real render: decontamination strips the blue fringe from the edge ring (and keeps the red)', () => {
    const R = renderer.refine;
    assert.ok(R.ringRefined.blue > 2000, `the refined edge ring has a blue fringe to remove (${R.ringRefined.blue})`);
    assert.ok(R.ringDecon.blue < R.ringRefined.blue * 0.3, `blue ${R.ringRefined.blue} -> ${R.ringDecon.blue}`);
    assert.ok(R.ringDecon.red > R.ringRefined.red, `red ${R.ringRefined.red} -> ${R.ringDecon.red}`);
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

  // ── 5. B10e: the REAL Inspector Masks tab, genuine mouse + keyboard ──
  const inspDir = join(dir, 'insp');
  mkdirSync(inspDir);
  await bundleEntry(INSPECTOR_ENTRY, inspDir);
  const insp = await withHeadlessPage({ dir: inspDir }, async (page) => {
    const ev = (expr) => page.evaluate(expr);
    const mouse = (type, x, y, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
    const click = async (p) => {
      await mouse('mouseMoved', p.x, p.y, { buttons: 0, button: 'none' });
      await mouse('mousePressed', p.x, p.y);
      await mouse('mouseReleased', p.x, p.y);
    };
    const settle = () => ev('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
    const key = (k, code) => ['keyDown', 'keyUp'].reduce((p, type) => p.then(() => page.send('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code })), Promise.resolve());
    // Click a DragInput (no drag = manual entry), type over the selected value, Enter.
    // A tall viewport so the whole (unstyled, unscrolled) Inspector is on screen for real clicks.
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 2400, deviceScaleFactor: 1, mobile: false });
    const editBox = async (label, text) => {
      const at = await ev(`window.__insp.boxAt(${JSON.stringify(label)})`);
      if (!at) throw new Error(`no ${label} input`);
      await click(at);
      await settle();
      await page.send('Input.insertText', { text });
      await key('Enter', 13);
      await settle();
    };
    await ev(`(async () => { await import('/bundle.js'); return window.__insp.setup(); })()`);
    await settle();
    const r = {};
    r.tab = await ev('window.__insp.openMasksTab()');
    await settle();
    await ev("window.__insp.selectMask('legacy')");
    await settle();
    r.legacyMode = await ev('window.__insp.modeSelect()');
    r.tags = await ev('window.__insp.rowTags()');
    await ev("window.__insp.setMode('subtract')");
    await settle();
    r.afterMode = await ev('window.__insp.state()');
    r.tagsAfter = await ev('window.__insp.rowTags()');
    await editBox('Expand', '-6');
    r.afterExpand1 = await ev('window.__insp.state()');
    await editBox('Expand', '4');
    r.afterExpand2 = await ev('window.__insp.state()');
    r.toggle0 = await ev('window.__insp.refineToggle()');
    await click(r.toggle0.at);
    await settle();
    r.afterRefineOn = await ev('window.__insp.state()');
    // Drag the Radius box +60 px: a live scrub that lands as ONE undo entry.
    const rb = await ev("window.__insp.boxAt('Radius')");
    r.radiusBox = !!rb;
    if (rb) {
      await mouse('mouseMoved', rb.x, rb.y, { buttons: 0, button: 'none' });
      await mouse('mousePressed', rb.x, rb.y);
      for (let k = 1; k <= 6; k++) await mouse('mouseMoved', rb.x + k * 10, rb.y);
      await mouse('mouseReleased', rb.x + 60, rb.y);
      await settle();
    }
    r.afterDrag = await ev('window.__insp.state()');
    r.toggle1 = await ev('window.__insp.refineToggle()');
    await click(r.toggle1.at);
    await settle();
    r.afterRefineOff = await ev('window.__insp.state()');
    await ev('window.__insp.undo()');
    await settle();
    r.afterUndo = await ev('window.__insp.state()');
    await ev("window.__insp.selectLayer('shape')");
    await settle();
    await ev('window.__insp.openMasksTab()');
    await ev("window.__insp.selectMask('shapeMask')");
    await settle();
    r.shape = await ev('window.__insp.state()');
    r.shapeMode = await ev('window.__insp.modeSelect()');
    r.logs = page.logs.filter((l) => /^(error|exception)/.test(l));
    return r;
  });

  check('B10e UI: the Inspector Masks tab shows each mask\'s mode (legacy = Intersect) and the six AE modes', () => {
    assert.equal(insp.tab, true);
    assert.deepEqual(insp.legacyMode.options, ['add', 'subtract', 'intersect', 'lighten', 'darken', 'difference']);
    assert.equal(insp.legacyMode.value, 'intersect');
    assert.deepEqual(insp.tags, ['Add', 'Intersect']);
  });
  check('B10e UI: changing the Mode select stores it on the mask (one undo step) and retags the row', () => {
    assert.equal(insp.afterMode.legacy.mode, 'subtract');
    assert.equal(insp.afterMode.a.mode, 'add', 'only the selected mask changes');
    assert.equal(insp.afterMode.history.at(-1), 'Update Mask');
    assert.deepEqual(insp.tagsAfter, ['Add', 'Subtract']);
  });
  check('B10e UI: typing into Expand on a pre-B10e mask creates its expansion property, then edits it', () => {
    assert.deepEqual(insp.afterExpand1.legacy.expansion, { v: -6, keys: 0 });
    assert.equal(insp.afterExpand1.history.at(-1), 'Mask Expansion');
    assert.deepEqual(insp.afterExpand2.legacy.expansion, { v: 4, keys: 0 });
    assert.equal(insp.afterExpand2.history.at(-1), 'Update Mask');
  });
  check('B10e UI: the Refine Edge toggle turns it on with the defaults (undoable)', () => {
    assert.equal(insp.toggle0.text, 'Off');
    assert.deepEqual(insp.afterRefineOn.refine, { enabled: true, radius: 8, contrast: 0.25, decontaminate: 0.5 });
    assert.equal(insp.afterRefineOn.history.at(-1), 'Refine Edge');
  });
  check('B10e UI: dragging Radius scrubs it live and commits ONE undo entry; Off keeps the settings; undo restores On', () => {
    assert.equal(insp.radiusBox, true, 'Radius control shown while on');
    const rad = insp.afterDrag.refine.radius;
    assert.ok(rad > 12 && rad <= 64, `radius scrubbed up (${rad})`);
    assert.equal(insp.afterDrag.history.length, insp.afterRefineOn.history.length + 1, 'one entry for the whole drag');
    assert.equal(insp.toggle1.text, 'On');
    assert.equal(insp.afterRefineOff.refine.enabled, false);
    assert.equal(insp.afterRefineOff.refine.radius, rad, 'settings kept while off');
    assert.equal(insp.afterUndo.refine.enabled, true);
  });
  check('B10e UI: Refine Edge is offered only on image / video layers (not on a masked shape)', () => {
    assert.equal(insp.afterRefineOn.hasRefineUi, true);
    assert.equal(insp.shape.hasRefineUi, false);
    assert.ok(insp.shapeMode, 'the shape layer still gets the Mode select');
  });
  check('B10e UI: no React / runtime errors logged by the Inspector', () => {
    assert.deepEqual(insp.logs, []);
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
