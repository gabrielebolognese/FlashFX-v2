// GPU harness for adjustment layers (B11b-gpu) + the layer-Blur fixes that landed with them. Runs in
// headless Chrome with WebGPU (see scripts/lib/headless-gpu.mjs) - NOT part of `npm test` (CI has no
// GPU); run locally:
//   node scripts/gpu-verify-adjustment.mjs   (or: npm run gpu:adjustment)
//
// Proves on the real GPU, with the REAL WebGPURenderer:
//  1. Every shader module compiles (incl. the adjustment variant of the image shader).
//  2. The apply-below pass matches its CPU twin (core/effects/adjustmentComposite) pixel for pixel over
//     a real rendered composite: basic filters, a colour effect at partial opacity, a feathered mask, a
//     warp effect (runs in composition space on the copy), layers ABOVE untouched, stacked adjustments,
//     no-op / bottom adjustments byte-identical, the split plan (Blur, Glow, Blur + mask) and an
//     adjustment inside a precomp; plus the shipping pipeline run directly on a premultiplied alpha 0..1
//     strip (every real composite is opaque): alpha preserved, colour effects on straight colour.
//  3. The layer Blur now reaches the object and every blur type reads the right uniforms: gaussian,
//     directional, radial and kawase each match a CPU twin of BLUR_EFFECT_SHADER (and the pre-batch
//     renderer is shown to have left the object sharp).
//  4. Frames without an active adjustment or a layer Blur render BYTE-IDENTICALLY to the pre-batch
//     renderer (pinned commit below, bundled side by side).
//  5. The REAL Inspector on the real stores, genuine mouse + keyboard: an adjustment layer's Filters tab
//     (Saturation slider, a searched Invert effect, a Gaussian Blur wire filter) drives the store, and the
//     store's composition renders the expected pixels; the Effects tab hides the styles that need a
//     layer silhouette.

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bundleEntry, findChrome, makeTempDir, runInHeadlessChrome, withHeadlessPage, ROOT } from './lib/headless-gpu.mjs';

// The last commit before B11b-gpu touched the renderer: frames that must be unchanged are compared with it.
const BASELINE_COMMIT = 'b6d82b9';
const fwd = (p) => p.replace(/\\/g, '/').replace(/\/$/, '');
const ROOT_F = fwd(ROOT);

