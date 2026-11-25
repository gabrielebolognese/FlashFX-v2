// GPU harness for the 2.5D card render (B53): the M2 camera path (cardMVP packed into every quad
// pipeline + painter's depth sort) was wired but had never been checked on a real GPU. Headless Chrome
// with WebGPU (scripts/lib/headless-gpu.mjs): NOT part of `npm test` (CI has no GPU). Run locally:
//   npm run gpu:camera-cards
//
// Proves on the REAL WebGPURenderer (offscreen, pixel readback):
//  1. Every shader module compiles; no GPU validation error on any frame.
//  2. Rendered 3D cards land where core/camera3d.ts projects them: white cards on black, rotated in
//     X / Y / Z, pushed in depth, scaled, with an off-centre anchor, under the default camera, a moved
//     two-node camera and an aimed one-node camera. Each card edge is measured sub-pixel (the 50 %
//     coverage crossing along the edge normal), lines are fitted and intersected, and the measured
//     corners must sit within 1 px of the projection of the layer's world matrix (the RAW composeModel
//     route, independent of the renderer's cardMVP + pivot-compensated uniform packing). For the
//     default camera the projection is also cross-checked against a hand-written pinhole formula.
//  3. A flat 3D card at z = 0 renders like the 2D card (AE parity), with no camera layer AND with a
//     freshly added default camera layer (editor.addCameraLayer must not zoom the shot).
//  4. Painter's order: a nearer card draws over a farther one even when the layer order says otherwise.
//     Includes the path pipeline (polygon / pen path / shape morph), which had NO 3D path before B53
//     (a 3D path shape rendered flat) - the regression this harness found and pins.
//  5. A precomp as a 3D card (the "screen inside a tilted phone" case) lands on its projection too.
//  6. Agent path: a card built and keyed through window.__ffxAgent (setKeyframes transform.rotationY,
//     the r07 swing-in) matches the projection at the eased angle on several frames.

import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { bundleEntry, makeTempDir, withHeadlessPage } from './lib/headless-gpu.mjs';

