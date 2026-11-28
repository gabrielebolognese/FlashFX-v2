// Acceptance harness for B38: frosted / liquid glass on shape layers (pure parts, no GPU).
// core/effects/glass.ts holds the material (input / sanitize / resolve), the outline mask that traces the
// shape as the B63 SDF pipeline draws it, the synthesized adjustment pass the renderer inserts below the
// shape, and glassMixPixel, the CPU twin of the WGSL glass branch in the adjustment mix-only prologue.
// The GPU proof is gpu:glass (render_frame pixels through the MCP).
//   node scripts/verify-glass.mjs   (or: npm run verify:glass)
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} set onmessage(_v) {} set onerror(_v) {} };
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return { font: '', textBaseline: 'top', measureText: (s) => ({ width: s.length * 10, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }), setTransform() {}, fillText() {}, strokeText() {}, fillRect() {} }; } };

const tmp = mkdtempSync(join(tmpdir(), 'glass-verify-'));
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const SETTINGS = { width: 1920, height: 1080, frameRate: 30, durationFrames: 100, backgroundColor: [0, 0, 0, 1] };

try {
  const outfile = join(tmp, 'bundle.mjs');
  await build({
    stdin: {
      contents: `
        export { resolveFrame } from './src/core/interpolation';
        export { createComposition, createRectangleLayer, createCircleLayer, createStarLayer, createPolygonLayer, createKeyframe } from './src/core/factory';
        export { validateComposition } from './src/project-system/services/validation';
        export { canonicalKeyframePath } from './src/core/animProps';
        export { packMaskSlots, maskStackField, maskStackCoverage, MASK_BLOCK_FLOATS } from './src/core/maskCoverage';
        export { ellipseDistance } from './src/core/shapeSdf';
        export * from './src/core/effects/glass';
      `,
      resolveDir: process.cwd(), sourcefile: 'entry.ts', loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  const G = await import(pathToFileURL(outfile).href);
  const { resolveFrame, createComposition, createRectangleLayer, createCircleLayer, createStarLayer, createPolygonLayer, createKeyframe, validateComposition,
    canonicalKeyframePath, packMaskSlots, maskStackField, maskStackCoverage, MASK_BLOCK_FLOATS, ellipseDistance } = G;

  console.log('verify:glass');
  const pill = (extra = {}) => {
    const l = createRectangleLayer('pill', 960, 540, 830, 150, [1, 1, 1, 0.08], 100);
    l.id = 'pill';
    l.shape.borderRadius.defaultValue = 75;
    return Object.assign(l, extra);
  };
  const compWith = (...layers) => { const c = createComposition('c', { ...SETTINGS }); c.layers = layers; return c; };
  const resolvedOf = (comp, id, frame = 0) => resolveFrame(comp, frame).layers.find((l) => l.id === id);
  const fieldAt = (masks, x, y, band) => {
    const block = new Float32Array(MASK_BLOCK_FLOATS);
    const n = packMaskSlots(masks, block, 0);
    return maskStackField(block, 0, n, x, y, band);
  };
  const covAt = (masks, x, y) => {
    const block = new Float32Array(MASK_BLOCK_FLOATS);
    const n = packMaskSlots(masks, block, 0);
    return maskStackCoverage(block, 0, n, x, y);
  };

  // 1. Material input.
  check('applyShapeGlassInput: defaults on first use, values clamped (blur 0..200, highlight 0..1, brightness / saturation -1..1)', () => {
    const g = G.applyShapeGlassInput(undefined, {});
    assert.equal(g.enabled, true);
    assert.equal(g.blur.defaultValue, G.GLASS_DEFAULTS.blur);
    assert.equal(g.refraction.defaultValue, G.GLASS_DEFAULTS.refraction);
    assert.equal(g.highlight.defaultValue, G.GLASS_DEFAULTS.highlight);
    assert.equal(g.lightAngle.defaultValue, G.GLASS_DEFAULTS.lightAngle);
    assert.equal(g.edgeWidth, G.GLASS_DEFAULTS.edgeWidth);
    const c = G.applyShapeGlassInput(undefined, { blur: 999, highlight: 3, brightness: -4, saturation: 2, refraction: -500, edgeWidth: -3 });
    assert.equal(c.blur.defaultValue, 200);
    assert.equal(c.highlight.defaultValue, 1);
    assert.equal(c.brightness, -1);
    assert.equal(c.saturation, 1);
    assert.equal(c.refraction.defaultValue, -200);
    assert.equal(c.edgeWidth, 0);
  });
  check('applyShapeGlassInput: a patch sets base values and keeps keyframes; invalid numbers are ignored; enabled toggles', () => {
    const g0 = G.applyShapeGlassInput(undefined, { blur: 30 });
    g0.blur.keyframes = [createKeyframe(0, 0), createKeyframe(20, 30)];
    const g1 = G.applyShapeGlassInput(g0, { blur: 12, highlight: Number.NaN, enabled: false });
    assert.equal(g1.blur.defaultValue, 12);
    assert.equal(g1.blur.keyframes.length, 2, 'keys kept');
    assert.equal(g1.highlight.defaultValue, g0.highlight.defaultValue, 'NaN ignored');
    assert.equal(g1.enabled, false);
    assert.equal(g0.blur.defaultValue, 30, 'the previous object is not mutated');
  });

  // 2. Persistence.
  check('save / load: validateComposition keeps the glass (static values + keys); a shape without glass gets no glass field; junk is dropped', () => {
    const l = pill({ glass: G.applyShapeGlassInput(undefined, { blur: 26, lightAngle: -90, edgeWidth: 20, brightness: -0.1 }) });
    l.glass.lightAngle.keyframes = [createKeyframe(0, -90), createKeyframe(60, 270)];
    const plain = createRectangleLayer('plain', 200, 200, 100, 100, [1, 0, 0, 1], 100); plain.id = 'plain';
    const junk = createRectangleLayer('junk', 300, 300, 100, 100, [1, 0, 0, 1], 100); junk.id = 'junk'; junk.glass = 'frosted';
    const back = validateComposition(JSON.parse(JSON.stringify(compWith(plain, junk, l))));
    const lp = back.layers.find((x) => x.id === 'pill');
    assert.equal(lp.glass.blur.defaultValue, 26);
    assert.equal(lp.glass.edgeWidth, 20);
    assert.equal(lp.glass.brightness, -0.1);
    assert.equal(lp.glass.lightAngle.keyframes.length, 2);
    assert.equal(lp.glass.lightAngle.keyframes[1].value, 270);
    assert.ok(!('glass' in back.layers.find((x) => x.id === 'plain')), 'absent stays absent');
    assert.ok(!('glass' in back.layers.find((x) => x.id === 'junk')), 'a non-object glass is dropped');
  });

  // 3. Resolve.
  check('resolveFrame: the shape carries ResolvedGlass evaluated at the frame (keyed blur / lightAngle); disabled or absent glass resolves no field', () => {
    const l = pill({ glass: G.applyShapeGlassInput(undefined, {}) });
    l.glass.blur.keyframes = [createKeyframe(0, 0), createKeyframe(10, 40)];
    l.glass.lightAngle.keyframes = [createKeyframe(0, 0), createKeyframe(10, 360)];
    const r5 = resolvedOf(compWith(l), 'pill', 5).glass;
    assert.ok(Math.abs(r5.blur - 20) < 1e-6, `blur at f5 ${r5.blur}`);
    assert.ok(Math.abs(r5.lightAngle - 180) < 1e-6, `light at f5 ${r5.lightAngle}`);
    const off = pill({ glass: { ...G.applyShapeGlassInput(undefined, {}), enabled: false } });
    assert.ok(!('glass' in resolvedOf(compWith(off), 'pill')));
    assert.ok(!('glass' in resolvedOf(compWith(pill()), 'pill')));
  });
  check('old projects resolve unchanged: a comp without glass resolves byte-identically with or without the glass module in play', () => {
    const a = JSON.stringify(resolveFrame(compWith(pill()), 3).layers);
    const withOff = pill({ glass: { ...G.applyShapeGlassInput(undefined, {}), enabled: false } });
    const b = JSON.stringify(resolveFrame(compWith(withOff), 3).layers);
    assert.equal(a, b, 'disabled glass == no glass');
  });
  check('keyframe paths: "glass.blur" / "glass.lightAngle" are their own canonical paths (not remapped into animProps)', () => {
    for (const p of ['glass.blur', 'glass.refraction', 'glass.highlight', 'glass.lightAngle']) assert.equal(canonicalKeyframePath(p), p);
  });

  // 4. Outline mask == the drawn shape.
  check('outline of a rounded pill (830 x 150, radius 75): coverage 1 inside, 0 outside, the rounded ends follow the radius', () => {
    const r = resolvedOf(compWith(pill({ glass: G.applyShapeGlassInput(undefined, {}) })), 'pill');
    const m = G.glassOutlineMask(r.shape, r.transform);
    assert.equal(m.type, 'rectangle');
    assert.equal(m.expansion, 75);
    const at = (x, y) => covAt([m], x, y);
    assert.equal(at(960, 540), 1);
    assert.equal(at(960 - 400, 540), 1, 'inside the left cap');
    assert.equal(at(960, 540 - 80), 0, 'above the pill');
    assert.equal(at(960 - 420, 540), 0, 'left of the pill');
    // The box corner (545, 465) is outside the rounded cap; a point on the cap circle 2 px inward is inside.
    assert.equal(at(960 - 415 + 3, 540 - 75 + 3), 0, 'the corner is cut by the radius');
    const cx = 960 - 415 + 75, ang = (-135 * Math.PI) / 180;
    assert.equal(at(cx + Math.cos(ang) * 72, 540 + Math.sin(ang) * 72), 1, 'just inside the cap arc');
    assert.equal(at(cx + Math.cos(ang) * 78, 540 + Math.sin(ang) * 78), 0, 'just outside the cap arc');
  });
  check('outline follows rotation + scale + anchor (a 2x-scaled, 30 deg rotated rect, sampled against its own geometry)', () => {
    const l = createRectangleLayer('r', 900, 500, 200, 100, [1, 1, 1, 0.1], 100); l.id = 'r';
    l.transform.rotation.defaultValue = 30;
    l.transform.scale.defaultValue = [2, 2];
    l.glass = G.applyShapeGlassInput(undefined, {});
    const r = resolvedOf(compWith(l), 'r');
    const m = G.glassOutlineMask(r.shape, r.transform);
    const a = (r.transform.rotation * Math.PI) / 180;
    const [ox, oy] = [m.centerX, m.centerY];
    let bad = 0;
    for (let u = -260; u <= 260; u += 13) for (let v = -130; v <= 130; v += 13) {
      const x = ox + u * Math.cos(a) - v * Math.sin(a), y = oy + u * Math.sin(a) + v * Math.cos(a);
      const inside = Math.abs(u) < 200 - 2 && Math.abs(v) < 100 - 2, outside = Math.abs(u) > 200 + 2 || Math.abs(v) > 100 + 2;
      const c = covAt([m], x, y);
      if ((inside && c !== 1) || (outside && c !== 0)) bad++;
    }
    assert.equal(bad, 0);
    assert.ok(Math.abs(ox - r.transform.positionX) < 1e-6 && Math.abs(oy - r.transform.positionY) < 1e-6, 'centre = position (anchor 0)');
  });
  check('outline of a circle / ellipse matches the B63 SDF (true radius, ellipse under a non-uniform scale)', () => {
    const c = createCircleLayer('c', 600, 400, 120, [1, 1, 1, 0.1], 100); c.id = 'c';
    c.transform.scale.defaultValue = [1.5, 1];
    c.glass = G.applyShapeGlassInput(undefined, {});
    const r = resolvedOf(compWith(c), 'c');
    const m = G.glassOutlineMask(r.shape, r.transform);
    assert.equal(m.type, 'ellipse');
    let bad = 0;
    for (let x = 300; x <= 900; x += 9) for (let y = 220; y <= 580; y += 9) {
      const d = ellipseDistance(x - 600, y - 400, 180, 120);
      const k = covAt([m], x, y);
      if ((d < -2 && k !== 1) || (d > 2 && k !== 0)) bad++;
    }
    assert.equal(bad, 0);
  });
  check('outline of a star and of a path shape: inside points covered, far points not', () => {
    const s = createStarLayer('s', 500, 500, 5, 150, 60, [1, 1, 1, 0.1], 100); s.id = 's';
    s.glass = G.applyShapeGlassInput(undefined, {});
    const rs = resolvedOf(compWith(s), 's');
    const ms = G.glassOutlineMask(rs.shape, rs.transform);
    assert.equal(ms.type, 'star');
    assert.equal(covAt([ms], 500, 500), 1);
    assert.equal(covAt([ms], 500, 500 - 140), 1, 'the top point (points start at -90 deg)');
    assert.equal(covAt([ms], 500 + 140, 500 - 140), 0);
    const tri = [{ x: 0, y: -100 }, { x: 100, y: 80 }, { x: -100, y: 80 }].map((p) => ({ position: [p.x, p.y], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' }));
    const p = createPolygonLayer('p', 1200, 500, tri, true, [1, 1, 1, 0.1], 100); p.id = 'p';
    p.glass = G.applyShapeGlassInput(undefined, {});
    const rp = resolvedOf(compWith(p), 'p');
    const mp = G.glassOutlineMask(rp.shape, rp.transform);
    assert.ok(mp && Array.isArray(mp.vertices), 'a freeform outline');
    assert.ok(covAt([mp], 1200, 520) > 0.99, 'centroid covered');
    assert.ok(covAt([mp], 1200 + 95, 500 - 90) < 0.01, 'outside the slanted edge');
  });

  // 5. The synthesized pass.
  check('glassAdjustmentLayer: an adjustment pass "<id>#glass" with the gaussian blur, the backdrop filters, the outline first then the shape masks', () => {
    const l = pill({ glass: G.applyShapeGlassInput(undefined, { blur: 30, brightness: -0.12, saturation: 0.2 }) });
    const P = (v) => ({ id: 'p' + Math.random(), name: 'p', defaultValue: v, keyframes: [], type: Array.isArray(v) ? 'vector2' : 'number' });
    l.masks = [{ id: 'mk', type: 'rectangle', enabled: true, inverted: false, mode: 'intersect', name: 'm', opacity: P(1), feather: P(0), position: P([960, 540]), size: P([400, 400]), rotation: P(0), points: 5, innerRadius: P(0.5) }];
    assert.equal(resolvedOf(compWith(l), 'pill').masks.length, 1, 'the shape mask resolves');
    const r = resolvedOf(compWith(l), 'pill');
    const pass = G.glassAdjustmentLayer(r);
    assert.equal(pass.id, 'pill#glass');
    assert.equal(pass.layerType, 'adjustment');
    assert.equal(pass.blur.type, 'gaussian');
    assert.equal(pass.blur.radius, 30);
    assert.equal(pass.adjustment.filters.brightness, -0.12);
    assert.equal(pass.adjustment.filters.saturation, 0.2);
    assert.equal(pass.adjustment.noOp, false);
    assert.equal(pass.masks[0].mode, 'add');
    assert.equal(pass.masks.length, 1 + (r.masks ? r.masks.length : 0));
    assert.deepEqual(pass.adjustment.glass, { refraction: r.glass.refraction, edgeWidth: r.glass.edgeWidth, highlight: r.glass.highlight, lightAngle: r.glass.lightAngle });
  });
  check('glassAdjustmentLayer: null without glass, on 3D / corner-pinned / matte layers, at opacity 0', () => {
    const r = resolvedOf(compWith(pill({ glass: G.applyShapeGlassInput(undefined, {}) })), 'pill');
    assert.ok(G.glassAdjustmentLayer(r));
    assert.equal(G.glassAdjustmentLayer({ ...r, glass: undefined }), null);
    assert.equal(G.glassAdjustmentLayer({ ...r, is3D: true }), null);
    assert.equal(G.glassAdjustmentLayer({ ...r, cornerPin: { topLeft: [0, 0], topRight: [1, 0], bottomRight: [1, 1], bottomLeft: [0, 1] } }), null);
    assert.equal(G.glassAdjustmentLayer({ ...r, consumedAsMatte: true }), null);
    assert.equal(G.glassAdjustmentLayer({ ...r, transform: { ...r.transform, opacity: 0 } }), null);
  });

  // 6. The mix step (CPU twin of the WGSL branch).
  const params = { refraction: 10, edgeWidth: 16, highlight: 0.5, lightAngle: -90 };
  const below = [0.2, 0.3, 0.4, 1];
  const fxConst = () => [0.6, 0.6, 0.6, 1];
  check('glassMixPixel: outside the outline the pixel is the untouched composite (exact); deep inside it is the blurred backdrop at the same point, unlit', () => {
    const out = G.glassMixPixel(below, fxConst, 10.5, 10.5, { alpha: 0, sd: 5, gx: 1, gy: 0 }, 1, params);
    assert.deepEqual(out, below);
    let sampledAt = null;
    const fx = (x, y) => { sampledAt = [x, y]; return [0.6, 0.5, 0.4, 1]; };
    const deep = G.glassMixPixel(below, fx, 100.5, 50.5, { alpha: 1, sd: -40, gx: 0, gy: -1 }, 1, params);
    assert.deepEqual(sampledAt, [100.5, 50.5], 'no bend beyond edgeWidth');
    assert.deepEqual(deep, [0.6, 0.5, 0.4, 1], 'no highlight beyond edgeWidth');
  });
  check('glassMixPixel: on the rim the backdrop is sampled refraction px further out along the outward normal (rim^2 falloff inward)', () => {
    let at = null;
    const fx = (x, y) => { at = [x, y]; return [0.5, 0.5, 0.5, 1]; };
    G.glassMixPixel(below, fx, 200.5, 100.5, { alpha: 1, sd: 0, gx: 0, gy: -1 }, 1, params);
    assert.ok(Math.abs(at[0] - 200.5) < 1e-9 && Math.abs(at[1] - (100.5 - 10)) < 1e-9, JSON.stringify(at));
    G.glassMixPixel(below, fx, 200.5, 100.5, { alpha: 1, sd: -8, gx: 0, gy: -1 }, 1, params);
    assert.ok(Math.abs(at[1] - (100.5 - 10 * 0.25)) < 1e-9, `half-way in: rim 0.5 -> bend 2.5 (${at[1]})`);
  });
  check('glassMixPixel: the rim facing lightAngle is lit, the opposite rim gets the softer back light, the sides none; opacity scales the mix', () => {
    const lit = (gx, gy) => G.glassMixPixel(below, fxConst, 0.5, 0.5, { alpha: 1, sd: -1, gx, gy }, 1, params)[0];
    const top = lit(0, -1), bottom = lit(0, 1), side = lit(1, 0);
    assert.ok(top > bottom && bottom > side, `${top} > ${bottom} > ${side}`);
    assert.ok(Math.abs(side - 0.6) < 1e-9, 'a normal perpendicular to the light gets no highlight');
    const rim = 1 - 1 / 16, r4 = rim ** 4;
    assert.ok(Math.abs(top - (0.6 + 0.5 * r4)) < 1e-9 && Math.abs(bottom - (0.6 + 0.5 * r4 * G.GLASS_BACK_RIM)) < 1e-9);
    const half = G.glassMixPixel(below, fxConst, 0.5, 0.5, { alpha: 1, sd: -40, gx: 0, gy: 0 }, 0.5, params);
    assert.ok(Math.abs(half[0] - (0.2 + (0.6 - 0.2) * 0.5)) < 1e-9);
  });
  check('glassMixPixel on the real outline field: walking out of the pill top edge, k falls 1 -> 0 and the bend points up (outward)', () => {
    const r = resolvedOf(compWith(pill({ glass: G.applyShapeGlassInput(undefined, {}) })), 'pill');
    const m = G.glassOutlineMask(r.shape, r.transform);
    const f1 = fieldAt([m], 960.5, 540 - 75 + 4.5, 16);
    assert.ok(f1.alpha > 0.99 && f1.sd < 0 && f1.gy < -0.99, JSON.stringify(f1));
    const f2 = fieldAt([m], 960.5, 540 - 75 - 3.5, 16);
    assert.ok(f2.alpha < 0.01, JSON.stringify(f2));
    let at = null;
    G.glassMixPixel(below, (x, y) => { at = [x, y]; return [0, 0, 0, 1]; }, 960.5, 469.5, f1, 1, { ...params, refraction: 12 });
    assert.ok(at[1] < 469.5, 'samples above the pixel: the scene outside the edge is pulled in');
  });

  console.log(`\n${passed} checks passed.`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