// Shared page-side helpers (CPU twins of the blur / glow shaders, sampling, comparison).
const PAGE_LIB = String.raw`
const W = 320, H = 180;
const q8 = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255) / 255;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
// Float RGBA image (0..1) from 8-bit readback.
const toF = (px) => { const f = new Float32Array(px.length); for (let i = 0; i < px.length; i++) f[i] = px[i] / 255; return f; };
const quant = (img) => { const o = new Float32Array(img.length); for (let i = 0; i < img.length; i++) o[i] = q8(img[i]); return o; };
const texel = (img, x, y) => { const i = (y * W + x) * 4; return [img[i], img[i + 1], img[i + 2], img[i + 3]]; };
// Bilinear sample at a pixel-space point (texel centres at +0.5), clamp-to-edge - the layer sampler.
const sampleAt = (img, px, py) => {
  const fx = px - 0.5, fy = py - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const cx = (v) => Math.min(W - 1, Math.max(0, v)), cy = (v) => Math.min(H - 1, Math.max(0, v));
  const o = [0, 0, 0, 0];
  const taps = [[x0, y0, (1 - tx) * (1 - ty)], [x0 + 1, y0, tx * (1 - ty)], [x0, y0 + 1, (1 - tx) * ty], [x0 + 1, y0 + 1, tx * ty]];
  for (const [xx, yy, w] of taps) { const i = (cy(yy) * W + cx(xx)) * 4; for (let c = 0; c < 4; c++) o[c] += img[i + c] * w; }
  return o;
};
const mapImg = (fn) => { const o = new Float32Array(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = fn(x, y); const i = (y * W + x) * 4; o[i] = v[0]; o[i + 1] = v[1]; o[i + 2] = v[2]; o[i + 3] = v[3]; } return o; };
const gw = (x, s) => Math.exp(-0.5 * (x * x) / (s * s));
// BLUR_EFFECT_SHADER gaussian H / V (TAPS 15, sigma max(r / 2, 1)); radius < 0.5 copies.
const gaussPass = (img, r, horiz, taps = 15, sigmaMin = 1) => {
  if (r < 0.5) return quant(img);
  const sigma = Math.max(r * 0.5, sigmaMin), step = r / taps;
  return quant(mapImg((x, y) => {
    const acc = [0, 0, 0, 0]; let ws = 0;
    for (let i = -taps; i <= taps; i++) {
      const w = gw(i * step, sigma);
      const s = horiz ? sampleAt(img, x + 0.5 + i * step, y + 0.5) : sampleAt(img, x + 0.5, y + 0.5 + i * step);
      for (let c = 0; c < 4; c++) acc[c] += s[c] * w; ws += w;
    }
    return acc.map((v) => v / ws);
  }));
};
const gaussian = (img, r) => gaussPass(gaussPass(img, r, true), r, false);
const directional = (img, strength, angleDeg) => {
  if (strength < 0.5) return quant(img);
  const a = angleDeg * Math.PI / 180, dx = Math.cos(a) * strength, dy = Math.sin(a) * strength;
  return quant(mapImg((x, y) => {
    const acc = [0, 0, 0, 0];
    for (let i = -15; i <= 15; i++) { const s = sampleAt(img, x + 0.5 + dx * i / 15, y + 0.5 + dy * i / 15); for (let c = 0; c < 4; c++) acc[c] += s[c]; }
    return acc.map((v) => v / 31);
  }));
};
const radial = (img, strength, cxN, cyN) => {
  if (strength < 0.001) return quant(img);
  return quant(mapImg((x, y) => {
    const u = (x + 0.5) / W, v = (y + 0.5) / H;
    const sx = (u - cxN) * strength * 0.01 / 15, sy = (v - cyN) * strength * 0.01 / 15;
    const acc = [0, 0, 0, 0];
    for (let i = -15; i <= 15; i++) { const s = sampleAt(img, (u + sx * i) * W, (v + sy * i) * H); for (let c = 0; c < 4; c++) acc[c] += s[c]; }
    return acc.map((t) => t / 31);
  }));
};
const kawase = (img, passes) => {
  let cur = img;
  for (let p = 0; p < passes; p++) {
    const off = p + 1 + 0.5;
    const src = cur;
    cur = quant(mapImg((x, y) => {
      const acc = [0, 0, 0, 0];
      for (const [ox, oy] of [[-off, -off], [off, -off], [-off, off], [off, off]]) { const s = sampleAt(src, x + 0.5 + ox, y + 0.5 + oy); for (let c = 0; c < 4; c++) acc[c] += s[c]; }
      return acc.map((t) => t / 4);
    }));
  }
  return cur;
};
// GLOW_SHADER image mode over layerTex: extract (smoothstep luma threshold), H / V blur (TAPS 20,
// sigma max(r / 2, 0.5)), V output rgb * intensity * colour added (alpha 0) onto layerTex.
const imageGlowOnto = (base, glow) => {
  const extract = quant(mapImg((x, y) => {
    const c = texel(base, x, y);
    const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const t = clamp01((lum - glow.threshold) / 0.1), f = t * t * (3 - 2 * t);
    return [c[0] * f, c[1] * f, c[2] * f, c[3] * f];
  }));
  const blurred = gaussPass(gaussPass(extract, glow.radius, true, 20, 0.5), glow.radius, false, 20, 0.5);
  return quant(mapImg((x, y) => {
    const b = texel(base, x, y), g = texel(blurred, x, y);
    return [b[0] + g[0] * glow.intensity * glow.color[0], b[1] + g[1] * glow.intensity * glow.color[1], b[2] + g[2] * glow.intensity * glow.color[2], b[3]];
  }));
};
// Max abs channel error (0..255) of an 8-bit readback vs an expected float image or fn(x, y) -> rgb(a).
const compareTo = (px, expect, { channels = 3, border = 0, skip = null } = {}) => {
  let maxErr = 0, worst = null, n = 0;
  for (let y = border; y < H - border; y++) for (let x = border; x < W - border; x++) {
    if (skip && skip(x, y)) continue;
    const e = typeof expect === 'function' ? expect(x, y) : texel(expect, x, y);
    const i = (y * W + x) * 4;
    for (let c = 0; c < channels; c++) { const d = Math.abs(px[i + c] - e[c] * 255); if (d > maxErr) { maxErr = d; worst = [x, y, c, px[i + c], Math.round(e[c] * 255)]; } }
    n++;
  }
  return { maxErr: Math.round(maxErr * 100) / 100, worst, n };
};
const diffPx = (a, b) => { let m = 0, at = -1; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > m) { m = d; at = i; } } return { max: m, at: at < 0 ? null : [((at / 4) | 0) % W, ((at / 4) / W) | 0, at % 4] }; };
async function readPixels(r) {
  const c2 = new OffscreenCanvas(W, H);
  const g = c2.getContext('2d');
  g.drawImage(r.getOffscreenCanvas(), 0, 0);
  return g.getImageData(0, 0, W, H).data;
}
// The test footage: hue gradient, bright squares, dark bars and a yellow disc (structure for blur / glow).
async function makeBitmap(alpha) {
  const c = new OffscreenCanvas(W, H);
  const g = c.getContext('2d');
  if (alpha < 1) {
    g.fillStyle = 'rgba(255, 64, 0, ' + alpha + ')';
    g.fillRect(0, 0, W, H);
    return createImageBitmap(c);
  }
  const grad = g.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#ff3010'); grad.addColorStop(0.5, '#20c060'); grad.addColorStop(1, '#3040ff');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.fillStyle = '#000000'; for (let x = 0; x < W; x += 40) g.fillRect(x + 20, 0, 6, H);
  g.fillStyle = '#ffffff'; g.fillRect(40, 30, 30, 30); g.fillRect(250, 120, 20, 40);
  g.fillStyle = '#ffff00'; g.beginPath(); g.arc(160, 90, 25, 0, Math.PI * 2); g.fill();
  return createImageBitmap(c);
}
const blackBackground = (comp) => { for (const l of comp.background.layers) for (const st of l.stops) st.color = [0, 0, 0]; return comp; };
`;