const ENTRY = String.raw`
import { installAgentRuntime } from '@/agent/runtime';
import { useEditorStore } from '@/store/editor';
import { WebGPURenderer } from '@/engine/renderer';
import { resolveFrame } from '@/core/interpolation';
import { transformPoint } from '@/core/mat4';
import { computeHomography, applyHomography } from '@/core/tracking/homography';
import { useHistoryStore } from '@/store/history';
import { createComposition, createRectangleLayer, createPolygonLayer, createCameraLayer, createPrecompLayer, createProperty } from '@/core/factory';
installAgentRuntime();

const W = 480, H = 270;

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
  return g.getImageData(0, 0, W, H).data;
}
const blackBackground = (comp) => { for (const l of comp.background.layers) for (const st of l.stops) st.color = [0, 0, 0]; return comp; };
const compOf = (layers) => { const c = blackBackground(createComposition('cards', { width: W, height: H, frameRate: 30, durationFrames: 60, backgroundColor: [0, 0, 0, 1] })); c.layers = layers; return c; };
const num = (name, v) => createProperty(name, 'number', v);
// A white rectangle card; opts: { w, h, x, y, z, rx, ry, rz, scale, anchor, color, is3D }.
function card(o = {}) {
  const l = createRectangleLayer('card', o.x ?? W / 2, o.y ?? H / 2, o.w ?? 160, o.h ?? 100, o.color ?? [1, 1, 1, 1], 60);
  l.is3D = o.is3D ?? true;
  l.transform.positionZ = num('Z Position', o.z ?? 0);
  l.transform.rotationX = num('X Rotation', o.rx ?? 0);
  l.transform.rotationY = num('Y Rotation', o.ry ?? 0);
  l.transform.rotation.defaultValue = o.rz ?? 0;
  if (o.scale) l.transform.scale.defaultValue = o.scale;
  if (o.anchor) l.transform.anchorPoint.defaultValue = o.anchor;
  return l;
}

let modules = [];
let R = null;
const errors = [];
async function render(comp, frame = 0, ctx) {
  const rf = resolveFrame(comp, frame, ctx);
  const dev = R.offscreenGpu.device;
  dev.pushErrorScope('validation');
  await R.renderFrameAsync(rf, 'offscreen');
  const err = await dev.popErrorScope();
  if (err) errors.push(err.message);
  return { px: await readPixels(R), rf };
}

// Project a layer-local point (z = 0) through the layer's world matrix and the frame camera to comp px.
function projectLocal(rf, rl, x, y) {
  const wp = transformPoint(rl.worldMatrix, x, y, 0);
  const c = transformPoint(rf.camera.viewProjection, wp[0] / wp[3], wp[1] / wp[3], wp[2] / wp[3]);
  return [(c[0] / c[3] + 1) / 2 * W, (1 - c[1] / c[3]) / 2 * H];
}
// The same corner by a plain pinhole for the default camera (eye at (W/2, H/2, -H), zoom H).
function pinholeLocal(rl, x, y) {
  const wp = transformPoint(rl.worldMatrix, x, y, 0);
  const f = H, d = wp[2] + f;
  return [W / 2 + f * (wp[0] - W / 2) / d, H / 2 + f * (wp[1] - H / 2) / d];
}
// Layer-local corners: a centred w x h box, or (w = array) four explicit local points.
function expectedQuad(rf, id, w, h, pinhole) {
  const rl = rf.layers.find((l) => l.id === id);
  if (!rl || !rl.worldMatrix) throw new Error('layer ' + id + ' has no world matrix (not resolved as 3D)');
  const loc = Array.isArray(w) ? w : [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  return loc.map(([x, y]) => (pinhole ? pinholeLocal(rl, x, y) : projectLocal(rf, rl, x, y)));
}

// Sub-pixel edge measurement: for each expected edge, walk the outward normal at 17 stations and find
// the 50 % coverage crossing of the red channel (bilinear), fit a line through the crossings, intersect
// adjacent lines -> measured corners.
function measureQuad(px, quad) {
  const red = (x, y) => { x = Math.min(W - 1, Math.max(0, x)); y = Math.min(H - 1, Math.max(0, y)); return px[(y * W + x) * 4] / 255; };
  const bil = (qx, qy) => {
    const u = qx - 0.5, v = qy - 0.5, x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    return (red(x0, y0) * (1 - fx) + red(x0 + 1, y0) * fx) * (1 - fy) + (red(x0, y0 + 1) * (1 - fx) + red(x0 + 1, y0 + 1) * fx) * fy;
  };
  const cx = quad.reduce((s, p) => s + p[0], 0) / 4, cy = quad.reduce((s, p) => s + p[1], 0) / 4;
  const lines = [];
  let maxOffset = 0, misses = 0;
  for (let e = 0; e < 4; e++) {
    const A = quad[e], B = quad[(e + 1) % 4];
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const dx = (B[0] - A[0]) / len, dy = (B[1] - A[1]) / len;
    let nx = dy, ny = -dx;
    if (nx * ((A[0] + B[0]) / 2 - cx) + ny * ((A[1] + B[1]) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
    const pts = [];
    for (let k = 0; k < 17; k++) {
      const t = 0.15 + (0.7 * k) / 16;
      const P = [A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])];
      let hit = null;
      for (let s = -5; s < 5; s += 0.05) {
        const v0 = bil(P[0] + s * nx, P[1] + s * ny), v1 = bil(P[0] + (s + 0.05) * nx, P[1] + (s + 0.05) * ny);
        if (v0 >= 0.5 && v1 < 0.5) { hit = s + 0.05 * (v0 - 0.5) / (v0 - v1); break; }
      }
      if (hit === null) { misses++; continue; }
      maxOffset = Math.max(maxOffset, Math.abs(hit));
      pts.push([P[0] + hit * nx, P[1] + hit * ny]);
    }
    if (pts.length < 4) return { ok: false, misses };
    // Total-least-squares line fit.
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    let sxx = 0, sxy = 0, syy = 0;
    for (const p of pts) { const a = p[0] - mx, b = p[1] - my; sxx += a * a; sxy += a * b; syy += b * b; }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    lines.push({ p: [mx, my], d: [Math.cos(ang), Math.sin(ang)] });
  }
  const meet = (L1, L2) => {
    const det = L1.d[0] * -L2.d[1] - L1.d[1] * -L2.d[0];
    const rx = L2.p[0] - L1.p[0], ry = L2.p[1] - L1.p[1];
    const t = (rx * -L2.d[1] - ry * -L2.d[0]) / det;
    return [L1.p[0] + t * L1.d[0], L1.p[1] + t * L1.d[1]];
  };
  const corners = [0, 1, 2, 3].map((e) => meet(lines[(e + 3) % 4], lines[e]));
  const cornerErr = Math.max(...corners.map((c, i) => Math.hypot(c[0] - quad[i][0], c[1] - quad[i][1])));
  return { ok: true, misses, maxOffset: +maxOffset.toFixed(3), cornerErr: +cornerErr.toFixed(3), corners: corners.map((c) => c.map((v) => +v.toFixed(2))), expected: quad.map((c) => c.map((v) => +v.toFixed(2))) };
}
const maxDiff = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > m) m = d; } return m; };
const countDiff = (a, b, tol) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) > tol || Math.abs(a[i + 1] - b[i + 1]) > tol || Math.abs(a[i + 2] - b[i + 2]) > tol) n++; return n; };
const at = (px, x, y) => { const i = (Math.round(y) * W + Math.round(x)) * 4; return [px[i], px[i + 1], px[i + 2]]; };

window.__cameraCards = async () => {
  if (!navigator.gpu || !(await navigator.gpu.requestAdapter())) return { noAdapter: true };
  const out = { scenes: {}, pinhole: {}, misc: {} };
  R = await newRenderer(modules);
  for (const m of modules) { const info = await m.getCompilationInfo(); for (const msg of info.messages) if (msg.type === 'error') errors.push('compile: ' + msg.message); }
  out.modules = modules.length;

  // Geometry scenes: one card each, measured against the camera3d projection.
  const scene = async (name, layers, cardIdx, w, h, opts = {}) => {
    const comp = compOf(layers);
    const { px, rf } = await render(comp, opts.frame ?? 0, opts.ctx);
    const quad = expectedQuad(rf, layers[cardIdx].id, w, h, false);
    const m = measureQuad(px, quad);
    out.scenes[name] = m;
    if (opts.pinhole) {
      const pq = expectedQuad(rf, layers[cardIdx].id, w, h, true);
      out.pinhole[name] = Math.max(...pq.map((p, i) => Math.hypot(p[0] - quad[i][0], p[1] - quad[i][1])));
    }
    return { px, rf, quad };
  };

  await scene('flat z=0, default camera', [card()], 0, 160, 100, { pinhole: true });
  await scene('rotationY 40', [card({ ry: 40 })], 0, 160, 100, { pinhole: true });
  await scene('rotationY -60', [card({ ry: -60, w: 200 })], 0, 200, 100, { pinhole: true });
  await scene('rotationX -35, z 150, rotation 15', [card({ rx: -35, z: 150, rz: 15 })], 0, 160, 100, { pinhole: true });
  await scene('rotationX 50 + rotationY 25, z -60', [card({ rx: 50, ry: 25, z: -60 })], 0, 160, 100, { pinhole: true });
  await scene('scale 1.4 x 0.8 + anchor (40, 20) + rotationY 35', [card({ ry: 35, scale: [1.4, 0.8], anchor: [40, 20] })], 0, 160, 100, { pinhole: true });

  // Path pipeline (polygon / pen path / morph): a 3D trapezoid (the r01 "404" stack card).
  {
    const v = (x, y) => ({ position: [x, y], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' });
    const pts = [[-70, -50], [70, -50], [95, 50], [-95, 50]];
    const poly = createPolygonLayer('trapezoid', W / 2, H / 2, pts.map(([x, y]) => v(x, y)), true, [1, 1, 1, 1], 60);
    poly.shape.strokeWidth.defaultValue = 0;
    poly.is3D = true;
    poly.transform.positionZ = num('Z Position', 80);
    poly.transform.rotationX = num('X Rotation', 40);
    poly.transform.rotationY = num('Y Rotation', -25);
    await scene('path shape (polygon) rx 40 ry -25 z 80', [poly], 0, pts, 0, { pinhole: true });
  }

  // Two-node camera moved off-axis, aimed at a point off centre, zoomed.
  {
    const cam = createCameraLayer('cam', W, H, 60);
    cam.transform.position.defaultValue = [W / 2 + 140, H / 2 - 70];
    cam.transform.positionZ.defaultValue = -420;
    cam.camera.pointOfInterest.defaultValue = [W / 2 + 20, H / 2 + 10];
    cam.camera.zoom.defaultValue = 380;
    await scene('two-node camera off-axis + card ry -30 rx 20 z -100', [card({ ry: -30, rx: 20, z: -100 }), cam], 0, 160, 100);
  }
  // One-node camera aimed by its own rotation.
  {
    const cam = createCameraLayer('cam1', W, H, 60);
    cam.camera.mode = 'one-node';
    cam.transform.positionZ.defaultValue = -380;
    cam.transform.rotationY.defaultValue = 12;
    cam.transform.rotationX.defaultValue = -8;
    cam.camera.zoom.defaultValue = 340;
    await scene('one-node camera rotY 12 rotX -8 + card rz 20', [card({ rz: 20, x: W / 2 - 60 }), cam], 0, 160, 100);
  }

  // Parity: flat 3D card at z = 0 == the 2D card (no camera layer, and with a fresh default camera layer).
  {
    const flat2D = (await render(compOf([card({ is3D: false })]))).px;
    const flat3D = (await render(compOf([card()]))).px;
    const withCam = (await render(compOf([card(), createCameraLayer('cam', W, H, 60)]))).px;
    out.parity = {
      noCamera: { max: maxDiff(flat2D, flat3D), pixels: countDiff(flat2D, flat3D, 8) },
      defaultCameraLayer: { max: maxDiff(flat2D, withCam), pixels: countDiff(flat2D, withCam, 8) },
    };
  }

  // Painter's order: red near card first in the layer list, blue far card after it.
  {
    const near = card({ color: [1, 0, 0, 1], x: W / 2 - 40, z: -120 });
    const far = card({ color: [0, 0, 1, 1], x: W / 2 + 40, z: 200 });
    const p3 = (await render(compOf([near, far]))).px;
    const flatNear = card({ color: [1, 0, 0, 1], x: W / 2 - 40, is3D: false }), flatFar = card({ color: [0, 0, 1, 1], x: W / 2 + 40, is3D: false });
    const p2 = (await render(compOf([flatNear, flatFar]))).px;
    out.depth = { overlap2D: at(p2, W / 2, H / 2), overlap3D: at(p3, W / 2, H / 2) };
  }

  // Precomp card: a white full-frame sub-comp tilted in Y (the phone-screen case).
  {
    const SW = 200, SH = 120;
    const sub = blackBackground(createComposition('screen', { width: SW, height: SH, frameRate: 30, durationFrames: 60, backgroundColor: [0, 0, 0, 1] }));
    sub.layers = [createRectangleLayer('fill', SW / 2, SH / 2, SW, SH, [1, 1, 1, 1], 60)];
    const pc = createPrecompLayer('phone', sub.id, 60);
    pc.transform.position.defaultValue = [W / 2, H / 2];
    pc.is3D = true;
    pc.transform.positionZ = num('Z Position', 40);
    pc.transform.rotationY = num('Y Rotation', -35);
    pc.transform.rotationX = num('X Rotation', 15);
    const ctx = { getComposition: (id) => (id === sub.id ? sub : null) };
    await scene('precomp card ry -35 rx 15 z 40', [pc], 0, SW, SH, { ctx });
  }

  const a = window.__ffxAgent;
  const run = async (id, args) => { const r = await a.run(id, args); if (!r.ok) throw new Error(id + ': ' + r.error); return r; };
  const undoDepth = () => useHistoryStore.getState().undoStack.length;
  const storeComp = (ids) => { const c = blackBackground(structuredClone(useEditorStore.getState().composition)); c.layers = c.layers.filter((l) => ids.includes(l.id)); return c; };

  // Agent path: build + key a card through window.__ffxAgent (r07 swing-in: ry -45 -> 0, easeOutCubic).
  {
    await run('editor.setCompositionSize', { width: W, height: H });
    const id = (await run('editor.addShapeLayer', { opts: { type: 'rectangle', x: W / 2, y: H / 2, width: 150, height: 110, fill: [1, 1, 1, 1] } })).result;
    await run('editor.toggleLayer3D', { layerId: id });
    await run('editor.setKeyframes', { layerId: id, propertyPath: 'transform.rotationY', keyframes: [{ frame: 0, value: -45, ease: [0.33, 1, 0.68, 1] }, { frame: 13, value: 0 }] });
    await run('editor.setKeyframes', { layerId: id, propertyPath: 'transform.positionZ', keyframes: [{ frame: 0, value: 120, ease: 'cubicOut' }, { frame: 13, value: 0 }] });
    const comp = blackBackground(structuredClone(useEditorStore.getState().composition));
    comp.layers = comp.layers.filter((l) => l.id === id);
    out.agent = {};
    for (const f of [0, 4, 8, 13]) {
      const { px, rf } = await render(comp, f);
      const rl = rf.layers.find((l) => l.id === id);
      out.agent[f] = { ...measureQuad(px, expectedQuad(rf, id, 150, 110, false)), rotationY: +rl.transform.rotationY.toFixed(3) };
    }
  }

  // Agent camera beat: editor.cameraMove (one undo step) pushes in + trucks right around a tilted card.
  {
    const id = (await run('editor.addShapeLayer', { opts: { type: 'rectangle', x: W / 2, y: H / 2, width: 140, height: 90, fill: [1, 1, 1, 1] } })).result;
    await run('editor.toggleLayer3D', { layerId: id });
    await run('editor.setKeyframes', { layerId: id, propertyPath: 'transform.rotationY', keyframes: [{ frame: 0, value: 25 }] });
    await run('editor.addCameraLayer');
    const camId = useEditorStore.getState().selection.activeId;
    const d0 = undoDepth();
    const zoom = useEditorStore.getState().composition.layers.find((l) => l.id === camId).camera.zoom.defaultValue;
    const keyed = (await run('editor.cameraMove', { cameraLayerId: camId, frame: 0, to: { position: [W / 2 + 90, H / 2 - 30, -zoom * 0.6], pointOfInterest: [W / 2 + 20, H / 2, 0] }, durationFrames: 20, ease: 'cubicInOut' })).result;
    out.cameraMove = { undoSteps: undoDepth() - d0, keyed, frames: {} };
    const comp = storeComp([id, camId]);
    for (const f of [0, 10, 20]) {
      const { px, rf } = await render(comp, f);
      out.cameraMove.frames[f] = { ...measureQuad(px, expectedQuad(rf, id, 140, 90, false)), eye: rf.camera.eye.map((v) => +v.toFixed(2)) };
    }
    out.cameraMove.badRejected = !(await a.run('editor.cameraMove', { cameraLayerId: id, frame: 0, to: { zoom: 100 } })).ok;
    out.cameraMove.undoAfterReject = undoDepth() - d0;
    const flatId = (await run('editor.addShapeLayer', { opts: { type: 'rectangle', x: 10, y: 10, width: 5, height: 5 } })).result;
    out.cameraMove.need3D = (await a.run('editor.setKeyframes', { layerId: flatId, propertyPath: 'transform.rotationY', keyframes: [{ frame: 0, value: 10 }] })).error ?? '';
  }

  // Corner pin (B53): the pinned quad lands on the pins, on the shape, path, precomp and text pipelines.
  out.pins = {};
  const PIN = [[150, 60], [350, 85], [330, 215], [140, 235]]; // a phone screen leaning back-right
  const pinOf = (q) => ({ topLeft: createProperty('TL', 'vec2', q[0]), topRight: createProperty('TR', 'vec2', q[1]), bottomRight: createProperty('BR', 'vec2', q[2]), bottomLeft: createProperty('BL', 'vec2', q[3]) });
  {
    const rect = createRectangleLayer('pinned', 100, 100, 120, 80, [1, 1, 1, 1], 60);
    rect.cornerPin = pinOf(PIN);
    out.pins['shape (rectangle)'] = measureQuad((await render(compOf([rect]))).px, PIN);
    // A pin overrides the 3D card projection.
    rect.is3D = true;
    rect.transform.rotationY = num('Y Rotation', 50);
    out.pins['shape pinned + 3D (the pin wins)'] = measureQuad((await render(compOf([rect]))).px, PIN);
  }
  {
    const v = (x, y) => ({ position: [x, y], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' });
    const pts = [[-40, -50], [40, -50], [60, 50], [-60, 50]]; // vertex bounds 120 x 100
    const poly = createPolygonLayer('trap', 80, 80, pts.map(([x, y]) => v(x, y)), true, [1, 1, 1, 1], 60);
    poly.shape.strokeWidth.defaultValue = 0;
    poly.cornerPin = pinOf(PIN);
    const Hm = computeHomography([[-60, -50], [60, -50], [60, 50], [-60, 50]], PIN);
    out.pins['path shape (trapezoid inside its bounds)'] = measureQuad((await render(compOf([poly]))).px, pts.map((p) => applyHomography(Hm, p)));
  }
  {
    const SW = 160, SH = 100;
    const sub = blackBackground(createComposition('screen', { width: SW, height: SH, frameRate: 30, durationFrames: 60, backgroundColor: [0, 0, 0, 1] }));
    sub.layers = [createRectangleLayer('fill', SW / 2, SH / 2, SW, SH, [1, 1, 1, 1], 60)];
    const pc = createPrecompLayer('phone', sub.id, 60);
    pc.transform.position.defaultValue = [W / 2, H / 2];
    pc.cornerPin = pinOf(PIN);
    const ctx = { getComposition: (id) => (id === sub.id ? sub : null) };
    out.pins['precomp (screen in a tilted phone)'] = measureQuad((await render(compOf([pc]), 0, ctx)).px, PIN);
  }
  // Agent: setCornerPin + keyframed pins (setKeyframes cornerPin.topRight), one undo step each.
  {
    const id = (await run('editor.addShapeLayer', { opts: { type: 'rectangle', x: 200, y: 150, width: 100, height: 100, fill: [1, 1, 1, 1] } })).result;
    const corners = { topLeft: PIN[0], topRight: PIN[1], bottomRight: PIN[2], bottomLeft: PIN[3] };
    let d0 = undoDepth();
    await run('editor.setCornerPin', { layerId: id, corners });
    const pinSteps = undoDepth() - d0;
    d0 = undoDepth();
    await run('editor.setKeyframes', { layerId: id, propertyPath: 'cornerPin.topRight', keyframes: [{ frame: 0, value: PIN[1], ease: 'cubicOut' }, { frame: 20, value: [380, 40] }] });
    out.agentPin = { pinSteps, keySteps: undoDepth() - d0, frames: {} };
    const comp = storeComp([id]);
    for (const f of [0, 10, 20]) {
      const { px, rf } = await render(comp, f);
      out.agentPin.frames[f] = measureQuad(px, rf.layers.find((l) => l.id === id).cornerPin);
    }
    out.agentPin.bowtieRejected = !(await a.run('editor.setCornerPin', { layerId: id, corners: { topLeft: PIN[0], topRight: PIN[2], bottomRight: PIN[1], bottomLeft: PIN[3] } })).ok;
    out.agentPin.summary = a.getState().layers.find((l) => l.id === id).cornerPin === true;
    await run('editor.setCornerPin', { layerId: id, corners: null });
    out.agentPin.removed = !useEditorStore.getState().composition.layers.find((l) => l.id === id).cornerPin;
  }
  // Text: the pinned text equals the flat text warped through the same homography (CPU resample).
  {
    const id = (await run('editor.createQuickText', { x: W / 2, y: H / 2, text: 'PIN' })).result;
    await run('editor.updateLayerProperty', { layerId: id, path: 'animOverrides.fontSize.defaultValue', value: 70 });
    const box = (await run('agent.measureText', { layerId: id, frame: 0 })).result.box;
    const flatPx = (await render(storeComp([id]))).px;
    const TP = [[150, 70], [340, 95], [335, 200], [145, 215]];
    await run('editor.setCornerPin', { layerId: id, corners: { topLeft: TP[0], topRight: TP[1], bottomRight: TP[2], bottomLeft: TP[3] } });
    const pinned = (await render(storeComp([id]))).px;
    const hw = box.width / 2, hh = box.height / 2;
    const Hinv = computeHomography(TP, [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]);
    const cx = box.left + hw, cy = box.top + hh;
    const g = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : flatPx[(y * W + x) * 4]);
    const sampleFlat = (qx, qy) => {
      const u = qx - 0.5, v = qy - 0.5, x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
      return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy;
    };
    // Inside the pinned quad grown by 1.5 px (convex, clockwise in y-down).
    const inside = (x, y) => {
      for (let i = 0; i < 4; i++) {
        const p = TP[i], q = TP[(i + 1) % 4];
        if ((q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]) < -1.5 * Math.hypot(q[0] - p[0], q[1] - p[1])) return false;
      }
      return true;
    };
    let lit = 0, bad = 0, sum = 0, n = 0, outside = 0, flatLit = 0;
    for (let i = 0; i < W * H; i++) if (flatPx[i * 4] > 128) flatLit++;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const got = pinned[(y * W + x) * 4];
      if (!inside(x + 0.5, y + 0.5)) { if (got > 40) outside++; continue; }
      const l = applyHomography(Hinv, [x + 0.5, y + 0.5]);
      const d = Math.abs(got - sampleFlat(l[0] + cx, l[1] + cy));
      sum += d; n++;
      if (d > 96) bad++;
      if (got > 128) lit++;
    }
    out.textPin = { lit, bad, outside, flatLit, meanDiff: +(sum / n).toFixed(2), box };
  }

  out.errors = errors;
  return out;
};
window.__ready = true;
`;