const RENDER_ENTRY = (baselinePath) => String.raw`
import { WebGPURenderer } from '@/engine/renderer';
${baselinePath ? `import { WebGPURenderer as BaselineRenderer } from '${baselinePath}';` : 'const BaselineRenderer = null;'}
import { resolveFrame } from '@/core/interpolation';
import { createComposition, createRectangleLayer, createCircleLayer, createImageLayer, createAdjustmentLayer, createMask, createPrecompLayer } from '@/core/factory';
import { mediaAssetManager } from '@/engine/media/assetManager';
import { EFFECT_TYPE } from '@/core/effects/effectRegistry';
import { adjustPixel, applyBasicFilters, IDENTITY_FILTERS } from '@/core/effects/adjustmentComposite';
import { packMaskSlots, maskStackCoverage, MASK_BLOCK_FLOATS } from '@/core/maskCoverage';
import { DEFAULT_BLUR, DEFAULT_GLOW, DEFAULT_SHADOW } from '@/core/effectDefaults';
${PAGE_LIB}

const INVERT = { type: EFFECT_TYPE.invert, enabled: true, params: [1] };
const inv = (c) => [1 - c[0], 1 - c[1], 1 - c[2], c[3]];
const filt = (f) => (c) => { const r = applyBasicFilters([c[0], c[1], c[2]], { ...IDENTITY_FILTERS, ...f }); return [clamp01(r[0]), clamp01(r[1]), clamp01(r[2]), c[3]]; };
const then = (a, b) => (c) => b(a(c));

async function initRenderer(Ctor, modules) {
  const r = new Ctor();
  const orig = GPUDevice.prototype.createShaderModule;
  if (modules) GPUDevice.prototype.createShaderModule = function (desc) { const m = orig.call(this, desc); modules.push({ m, code: desc.code }); return m; };
  let ok;
  try { ok = await r.initializeOffscreen(W, H); } finally { GPUDevice.prototype.createShaderModule = orig; }
  return ok ? r : null;
}

window.__adjGpu = async () => {
  if (!navigator.gpu || !(await navigator.gpu.requestAdapter())) return { noAdapter: true };
  const modules = [];
  const r = await initRenderer(WebGPURenderer, modules);
  if (!r) return { initFailed: true };
  const compileErrors = [];
  for (const { m } of modules) {
    const info = await m.getCompilationInfo();
    for (const msg of info.messages) if (msg.type === 'error') compileErrors.push(msg.message + ' (line ' + msg.lineNum + ')');
  }
  const out = { modules: modules.length, adjustModules: modules.filter((x) => x.code.includes('var belowTex')).length, compileErrors, adj: {}, blur: {}, identity: {}, info: {} };

  const imgBmp = await makeBitmap(1), halfBmp = await makeBitmap(0.5);
  const origGet = mediaAssetManager.getImageBitmap.bind(mediaAssetManager);
  mediaAssetManager.getImageBitmap = (id) => (id === 'adj-img' ? imgBmp : id === 'adj-half' ? halfBmp : origGet(id));

  const compOf = (layers, extra) => { const comp = blackBackground(createComposition('t', { width: W, height: H, frameRate: 30, durationFrames: 30, backgroundColor: [0, 0, 0, 1] })); comp.layers = layers; if (extra) extra(comp); return comp; };
  const img = (asset = 'adj-img') => createImageLayer('img', W / 2, H / 2, asset, W, H, 'png', 0, 30);
  const adj = (o = {}, opacity = 1) => { const a = Object.assign(createAdjustmentLayer('adj', 30), o); a.transform.opacity.defaultValue = opacity; return a; };
  const render = async (renderer, comp, ctx) => {
    const frame = resolveFrame(comp, 0, ctx);
    const dev = renderer.offscreenGpu.device;
    dev.pushErrorScope('validation');
    await renderer.renderFrameAsync(frame, 'offscreen');
    const err = await dev.popErrorScope();
    return { px: await readPixels(renderer), err: err ? err.message : null, frame };
  };

  // ── 2. adjustment pass vs the CPU twin, over the real rendered composite below ──
  const base = await render(r, compOf([img()]));
  const below = toF(base.px);
  const twin = (fx, k = () => 1) => (x, y) => adjustPixel(texel(below, x, y), k(x, y), fx);
  const scene = async (name, layers, expect, opts) => {
    const res = await render(r, compOf(layers));
    out.adj[name] = { err: res.err, ...compareTo(res.px, typeof expect === 'function' && expect.length === 1 ? expect(res) : expect, opts) };
    return res;
  };
  await scene('saturation -1 (basic filter)', [img(), adj({ filters: { saturation: -1 } })], twin(filt({ saturation: -1 })));
  await scene('invert effect at 60% opacity', [img(), adj({ effects: [INVERT] }, 0.6)], twin(inv, () => 0.6));
  {
    const m = createMask('ellipse', 160, 90, 180, 110); m.feather.defaultValue = 6;
    const res = await render(r, compOf([img(), adj({ effects: [INVERT], filters: { brightness: 0.1 }, masks: [m] })]));
    const block = new Float32Array(MASK_BLOCK_FLOATS);
    const count = packMaskSlots(res.frame.layers.find((l) => l.layerType === 'adjustment').masks, block, 0);
    const k = (x, y) => maskStackCoverage(block, 0, count, x + 0.5, y + 0.5);
    let inside = 0, outside = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = k(x, y); if (v > 0.99) inside++; else if (v < 0.01) outside++; }
    out.adj['invert + brightness inside a feathered ellipse mask'] = { err: res.err, ...compareTo(res.px, twin(then(filt({ brightness: 0.1 }), inv), k)), inside, outside };
  }
  {
    const rect = createRectangleLayer('top', 60, 40, 60, 40, [1, 0, 0, 1], 30);
    const res = await render(r, compOf([img(), adj({ effects: [INVERT] }), rect]));
    const inRect = (x, y) => x >= 33 && x <= 87 && y >= 23 && y <= 57;
    const nearRect = (x, y) => x >= 27 && x <= 93 && y >= 17 && y <= 63;
    out.adj['layer above the adjustment is untouched'] = {
      err: res.err,
      rect: compareTo(res.px, () => [1, 0, 0], { skip: (x, y) => !inRect(x, y) }),
      rest: compareTo(res.px, twin(inv), { skip: nearRect }),
    };
  }
  await scene('two stacked inverts = identity', [img(), adj({ effects: [INVERT] }), adj({ effects: [INVERT] })], below);
  await scene('empty adjustment (no-op) = byte-identical', [img(), adj()], below);
  await scene('adjustment at the bottom (nothing below) = byte-identical', [adj({ effects: [INVERT] }), img()], below);
  await scene('effects master switch off = byte-identical', [img(), adj({ effects: [INVERT], effectsEnabled: false })], below);
  // Pixelate 8 px: every pixel = the copy bilinearly sampled at its cell centre (comp space).
  await scene('warp effect (pixelate 8 px) runs in comp space on the copy', [img(), adj({ effects: [{ type: EFFECT_TYPE.pixelate, enabled: true, params: [8] }] })],
    (x, y) => sampleAt(below, (Math.floor((x + 0.5) / 8) + 0.5) * 8, (Math.floor((y + 0.5) / 8) + 0.5) * 8));
  // Split plan: the Blur / Glow run over the effected composite in layerTex, then the mix-only pass.
  await scene('split plan: gaussian Blur 8 px over everything below', [img(), adj({ blur: { ...DEFAULT_BLUR, radius: 8, strength: 0 } })], gaussian(quant(below), 8));
  {
    const glow = { ...DEFAULT_GLOW, mode: 'outer', intensity: 1.5, radius: 12, threshold: 0.6 }; // outer is forced to the image glow
    await scene('split plan: Glow (always the luminance glow) over everything below', [img(), adj({ glow })], imageGlowOnto(quant(below), glow));
  }
  {
    const m = createMask('ellipse', 160, 90, 200, 120); m.feather.defaultValue = 8;
    const res = await render(r, compOf([img(), adj({ effects: [INVERT], blur: { ...DEFAULT_BLUR, radius: 6, strength: 0 }, masks: [m] })]));
    const block = new Float32Array(MASK_BLOCK_FLOATS);
    const count = packMaskSlots(res.frame.layers.find((l) => l.layerType === 'adjustment').masks, block, 0);
    const blurredInv = gaussian(quant(mapImg((x, y) => inv(texel(below, x, y)))), 6);
    out.adj['split plan: invert + Blur 6 px mixed through a feathered mask'] = {
      err: res.err,
      ...compareTo(res.px, (x, y) => { const k = maskStackCoverage(block, 0, count, x + 0.5, y + 0.5); const b = texel(below, x, y), e = texel(blurredInv, x, y); return b.map((v, c) => v + (e[c] - v) * k); }),
    };
  }
  {
    // Partial alpha. Every real composite is opaque (the background shader starts from opaque black),
    // so drive the SHIPPING adjustment pipeline directly: a hand-built premultiplied strip with alpha
    // 0..1 as the below copy, one uniform slot (invert, apply+mix, opacity k), read back - must equal
    // adjustPixel (un-premultiply, effect on straight colour, re-premultiply, mix): alpha unchanged.
    const gpu = r.offscreenGpu, device = gpu.device, N = 64;
    const strip = new Uint8Array(N * 4);
    for (let i = 0; i < N; i++) {
      const a = i / (N - 1), straight = [0.9, 0.3 + 0.5 * (i % 2), 0.1];
      for (let c = 0; c < 3; c++) strip[i * 4 + c] = Math.round(straight[c] * a * 255);
      strip[i * 4 + 3] = Math.round(a * 255);
    }
    const below = device.createTexture({ size: [N, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    device.queue.writeTexture({ texture: below }, strip, { bytesPerRow: N * 4 }, [N, 1]);
    const target = device.createTexture({ size: [N, 1], format: gpu.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    // ImageUniforms floats (renderer.ts): 0-1 resolution, 2-3 quadPos, 4-5 quadSize, 9 opacity, 14 gamma,
    // 124 effectCount, 126 adjustMode, 128.. effect slots (type, p0..p6).
    const runStrip = async (k) => {
      const u = new Float32Array(1280 / 4);
      u[0] = N; u[1] = 1; u[2] = N / 2; u[3] = 0.5; u[4] = N; u[5] = 1; u[9] = k; u[14] = 1;
      u[124] = 1; u[126] = 1; u[128] = EFFECT_TYPE.invert; u[129] = 1;
      const ub = device.createBuffer({ size: 1280, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(ub, 0, u);
      const view = below.createView();
      const bg = device.createBindGroup({ layout: gpu.adjustBindGroupLayout, entries: [
        { binding: 0, resource: { buffer: ub, size: 1280 } }, { binding: 1, resource: gpu.textSampler },
        { binding: 2, resource: view }, { binding: 3, resource: view },
      ] });
      const rb = device.createBuffer({ size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const enc = device.createCommandEncoder();
      const p = enc.beginRenderPass({ colorAttachments: [{ view: target.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
      p.setPipeline(gpu.adjustPipeline); p.setBindGroup(0, bg, [0]); p.draw(6); p.end();
      enc.copyTextureToBuffer({ texture: target }, { buffer: rb, bytesPerRow: 256 }, [N, 1]);
      device.pushErrorScope('validation');
      device.queue.submit([enc.finish()]);
      const err = await device.popErrorScope();
      await rb.mapAsync(GPUMapMode.READ);
      const got = new Uint8Array(rb.getMappedRange().slice(0));
      rb.unmap();
      const bgra = gpu.format === 'bgra8unorm';
      let maxErr = 0, worst = null, alphaErr = 0;
      for (let i = 0; i < N; i++) {
        const b = [strip[i * 4] / 255, strip[i * 4 + 1] / 255, strip[i * 4 + 2] / 255, strip[i * 4 + 3] / 255];
        const e = adjustPixel(b, k, inv);
        const g = bgra ? [got[i * 4 + 2], got[i * 4 + 1], got[i * 4], got[i * 4 + 3]] : [got[i * 4], got[i * 4 + 1], got[i * 4 + 2], got[i * 4 + 3]];
        for (let c = 0; c < 4; c++) { const d = Math.abs(g[c] - e[c] * 255); if (d > maxErr) { maxErr = d; worst = [i, c, g[c], Math.round(e[c] * 255)]; } }
        alphaErr = Math.max(alphaErr, Math.abs(g[3] - strip[i * 4 + 3]));
      }
      return { err: err ? err.message : null, maxErr: Math.round(maxErr * 100) / 100, worst, alphaErr };
    };
    out.alphaStrip = { full: await runStrip(1), half: await runStrip(0.5) };
  }
  {
    // Precomp: the sub-composition holds the image + an invert adjustment.
    const sub = compOf([img(), adj({ effects: [INVERT] })]);
    const pc = createPrecompLayer('pc', sub.id, 30);
    pc.transform.position.defaultValue = [W / 2, H / 2];
    const parent = compOf([pc]);
    const ctx = { getComposition: (id) => (id === sub.id ? sub : null) };
    const res = await render(r, parent, ctx);
    out.adj['adjustment inside a precomp'] = { err: res.err, ...compareTo(res.px, twin(inv), { border: 1 }) };
    // Info only: where a precomp at its DEFAULT transform (position 0, 0) lands.
    const def = await render(r, compOf([createPrecompLayer('pc0', sub.id, 30)]), ctx);
    const at = (x, y) => Array.from(def.px.slice((y * W + x) * 4, (y * W + x) * 4 + 3));
    out.info.precompDefaultPlacement = { topLeft: at(5, 5), center: at(160, 90), bottomRight: at(315, 175) };
  }

  // ── 3. layer Blur: reaches the object; every type reads the right uniforms (new) vs the old renderer ──
  const Base = BaselineRenderer ? await initRenderer(BaselineRenderer) : null;
  const rect = (x = 160, w = 120, o = {}) => Object.assign(createRectangleLayer('r', x, 90, w, 60, [1, 0.25, 0.1, 1], 30), o);
  const sharp = toF((await render(r, compOf([rect()]))).px);
  const blurScene = async (name, blur, expect) => {
    const res = await render(r, compOf([rect(160, 120, { blur })]));
    const old = Base ? await render(Base, compOf([rect(160, 120, { blur })])) : null;
    out.blur[name] = { err: res.err, ...compareTo(res.px, expect), oldVsSharp: old ? compareTo(old.px, sharp).maxErr : null, newVsSharp: compareTo(res.px, sharp).maxErr };
  };
  const B = (o) => ({ ...DEFAULT_BLUR, angle: 0, centerX: 0.5, centerY: 0.5, strength: 0, passes: 1, radius: 0, ...o });
  await blurScene('gaussian radius 8 (strength 0, like the per-glyph blur)', B({ type: 'gaussian', radius: 8 }), gaussian(sharp, 8));
  await blurScene('directional strength 30', B({ type: 'directional', strength: 30 }), quant(directional(sharp, 30, 0)));
  await blurScene('radial strength 20', B({ type: 'radial', strength: 20, centerX: 0.3, centerY: 0.4 }), radial(sharp, 20, 0.3, 0.4));
  await blurScene('kawase 3 passes', B({ type: 'kawase', passes: 3, radius: 4 }), kawase(sharp, 3));
  {
    // Two blurred layers in one frame (kawase left, directional right): each its own uniform slots.
    const L = rect(70, 60, { blur: B({ type: 'kawase', passes: 3, radius: 4 }) }), R = rect(250, 60, { blur: B({ type: 'directional', strength: 20 }) });
    const sharp2 = toF((await render(r, compOf([rect(70, 60), rect(250, 60)]))).px);
    const res = await render(r, compOf([L, R]));
    const kl = kawase(sharp2, 3), dr = directional(sharp2, 20, 0);
    out.blur['kawase + directional layers in one frame'] = { err: res.err, ...compareTo(res.px, (x, y) => texel(x < 160 ? kl : dr, x, y)) };
  }

  // ── 4. byte-identity with the pre-batch renderer for frames with no adjustment / layer Blur ──
  if (Base) {
    const same = async (name, layers, setup) => {
      if (setup) { setup(r); setup(Base); }
      const a = await render(r, compOf(layers)), b = await render(Base, compOf(layers));
      if (setup) { r.setEffectsPreviewDisabled(false); Base.setEffectsPreviewDisabled(false); }
      out.identity[name] = { errA: a.err, errB: b.err, ...diffPx(a.px, b.px) };
    };
    const m = createMask('ellipse', 160, 90, 200, 120); m.feather.defaultValue = 5;
    await same('image + effect stack + feathered mask', [Object.assign(img(), { effects: [{ type: EFFECT_TYPE.invert, enabled: true, params: [0.5] }, { type: EFFECT_TYPE.pixelate, enabled: true, params: [4] }], masks: [m] })]);
    await same('shape with image glow + drop shadow (multipass)', [img(), rect(160, 120, { glow: { ...DEFAULT_GLOW, threshold: 0.3, radius: 10 }, shadow: { ...DEFAULT_SHADOW } })]);
    await same('outer glow + inner glow shapes', [rect(90, 80, { glow: { ...DEFAULT_GLOW, mode: 'outer', color: [0, 0.6, 1, 1] } }), Object.assign(createCircleLayer('c', 240, 90, 40, [0.2, 1, 0.3, 1], 30), { glow: { ...DEFAULT_GLOW, mode: 'inner', color: [1, 0, 1, 1] } })]);
    await same('track matte (alpha)', [Object.assign(rect(160, 200), { trackMatte: 'alpha' }), createCircleLayer('src', 160, 90, 50, [1, 1, 1, 1], 30)]);
    await same('empty (no-op) adjustment over content', [img(), adj()]);
    await same('blur-only adjustment with effects preview off', [img(), adj({ blur: { ...DEFAULT_BLUR, radius: 8 } })], (x) => x.setEffectsPreviewDisabled(true));
  }

  mediaAssetManager.getImageBitmap = origGet;
  return out;
};
`;