const dir = makeTempDir('ffx-camera-cards-');
try {
  await bundleEntry(ENTRY, dir);
  const r = await withHeadlessPage({ dir, timeoutMs: 300000 }, async (page) => {
    await page.evaluate("import('/bundle.js').then(() => true)");
    for (let i = 0; i < 100 && !(await page.evaluate('window.__ready === true')); i++) await new Promise((res) => setTimeout(res, 100));
    if (!(await page.evaluate('window.__ready === true'))) throw new Error(`bundle failed to load:\n${page.logs.join('\n')}`);
    try {
      return await page.evaluate('window.__cameraCards()');
    } catch (e) {
      throw new Error(`${e.message}\n${page.logs.slice(-30).join('\n')}`);
    }
  });
  if (r.noAdapter) { console.log('SKIP: no WebGPU adapter in headless Chrome on this machine'); process.exit(0); }
  if (process.env.CAMERA_CARDS_JSON) writeFileSync(process.env.CAMERA_CARDS_JSON, JSON.stringify(r, null, 1));
  let passed = 0;
  const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
  const TOL = 1; // px

  check(`all ${r.modules} shader modules compile; no GPU validation errors on any frame`, () => assert.deepEqual(r.errors, []));
  check('camera3d projection == hand-written pinhole for the default camera (< 1e-6 px)', () => {
    for (const [k, v] of Object.entries(r.pinhole)) assert.ok(v < 1e-6, `${k}: ${v}`);
  });
  for (const [name, m] of Object.entries(r.scenes)) {
    check(`${name}: rendered corners within ${TOL} px of the camera3d projection (worst ${m.cornerErr} px, edge offset ${m.maxOffset} px)`, () => {
      assert.ok(m.ok, `${name}: edges not found (${JSON.stringify(m)})`);
      assert.equal(m.misses, 0, `${name}: ${m.misses} edge stations missed`);
      assert.ok(m.cornerErr <= TOL, `${name}: corners ${JSON.stringify(m.corners)} vs expected ${JSON.stringify(m.expected)}`);
      assert.ok(m.maxOffset <= TOL, `${name}: an edge station is ${m.maxOffset} px off the projected edge`);
    });
  }
  check('flat 3D card at z = 0 == the 2D card, with no camera layer and with a fresh default camera layer', () => {
    assert.ok(r.parity.noCamera.pixels === 0, JSON.stringify(r.parity));
    assert.ok(r.parity.defaultCameraLayer.pixels === 0, `adding a default camera changed the shot: ${JSON.stringify(r.parity)}`);
  });
  check("painter's order: the nearer card covers the farther one regardless of layer order", () => {
    assert.deepEqual(r.depth.overlap2D, [0, 0, 255], `2D: the later layer (blue) is on top: ${r.depth.overlap2D}`);
    assert.deepEqual(r.depth.overlap3D, [255, 0, 0], `3D: the nearer card (red) is on top: ${r.depth.overlap3D}`);
  });
  check('agent-keyed rotationY swing-in (setKeyframes, eased): every tested frame lands on the projection', () => {
    for (const [f, m] of Object.entries(r.agent)) {
      assert.ok(m.ok && m.misses === 0, `f${f}: ${JSON.stringify(m)}`);
      assert.ok(m.cornerErr <= TOL && m.maxOffset <= TOL, `f${f} (ry ${m.rotationY}): ${JSON.stringify(m)}`);
    }
    assert.ok(r.agent[4].rotationY > -45 && r.agent[4].rotationY < r.agent[8].rotationY && r.agent[13].rotationY === 0, 'rotationY eases -45 -> 0');
  });
  check('agent editor.cameraMove: one undo step, keys eye + POI, the card lands on the projection as the camera pushes in', () => {
    const c = r.cameraMove;
    assert.equal(c.undoSteps, 1);
    assert.deepEqual(c.keyed, ['transform.position', 'transform.positionZ', 'camera.pointOfInterest', 'camera.pointOfInterestZ']);
    for (const [f, m] of Object.entries(c.frames)) assert.ok(m.ok && m.misses === 0 && m.cornerErr <= TOL && m.maxOffset <= TOL, `f${f}: ${JSON.stringify(m)}`);
    assert.ok(c.frames[0].eye[2] < c.frames[10].eye[2] && c.frames[10].eye[2] < c.frames[20].eye[2], 'the eye pushes in');
    assert.equal(c.badRejected, true, 'a non-camera id is rejected');
    assert.equal(c.undoAfterReject, 1, 'nothing applied on reject');
    assert.match(c.need3D, /toggleLayer3D/, 'keying rotationY on a 2D layer explains how to make it 3D');
  });
  for (const [name, m] of Object.entries(r.pins)) {
    check(`corner pin, ${name}: rendered corners within ${TOL} px of the pins / homography (worst ${m.cornerErr} px, edge ${m.maxOffset} px)`, () => {
      assert.ok(m.ok && m.misses === 0, `${name}: ${JSON.stringify(m)}`);
      assert.ok(m.cornerErr <= TOL && m.maxOffset <= TOL, `${name}: ${JSON.stringify(m)}`);
    });
  }
  check('agent setCornerPin + keyed cornerPin.topRight: one undo step each, every frame lands on the evaluated pins; bow-tie rejected; null removes', () => {
    const p = r.agentPin;
    assert.equal(p.pinSteps, 1);
    assert.equal(p.keySteps, 1);
    for (const [f, m] of Object.entries(p.frames)) assert.ok(m.ok && m.misses === 0 && m.cornerErr <= TOL && m.maxOffset <= TOL, `f${f}: ${JSON.stringify(m)}`);
    assert.notDeepEqual(p.frames[0].expected[1], p.frames[20].expected[1], 'the pin moved');
    assert.equal(p.bowtieRejected, true);
    assert.equal(p.summary, true);
    assert.equal(p.removed, true);
  });
  check('corner-pinned text == the flat text warped through the same homography (text pipeline)', () => {
    const t = r.textPin;
    assert.ok(t.lit > 300 && t.flatLit > 300, JSON.stringify(t));
    assert.equal(t.outside, 0, `text drawn outside the pinned quad: ${JSON.stringify(t)}`);
    assert.ok(t.bad / t.lit < 0.02 && t.meanDiff < 6, JSON.stringify(t));
  });
  console.log(`\ngpu:camera-cards - ${passed} checks passed`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