// ── 5. the REAL Inspector: an adjustment layer's Filters / Effects / Properties tabs ──
const INSPECTOR_ENTRY = String.raw`
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Inspector } from '@/ui/panels/Inspector';
import { useEditorStore } from '@/store/editor';
import { useHistoryStore } from '@/store/history';
import { WebGPURenderer } from '@/engine/renderer';
import { resolveFrame } from '@/core/interpolation';
import { createImageLayer, createAdjustmentLayer } from '@/core/factory';
import { mediaAssetManager } from '@/engine/media/assetManager';
import { EFFECT_TYPE } from '@/core/effects/effectRegistry';
import { adjustPixel, applyBasicFilters, IDENTITY_FILTERS } from '@/core/effects/adjustmentComposite';
${PAGE_LIB}

document.body.style.margin = '0';
const find = (sel, pred) => Array.from(document.querySelectorAll(sel)).find(pred) ?? null;
const rectOf = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: r.left, right: r.right, w: r.width }; };
let renderer = null, below = null;

window.__insp = {
  async setup() {
    const bmp = await makeBitmap(1);
    const origGet = mediaAssetManager.getImageBitmap.bind(mediaAssetManager);
    mediaAssetManager.getImageBitmap = (id) => (id === 'adj-img' ? bmp : origGet(id));
    const st = useEditorStore.getState();
    const img = createImageLayer('img', W / 2, H / 2, 'adj-img', W, H, 'png', 0, 30);
    const adj = createAdjustmentLayer('Adjustment Layer', 30);
    const composition = blackBackground({ ...st.composition, settings: { ...st.composition.settings, width: W, height: H }, background: structuredClone(st.composition.background), layers: [img, adj] });
    useEditorStore.setState({ composition });
    useEditorStore.getState().selectLayer(adj.id, false, 'canvas');
    const host = document.createElement('div');
    host.style.cssText = 'position:relative;width:420px;';
    document.body.appendChild(host);
    createRoot(host).render(React.createElement(Inspector));
    renderer = new WebGPURenderer();
    const ok = await renderer.initializeOffscreen(W, H);
    window.__ids = { img: img.id, adj: adj.id };
    // The composite below (image alone) for the expectations.
    const frame = resolveFrame({ ...composition, layers: [img] }, 0);
    await renderer.renderFrameAsync(frame, 'offscreen');
    below = toF(await readPixels(renderer));
    return { ok };
  },
  tabAt(label) { return rectOf(find('button', (b) => b.textContent.trim() === label)); },
  searchAt() { return rectOf(document.querySelector('input[placeholder="Search filters..."]')); },
  // A filter slider row: its label, then the range input in the same row.
  sliderAt(label) {
    const l = find('label', (x) => x.textContent.trim() === label && x.parentElement && x.parentElement.querySelector('input[type=range]'));
    return l ? rectOf(l.parentElement.querySelector('input[type=range]')) : null;
  },
  switchAt(label) {
    const s = find('span', (x) => x.textContent.trim() === label && x.className.includes('text-caption'));
    if (!s) return null;
    return rectOf(s.parentElement.parentElement.querySelector('button[role=switch]'));
  },
  labels() { return Array.from(document.querySelectorAll('span.text-caption, label')).map((x) => x.textContent.trim()); },
  hasOpacity() { return !!find('span, label', (s) => s.textContent.trim() === 'Opacity' && s.className.includes('w-14')); },
  state() {
    const comp = useEditorStore.getState().composition;
    const a = comp.layers.find((l) => l.id === window.__ids.adj);
    return {
      filters: a.filters ?? null,
      effects: (a.effects ?? []).map((e) => ({ type: e.type, params: e.params, enabled: e.enabled !== false })),
      blur: a.blur ? { enabled: a.blur.enabled, type: a.blur.type, radius: a.blur.radius } : null,
      glow: a.glow ? { enabled: a.glow.enabled, mode: a.glow.mode } : null,
      history: useHistoryStore.getState().undoStack.map((c) => c.label),
      invertType: EFFECT_TYPE.invert,
    };
  },
  undo() { useHistoryStore.getState().undo(); },
  // Render the STORE's composition through the real renderer; compare with the twin of what the
  // adjustment now holds (filters -> colour effects (invert) -> optional gaussian Blur).
  async renderAndCompare() {
    const comp = useEditorStore.getState().composition;
    const frame = resolveFrame(comp, 0);
    const dev = renderer.offscreenGpu.device;
    dev.pushErrorScope('validation');
    await renderer.renderFrameAsync(frame, 'offscreen');
    const err = await dev.popErrorScope();
    const px = await readPixels(renderer);
    const a = comp.layers.find((l) => l.id === window.__ids.adj);
    const f = { ...IDENTITY_FILTERS, ...(a.filters ?? {}) };
    const invE = (a.effects ?? []).find((e) => e.type === EFFECT_TYPE.invert && e.enabled !== false);
    const amt = invE ? invE.params[0] : 0;
    const fx = (c) => { const r0 = applyBasicFilters([c[0], c[1], c[2]], f).map(clamp01); const r1 = r0.map((v) => v + (1 - 2 * v) * amt); return [r1[0], r1[1], r1[2], c[3]]; };
    let expect = mapImg((x, y) => adjustPixel(texel(below, x, y), 1, fx));
    if (a.blur && a.blur.enabled && a.blur.type === 'gaussian') expect = gaussian(quant(expect), a.blur.radius);
    return { err: err ? err.message : null, ...compareTo(px, expect) };
  },
};
`;

const chrome = findChrome();
if (!chrome) {
  console.error('✖ gpu:adjustment needs Chrome/Chromium/Edge with WebGPU (set CHROME_PATH).');
  process.exit(2);
}

const dir = makeTempDir('gpu-adjustment-');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

try {
  // The pre-batch renderer, imports rewritten to absolute repo paths, bundled side by side.
  let baselinePath = null;
  try {
    const src = execSync(`git show ${BASELINE_COMMIT}:src/engine/renderer.ts`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const rewritten = src.replace(/from '\.\.\//g, `from '${ROOT_F}/src/`).replace(/from '\.\//g, `from '${ROOT_F}/src/engine/`);
    baselinePath = `${fwd(dir)}/renderer-baseline.ts`;
    writeFileSync(baselinePath, rewritten);
  } catch (e) {
    console.warn(`  (baseline ${BASELINE_COMMIT} unavailable - skipping the byte-identity + old-renderer checks: ${e.message.split('\n')[0]})`);
  }
  await bundleEntry(RENDER_ENTRY(baselinePath), dir);
  const { value, logs } = await runInHeadlessChrome({ dir, expression: `(async () => { await import('/bundle.js'); return await window.__adjGpu(); })()`, timeoutMs: 300000 });
  if (!value || value.noAdapter) throw new Error('no WebGPU adapter in headless Chrome');
  if (value.initFailed) throw new Error('offscreen renderer init failed');

  check(`real WebGPURenderer: all ${value.modules} shader modules compile (adjustment variant in ${value.adjustModules})`, () => {
    assert.deepEqual(value.compileErrors, []);
    assert.equal(value.adjustModules, 1, 'the adjustment variant is its own module');
  });

  const TOL = { default: 2, glow: 4, blur: 3 };
  for (const [name, s] of Object.entries(value.adj)) {
    if (name.startsWith('layer above')) continue;
    const exact = name.includes('byte-identical');
    const tol = exact ? 0 : name.includes('Glow') ? TOL.glow : name.includes('Blur') || name.includes('pixelate') ? TOL.blur : TOL.default;
    check(`adjustment: ${name} matches the CPU twin (max err ${s.maxErr}/255${s.inside != null ? `, ${s.inside} px inside / ${s.outside} outside the mask` : ''})`, () => {
      assert.equal(s.err, null);
      assert.ok(s.maxErr <= tol, `max channel error ${s.maxErr} > ${tol} at [x, y, c, got, want] ${JSON.stringify(s.worst)}`);
      if (s.inside != null) assert.ok(s.inside > 3000 && s.outside > 3000, 'the mask splits the frame');
    });
  }
  check('adjustment: a layer ABOVE the adjustment is untouched; everything below is adjusted', () => {
    const s = value.adj['layer above the adjustment is untouched'];
    assert.equal(s.err, null);
    assert.ok(s.rect.maxErr <= 1, `rect above changed: ${JSON.stringify(s.rect.worst)}`);
    assert.ok(s.rest.maxErr <= TOL.default, `below not inverted: ${JSON.stringify(s.rest.worst)}`);
  });
  for (const [name, a] of Object.entries(value.alphaStrip)) {
    check(`adjustment WGSL on a premultiplied alpha 0..1 strip (k = ${name === 'full' ? 1 : 0.5}): == the twin, alpha unchanged (max err ${a.maxErr}/255)`, () => {
      assert.equal(a.err, null);
      assert.ok(a.maxErr <= 1.5, JSON.stringify(a.worst));
      assert.ok(a.alphaErr <= 1, `alpha drifted by ${a.alphaErr}`);
    });
  }

  for (const [name, s] of Object.entries(value.blur)) {
    check(`layer Blur: ${name} matches the shader twin (max err ${s.maxErr}/255; blurred vs sharp ${s.newVsSharp}${s.oldVsSharp != null ? `, pre-batch vs sharp ${s.oldVsSharp}` : ''})`, () => {
      assert.equal(s.err, null);
      assert.ok(s.maxErr <= TOL.blur, `max channel error ${s.maxErr} at ${JSON.stringify(s.worst)}`);
      if (s.newVsSharp != null && !name.includes('layers in one frame')) assert.ok(s.newVsSharp > 40, 'the object is visibly blurred');
    });
  }
  if (value.blur['gaussian radius 8 (strength 0, like the per-glyph blur)'].oldVsSharp != null) {
    check('layer Blur: the pre-batch renderer left the object sharp for every blur type (the bug this fixes)', () => {
      for (const [name, s] of Object.entries(value.blur)) if (s.oldVsSharp != null) assert.ok(s.oldVsSharp <= 1, `${name}: pre-batch differs from sharp by ${s.oldVsSharp}`);
    });
  }

  for (const [name, s] of Object.entries(value.identity)) {
    check(`byte-identical to the pre-batch renderer: ${name}`, () => {
      assert.equal(s.errA, null);
      assert.equal(s.errB, null);
      assert.equal(s.max, 0, `differs by ${s.max} at [x, y, c] ${JSON.stringify(s.at)}`);
    });
  }
  console.log(`  (info) a precomp at its default transform (position 0, 0): ${JSON.stringify(value.info.precompDefaultPlacement)}`);

  // ── 5. the real Inspector ──
  const inspDir = join(dir, 'insp');
  mkdirSync(inspDir);
  await bundleEntry(INSPECTOR_ENTRY, inspDir);
  const insp = await withHeadlessPage({ dir: inspDir, timeoutMs: 300000 }, async (page) => {
    const ev = (expr) => page.evaluate(expr);
    const mouse = (type, x, y, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
    const click = async (p, dx = 0) => {
      await mouse('mouseMoved', p.x + dx, p.y, { buttons: 0, button: 'none' });
      await mouse('mousePressed', p.x + dx, p.y);
      await mouse('mouseReleased', p.x + dx, p.y);
    };
    const settle = () => ev('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 3200, deviceScaleFactor: 1, mobile: false });
    const r = {};
    r.setup = await ev(`(async () => { await import('/bundle.js'); return await window.__insp.setup(); })()`);
    await settle();
    r.propsOpacity = await ev('window.__insp.hasOpacity()');
    r.filtersTab = await ev("window.__insp.tabAt('Filters')");
    await click(r.filtersTab);
    await settle();
    // Saturation: click the far left of its slider (min -1).
    const sat = await ev("window.__insp.sliderAt('Saturation')");
    r.satSlider = !!sat;
    if (sat) await click({ x: sat.left + 1, y: sat.y });
    await settle();
    r.afterSat = await ev('window.__insp.state()');
    r.renderSat = await ev('window.__insp.renderAndCompare()');
    // Search "Invert", click the far right of its slider (amount 1).
    const search = await ev('window.__insp.searchAt()');
    await click(search);
    await settle();
    await page.send('Input.insertText', { text: 'Invert' });
    await settle();
    const invS = await ev("window.__insp.sliderAt('Invert')");
    r.invSlider = !!invS;
    if (invS) await click({ x: invS.right - 1, y: invS.y });
    await settle();
    r.afterInv = await ev('window.__insp.state()');
    r.renderInv = await ev('window.__insp.renderAndCompare()');
    // Gaussian Blur wire filter: clear the search, search again, click ~1/5 along its slider.
    await click(search);
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65, commands: ['selectAll'] });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
    await page.send('Input.insertText', { text: 'Gaussian' });
    await settle();
    const gb = await ev("window.__insp.sliderAt('Gaussian Blur')");
    r.blurSlider = !!gb;
    if (gb) await click({ x: gb.left + gb.w * 0.2, y: gb.y });
    await settle();
    r.afterBlur = await ev('window.__insp.state()');
    r.renderBlur = await ev('window.__insp.renderAndCompare()');
    // Effects tab: the styles that need a silhouette are hidden; Glow on hides Mode / Glow Only.
    await click(await ev("window.__insp.tabAt('Effects')"));
    await settle();
    r.effectsLabels = await ev('window.__insp.labels()');
    const gs = await ev("window.__insp.switchAt('Glow')");
    if (gs) await click(gs);
    await settle();
    r.afterGlow = await ev('window.__insp.state()');
    r.glowLabels = await ev('window.__insp.labels()');
    await ev('window.__insp.undo()');
    await settle();
    r.afterUndo = await ev('window.__insp.state()');
    r.logs = page.logs.filter((l) => /^(error|exception)/.test(l));
    return r;
  });

  check('UI: the adjustment layer\'s Properties tab has an Opacity control; a Filters tab is offered', () => {
    assert.equal(insp.setup.ok, true);
    assert.equal(insp.propsOpacity, true);
    assert.ok(insp.filtersTab, 'Filters tab button');
  });
  check(`UI: the Saturation slider (genuine click) sets the adjustment's filter and renders grey (max err ${insp.renderSat.maxErr}/255)`, () => {
    assert.equal(insp.satSlider, true);
    assert.deepEqual(insp.afterSat.filters, { saturation: -1 });
    assert.equal(insp.afterSat.history.at(-1), 'Update Property');
    assert.equal(insp.renderSat.err, null);
    assert.ok(insp.renderSat.maxErr <= 2, JSON.stringify(insp.renderSat.worst));
  });
  check(`UI: a searched Invert effect lands on the adjustment's stack and renders over the grade (max err ${insp.renderInv.maxErr}/255)`, () => {
    assert.equal(insp.invSlider, true);
    assert.deepEqual(insp.afterInv.effects, [{ type: insp.afterInv.invertType, params: [1], enabled: true }]);
    assert.equal(insp.afterInv.history.at(-1), 'Adjust Filter');
    assert.equal(insp.renderInv.err, null);
    assert.ok(insp.renderInv.maxErr <= 2, JSON.stringify(insp.renderInv.worst));
  });
  check(`UI: the Gaussian Blur filter sets the adjustment's layer Blur and the split plan renders it (radius ${insp.afterBlur.blur?.radius}, max err ${insp.renderBlur.maxErr}/255)`, () => {
    assert.equal(insp.blurSlider, true);
    assert.ok(insp.afterBlur.blur && insp.afterBlur.blur.enabled && insp.afterBlur.blur.type === 'gaussian' && insp.afterBlur.blur.radius > 2, JSON.stringify(insp.afterBlur.blur));
    assert.equal(insp.renderBlur.err, null);
    assert.ok(insp.renderBlur.maxErr <= TOL.blur, JSON.stringify(insp.renderBlur.worst));
  });
  check('UI: the Effects tab hides Motion Blur / Shadow for an adjustment; Glow on hides Mode + Glow Only (undoable)', () => {
    assert.ok(!insp.effectsLabels.includes('Motion Blur') && !insp.effectsLabels.includes('Shadow'), JSON.stringify(insp.effectsLabels));
    assert.ok(insp.effectsLabels.includes('Glow') && insp.effectsLabels.includes('Blur'));
    assert.deepEqual(insp.afterGlow.glow, { enabled: true, mode: 'image' });
    assert.ok(!insp.glowLabels.includes('Mode') && !insp.glowLabels.includes('Glow Only'), JSON.stringify(insp.glowLabels));
    assert.ok(insp.glowLabels.includes('Threshold'));
    assert.equal(insp.afterUndo.glow, null);
  });
  check('UI: no React / runtime errors logged by the Inspector', () => {
    assert.deepEqual(insp.logs, []);
  });

  const gpuErrors = logs.filter((l) => /WGSL|validation|GPUValidationError|Invalid ShaderModule/i.test(l));
  check('no WebGPU validation / WGSL errors logged by the page', () => {
    assert.deepEqual(gpuErrors, []);
  });

  console.log(`\n✓ all ${passed} GPU checks passed`);
} catch (err) {
  console.error('\n✖ gpu:adjustment failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
