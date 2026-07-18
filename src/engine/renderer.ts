import type { RenderFrame, ResolvedLayer, ResolvedMask, ResolvedFill, ResolvedPattern, ResolvedEffect, Background } from '../core/types';
import { MAX_PRECOMP_DEPTH } from '../core/precomp';

/** Options for a recursive precomp render into an offscreen target texture. */
interface PrecompRenderOpts {
  depth?: number;
  targetView?: GPUTextureView;
  targetW?: number;
  targetH?: number;
  clearAlpha?: number;
}
import { EFFECT_TYPE } from '../core/effects/effectRegistry';
import { renderTextToCanvas, textCacheKey } from './textAtlas';
import { mediaAssetManager } from './media/assetManager';
import { tessellatePathCached, PATH_FLOATS_PER_VERTEX, getPathTessellationStats } from './pathTessellation';
import { LruCache } from './cache/lruCache';
import { RenderTree, type RenderTreeStats } from './cache/renderTree';
import { particleRenderer } from './particleRenderer';
import { fieldSampledRenderer } from '../field-sampling/renderer';
import { lottieRendererEngine } from './lottieRenderer';
import { videoTextureCache } from './video/videoTextureCache';
import { frameScheduler } from './video/frameScheduler';

const BG_MAX_LAYERS = 10;
const BG_MAX_STOPS = 4;
// Flat vec4 buffer: 1 header vec4 + 10 vec4 per layer (2 params + 4 stops * 2 vec4) = 101 vec4s
const BG_UNIFORM_SIZE = (1 + BG_MAX_LAYERS * 10) * 16; // 101 * 16 = 1616 bytes

const BG_SHADER = /* wgsl */ `
// Flat buffer: [numLayers, 0, 0, 0] then per layer:
// vec4[0]: type, enabled, opacity, blendMode
// vec4[1]: angle, centerX, centerY, radius
// vec4[2..9]: 4 stops x 2 vec4 each: (r, g, b, position), (opacity, 0, 0, 0)

const MAX_LAYERS: i32 = ${BG_MAX_LAYERS};
const MAX_STOPS: i32 = ${BG_MAX_STOPS};

@group(0) @binding(0) var<uniform> buf: array<vec4f, ${1 + BG_MAX_LAYERS * 10}>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOutput {
  var pos = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0),
    vec2f( 1.0, -1.0),
    vec2f( 1.0,  1.0),
  );
  let p = pos[vi];
  var out: VertexOutput;
  out.position = vec4f(p, 0.0, 1.0);
  out.uv = p * 0.5 + 0.5;
  return out;
}

fn getLayerBase(layerIdx: i32) -> i32 {
  return 1 + layerIdx * 10;
}

fn evaluateGradient(layerIdx: i32, uv: vec2f) -> vec4f {
  let base = getLayerBase(layerIdx);
  let params0 = buf[base];     // type, enabled, opacity, blendMode
  let params1 = buf[base + 1]; // angle, centerX, centerY, radius

  let lt = i32(params0.x);
  let opacity = params0.z;

  if (lt == 0) {
    // Solid: use first stop color
    let stopData = buf[base + 2]; // r, g, b, position
    let stopMeta = buf[base + 3]; // opacity, 0, 0, 0
    return vec4f(stopData.rgb, stopMeta.x * opacity);
  }

  var t: f32 = 0.0;
  if (lt == 1) {
    // Linear gradient
    let rad = params1.x * 3.14159265 / 180.0;
    let dir = vec2f(cos(rad), sin(rad));
    let centered = uv - vec2f(0.5);
    t = dot(centered, dir) + 0.5;
    t = clamp(t, 0.0, 1.0);
  } else {
    // Radial gradient
    let center = vec2f(params1.y, params1.z);
    let radius = params1.w;
    let dist = length(uv - center);
    t = clamp(dist / max(radius, 0.001), 0.0, 1.0);
  }

  // Find surrounding stops
  var prevIdx = 0;
  var prevPos: f32 = 0.0;
  var nextIdx = 0;

  for (var i = 0; i < MAX_STOPS; i++) {
    let stopBase = base + 2 + i * 2;
    let pos = buf[stopBase].w;
    if (pos <= t) {
      prevIdx = i;
      prevPos = pos;
    }
  }
  nextIdx = min(prevIdx + 1, MAX_STOPS - 1);

  let prevBase = base + 2 + prevIdx * 2;
  let nextBase = base + 2 + nextIdx * 2;

  let prevColor = buf[prevBase].rgb;
  let prevPosition = buf[prevBase].w;
  let prevOpacity = buf[prevBase + 1].x;

  let nextColor = buf[nextBase].rgb;
  let nextPosition = buf[nextBase].w;
  let nextOpacity = buf[nextBase + 1].x;

  var color: vec3f;
  var alpha: f32;

  if (prevIdx == nextIdx) {
    color = prevColor;
    alpha = prevOpacity;
  } else {
    let range = nextPosition - prevPosition;
    let localT = select(0.0, (t - prevPosition) / range, range > 0.0001);
    let smoothT = localT * localT * (3.0 - 2.0 * localT);
    color = mix(prevColor, nextColor, smoothT);
    alpha = mix(prevOpacity, nextOpacity, smoothT);
  }

  return vec4f(color, alpha * opacity);
}

fn blendColors(base: vec4f, over: vec4f, mode: i32) -> vec4f {
  if (over.a <= 0.0) { return base; }

  let src = over.rgb;
  let dst = base.rgb;
  var result: vec3f;

  switch(mode) {
    case 0: { result = src; }
    case 1: { result = src * dst; }
    case 2: { result = 1.0 - (1.0 - src) * (1.0 - dst); }
    case 3: {
      let r = select(1.0 - 2.0 * (1.0 - src.r) * (1.0 - dst.r), 2.0 * src.r * dst.r, dst.r < 0.5);
      let g = select(1.0 - 2.0 * (1.0 - src.g) * (1.0 - dst.g), 2.0 * src.g * dst.g, dst.g < 0.5);
      let b = select(1.0 - 2.0 * (1.0 - src.b) * (1.0 - dst.b), 2.0 * src.b * dst.b, dst.b < 0.5);
      result = vec3f(r, g, b);
    }
    case 4: {
      let r = select((1.0 - 2.0 * (1.0 - src.r)) * dst.r + dst.r * dst.r * (2.0 * (1.0 - src.r)), 2.0 * src.r * dst.r + dst.r * dst.r * (1.0 - 2.0 * src.r), src.r < 0.5);
      let g = select((1.0 - 2.0 * (1.0 - src.g)) * dst.g + dst.g * dst.g * (2.0 * (1.0 - src.g)), 2.0 * src.g * dst.g + dst.g * dst.g * (1.0 - 2.0 * src.g), src.g < 0.5);
      let b = select((1.0 - 2.0 * (1.0 - src.b)) * dst.b + dst.b * dst.b * (2.0 * (1.0 - src.b)), 2.0 * src.b * dst.b + dst.b * dst.b * (1.0 - 2.0 * src.b), src.b < 0.5);
      result = vec3f(r, g, b);
    }
    case 5: { result = clamp(src + dst, vec3f(0.0), vec3f(1.0)); }
    case 6: { result = min(src, dst); }
    case 7: { result = max(src, dst); }
    default: { result = src; }
  }

  let outRgb = mix(dst, result, over.a);
  let outAlpha = over.a + base.a * (1.0 - over.a);
  return vec4f(outRgb, outAlpha);
}

@fragment
fn fs(in: VertexOutput) -> @location(0) vec4f {
  let uv = vec2f(in.uv.x, 1.0 - in.uv.y);
  var color = vec4f(0.0, 0.0, 0.0, 1.0);
  let count = i32(buf[0].x);

  for (var i = 0; i < MAX_LAYERS; i++) {
    if (i >= count) { break; }
    let base = getLayerBase(i);
    let enabled = buf[base].y;
    if (enabled < 0.5) { continue; }
    let layerColor = evaluateGradient(i, uv);
    let blendModeInt = i32(buf[base].w);
    color = blendColors(color, layerColor, blendModeInt);
  }

  return color;
}
`;

const MASK_WGSL = /* wgsl */ `
fn mask_starSDF(p: vec2f, points: f32, outerR: f32, innerR: f32) -> f32 {
  let n = max(points, 3.0);
  let an = 3.14159265 / n;
  let en = 3.14159265 / n;
  let acs = vec2f(cos(an), sin(an));
  let ecs = vec2f(cos(en), sin(en));
  var q = vec2f(abs(p.x), p.y);
  let angle = atan2(q.y, q.x);
  let sector = floor(angle / (2.0 * an) + 0.5);
  let sectorAngle = sector * 2.0 * an;
  let cosA = cos(sectorAngle);
  let sinA = sin(sectorAngle);
  q = vec2f(q.x * cosA + q.y * sinA, -q.x * sinA + q.y * cosA);
  q = q - vec2f(outerR, 0.0);
  let innerDir = vec2f(innerR * ecs.x - outerR, innerR * ecs.y);
  let edgeDir = normalize(innerDir);
  let proj = dot(q, edgeDir);
  let clamped = clamp(proj, 0.0, length(innerDir));
  let closest = edgeDir * clamped;
  let d = length(q - closest);
  let side = sign(q.x * edgeDir.y - q.y * edgeDir.x);
  return d * side;
}

fn mask_ngonSDF(p: vec2f, r: f32, n: f32) -> f32 {
  let nn = max(n, 3.0);
  let an = 3.14159265 / nn;
  let acs = vec2f(cos(an), sin(an));
  let bn = atan2(p.x, p.y);
  let m = bn - 2.0 * an * floor(bn / (2.0 * an) + 0.5);
  var q = length(p) * vec2f(cos(m), abs(sin(m)));
  q = q - r * acs;
  q.y = q.y + clamp(-q.y, 0.0, r * acs.y);
  return length(q) * sign(q.x);
}

fn mask_ellipseSDF(p: vec2f, ab: vec2f) -> f32 {
  let k1 = length(p / ab);
  let k2 = length(p / (ab * ab));
  return k1 * (k1 - 1.0) / max(k2, 0.0001);
}

fn computeMaskAlpha(world: vec2f, mParams: vec4f, mCenter: vec2f, mSize: vec2f, mRot: f32, mPoints: f32, mInner: f32) -> f32 {
  let mtype = i32(mParams.x + 0.5);
  if (mtype == 0) { return 1.0; }
  let rel = world - mCenter;
  let c = cos(-mRot);
  let s = sin(-mRot);
  let p = vec2f(rel.x * c - rel.y * s, rel.x * s + rel.y * c);
  var d: f32;
  if (mtype == 1) {
    let q = abs(p) - mSize;
    d = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0);
  } else if (mtype == 2) {
    d = mask_ellipseSDF(p, max(mSize, vec2f(0.001)));
  } else if (mtype == 3) {
    d = mask_starSDF(p, mPoints, mSize.x, mInner);
  } else {
    d = mask_ngonSDF(p, mSize.x, mPoints);
  }
  let feather = max(mParams.w, 0.001);
  var a = 1.0 - smoothstep(-feather, feather, d);
  if (mParams.y > 0.5) { a = 1.0 - a; }
  let mOpacity = mParams.z;
  return 1.0 - mOpacity * (1.0 - a);
}

fn computeMaskStackAlpha(world: vec2f, maskCount: i32, masks: array<MaskSlot, 8>) -> f32 {
  if (maskCount <= 0) { return 1.0; }
  var alpha = 1.0;
  for (var i = 0; i < maskCount; i = i + 1) {
    let m = masks[i];
    let a = computeMaskAlpha(world, m.params, m.center, m.size, m.rot, m.points, m.inner);
    alpha = alpha * a;
  }
  return alpha;
}
`;

const RECT_SHADER = /* wgsl */ `
struct MaskSlot {
  params: vec4f,
  center: vec2f,
  size: vec2f,
  rot: f32,
  points: f32,
  inner: f32,
  _pad: f32,
}

const FILL_MAX_LAYERS: i32 = 8;
const FILL_MAX_STOPS: i32 = 8;
const FILL_STRIDE: i32 = 64;   // FILL_MAX_LAYERS * FILL_MAX_STOPS (stops per fill)

struct Uniforms {
  resolution: vec2f,
  rectPos: vec2f,
  rectSize: vec2f,
  anchorPoint: vec2f,
  rotation: f32,
  opacity: f32,
  borderRadius: f32,
  shapeType: f32,
  shapeParams: vec4f,
  strokeWidth: f32,
  maskCount: f32,
  _pad1: f32,
  _pad2: f32,
  masks: array<MaskSlot, 8>,
  // Fill data. Index 0 = fill, 1 = stroke. Each supports up to 8 gradient
  // layers composited with blend modes (matching the DOM preview) and up to
  // 8 stops per layer. Solid fills set fHeader.x = 0 and use fSolid.
  fHeader: array<vec4f, 2>,    // per fill: (kind, layerCount, _, _)
  fSolid: array<vec4f, 2>,     // per fill: solid / fallback rgba
  fMeta: array<vec4f, 16>,     // per (fill,layer): (gradientType, angle, cx, cy)
  fMeta2: array<vec4f, 16>,    // per (fill,layer): (blendMode, stopCount, _, _)
  fColors: array<vec4f, 128>,  // per (fill,layer,stop): rgba
  fPos: array<vec4f, 32>,      // per (fill,layer,stop): position, packed 4/vec4
  // Pattern fill (built-in analytic patterns). patA.x = 0 disables it.
  patA: vec4f,                 // (enabled, patternType, tile, angle)
  patB: vec4f,                 // (markSize, opacity, hasBackground, _)
  patColor: vec4f,             // mark rgb
  patBg: vec4f,                // background rgb
}

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) worldPos: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOutput {
  var pos = array<vec2f, 6>(
    vec2f(0.0, 0.0),
    vec2f(1.0, 0.0),
    vec2f(0.0, 1.0),
    vec2f(0.0, 1.0),
    vec2f(1.0, 0.0),
    vec2f(1.0, 1.0),
  );

  let p = pos[vi];
  let local = (p - vec2f(0.5)) * u.rectSize;

  let pivot = u.anchorPoint;
  let rel = local - pivot;
  let cosR = cos(u.rotation);
  let sinR = sin(u.rotation);
  let rotated = vec2f(
    rel.x * cosR - rel.y * sinR,
    rel.x * sinR + rel.y * cosR,
  );
  let worldPos = rotated + pivot + u.rectPos;

  let ndc = vec2f(
    (worldPos.x / u.resolution.x) * 2.0 - 1.0,
    1.0 - (worldPos.y / u.resolution.y) * 2.0,
  );

  var out: VertexOutput;
  out.position = vec4f(ndc, 0.0, 1.0);
  out.uv = p;
  out.worldPos = worldPos;
  return out;
}

fn roundedBoxSDF(p: vec2f, size: vec2f, radius: f32) -> f32 {
  let q = abs(p) - size + vec2f(radius);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - radius;
}

fn circleSDF(p: vec2f, r: f32) -> f32 {
  return length(p) - r;
}

fn starSDF(p: vec2f, points: f32, outerR: f32, innerR: f32) -> f32 {
  let n = max(points, 3.0);
  let an = 3.14159265 / n;
  let en = 3.14159265 / n;
  let acs = vec2f(cos(an), sin(an));
  let ecs = vec2f(cos(en), sin(en));

  var q = vec2f(abs(p.x), p.y);
  let angle = atan2(q.y, q.x);
  let sector = floor(angle / (2.0 * an) + 0.5);
  let sectorAngle = sector * 2.0 * an;
  let cosA = cos(sectorAngle);
  let sinA = sin(sectorAngle);
  q = vec2f(q.x * cosA + q.y * sinA, -q.x * sinA + q.y * cosA);

  q = q - vec2f(outerR, 0.0);
  let dir = normalize(vec2f(-acs.y, acs.x));
  let innerDir = vec2f(innerR * ecs.x - outerR, innerR * ecs.y);
  let edgeDir = normalize(innerDir);
  let proj = dot(q, edgeDir);
  let clamped = clamp(proj, 0.0, length(innerDir));
  let closest = edgeDir * clamped;
  let d = length(q - closest);
  let side = sign(q.x * edgeDir.y - q.y * edgeDir.x);
  return d * side;
}

${MASK_WGSL}

// ── Gradient fill evaluation ──────────────────────────────────────────────
// Separable blend modes per the W3C Compositing spec, evaluated per channel.
// The mode index matches MaterialBlendMode order (see material.ts).
fn blendChannel(mode: i32, cb: f32, cs: f32) -> f32 {
  if (mode == 1) { return cb * cs; }                         // multiply
  if (mode == 2) { return cb + cs - cb * cs; }               // screen
  if (mode == 3) {                                           // overlay = hardLight(cs, cb)
    if (cb <= 0.5) { return 2.0 * cb * cs; }
    return 1.0 - 2.0 * (1.0 - cb) * (1.0 - cs);
  }
  if (mode == 4) { return min(cb, cs); }                     // darken
  if (mode == 5) { return max(cb, cs); }                     // lighten
  if (mode == 6) {                                           // color-dodge
    if (cs >= 1.0) { return 1.0; }
    return min(1.0, cb / (1.0 - cs));
  }
  if (mode == 7) {                                           // color-burn
    if (cs <= 0.0) { return 0.0; }
    return 1.0 - min(1.0, (1.0 - cb) / cs);
  }
  if (mode == 8) {                                           // hard-light
    if (cs <= 0.5) { return 2.0 * cs * cb; }
    return 1.0 - 2.0 * (1.0 - cs) * (1.0 - cb);
  }
  if (mode == 9) {                                           // soft-light
    if (cs <= 0.5) {
      return cb - (1.0 - 2.0 * cs) * cb * (1.0 - cb);
    }
    var d: f32;
    if (cb <= 0.25) { d = ((16.0 * cb - 12.0) * cb + 4.0) * cb; }
    else { d = sqrt(cb); }
    return cb + (2.0 * cs - 1.0) * (d - cb);
  }
  if (mode == 10) { return abs(cb - cs); }                   // difference
  if (mode == 11) { return cb + cs - 2.0 * cb * cs; }        // exclusion
  return cs;                                                 // normal
}

fn blendRGB(mode: i32, cb: vec3f, cs: vec3f) -> vec3f {
  if (mode == 0) { return cs; }
  return vec3f(
    blendChannel(mode, cb.r, cs.r),
    blendChannel(mode, cb.g, cs.g),
    blendChannel(mode, cb.b, cs.b),
  );
}

// Position along a gradient in 0..1. Linear uses the CSS gradient-line formula
// (0deg points toward the top); radial uses a circle with farthest-corner
// extent. boxSize is the shape's bounding box in pixels.
fn gradientT(gType: i32, angle: f32, center: vec2f, uv: vec2f, boxSize: vec2f) -> f32 {
  let localPos = (uv - vec2f(0.5)) * boxSize;
  if (gType == 1) {
    let centerPix = (center - vec2f(0.5)) * boxSize;
    let dv = localPos - centerPix;
    let cxk = max(abs(boxSize.x * 0.5 - centerPix.x), abs(-boxSize.x * 0.5 - centerPix.x));
    let cyk = max(abs(boxSize.y * 0.5 - centerPix.y), abs(-boxSize.y * 0.5 - centerPix.y));
    let maxDist = max(length(vec2f(cxk, cyk)), 1e-4);
    return clamp(length(dv) / maxDist, 0.0, 1.0);
  }
  let d = vec2f(sin(angle), -cos(angle));
  let denom = max(abs(boxSize.x * d.x) + abs(boxSize.y * d.y), 1e-4);
  return clamp(0.5 + dot(localPos, d) / denom, 0.0, 1.0);
}

// Stop positions are packed 4 per vec4. localG is the stop index within the
// fill (layer * FILL_MAX_STOPS + stop), fi selects fill (0) vs stroke (1).
fn readFillPos(fi: i32, localG: i32) -> f32 {
  let g = fi * FILL_STRIDE + localG;
  let v = u.fPos[g >> 2];
  let c = g & 3;
  if (c == 0) { return v.x; }
  if (c == 1) { return v.y; }
  if (c == 2) { return v.z; }
  return v.w;
}

fn sampleGradientLayer(fi: i32, layer: i32, uv: vec2f, boxSize: vec2f) -> vec4f {
  let m = u.fMeta[fi * FILL_MAX_LAYERS + layer];
  let m2 = u.fMeta2[fi * FILL_MAX_LAYERS + layer];
  let stopCount = i32(m2.y);
  let cbase = fi * FILL_STRIDE + layer * FILL_MAX_STOPS;
  if (stopCount <= 1) { return u.fColors[cbase]; }

  let t = gradientT(i32(m.x), m.y, vec2f(m.z, m.w), uv, boxSize);
  let sbase = layer * FILL_MAX_STOPS;
  if (t <= readFillPos(fi, sbase)) { return u.fColors[cbase]; }
  for (var s: i32 = 0; s < stopCount - 1; s = s + 1) {
    let pa = readFillPos(fi, sbase + s);
    let pb = readFillPos(fi, sbase + s + 1);
    if (t <= pb) {
      let k = clamp((t - pa) / max(pb - pa, 1e-5), 0.0, 1.0);
      return mix(u.fColors[cbase + s], u.fColors[cbase + s + 1], k);
    }
  }
  return u.fColors[cbase + stopCount - 1];
}

// Composite a fill's gradient layers (straight-alpha, W3C blend + source-over),
// matching how the DOM preview stacks background layers: index 0 is topmost.
fn sampleFill(fi: i32, uv: vec2f, boxSize: vec2f) -> vec4f {
  if (i32(u.fHeader[fi].x) == 0) { return u.fSolid[fi]; }
  let layerCount = i32(u.fHeader[fi].y);

  var accRGB = vec3f(0.0);
  var accA = 0.0;
  for (var li: i32 = 0; li < FILL_MAX_LAYERS; li = li + 1) {
    if (li >= layerCount) { break; }
    let idx = layerCount - 1 - li;   // composite bottom-up
    let src = sampleGradientLayer(fi, idx, uv, boxSize);
    let mode = i32(u.fMeta2[fi * FILL_MAX_LAYERS + idx].x);
    let blended = mix(src.rgb, blendRGB(mode, accRGB, src.rgb), accA);
    let sa = src.a;
    let outA = sa + accA * (1.0 - sa);
    var outRGB = vec3f(0.0);
    if (outA > 0.0) {
      outRGB = (blended * sa + accRGB * accA * (1.0 - sa)) / outA;
    }
    accRGB = outRGB;
    accA = outA;
  }
  return vec4f(accRGB, accA);
}

// ── Pattern fill evaluation ───────────────────────────────────────────────
fn segDist(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

// Coverage (0..1) of a pattern mark at content-space point cr within one tile,
// mirroring the SVG geometry in material.ts (tile = size + spacing).
fn patternCoverage(ptype: i32, cr: vec2f, tile: f32, s: f32, aa: f32) -> f32 {
  let half = s * 0.5;
  let c = tile * 0.5;
  if (ptype == 0) {
    // dots: circle radius s/2 at tile center
    return 1.0 - smoothstep(half - aa, half + aa, length(cr - vec2f(c)));
  }
  if (ptype == 1) {
    // horizontal line, stroke width s at y = tile/2
    return 1.0 - smoothstep(half - aa, half + aa, abs(cr.y - c));
  }
  if (ptype == 2) {
    // grid: horizontal + vertical lines, stroke width max(1, s/2)
    let hw = max(1.0, s * 0.5) * 0.5;
    let h = 1.0 - smoothstep(hw - aa, hw + aa, abs(cr.y - c));
    let v = 1.0 - smoothstep(hw - aa, hw + aa, abs(cr.x - c));
    return max(h, v);
  }
  if (ptype == 3) {
    // diagonal segment (0,tile)-(tile,0), stroke width s
    return 1.0 - smoothstep(half - aa, half + aa, segDist(cr, vec2f(0.0, tile), vec2f(tile, 0.0)));
  }
  if (ptype == 4) {
    // chevron polyline (0,t/2)-(t/2,0)-(t,t/2), stroke width s
    let d = min(
      segDist(cr, vec2f(0.0, c), vec2f(c, 0.0)),
      segDist(cr, vec2f(c, 0.0), vec2f(tile, c)),
    );
    return 1.0 - smoothstep(half - aa, half + aa, d);
  }
  return 0.0;
}

// Straight-alpha pattern color at pixel p (shape-local px). Tiles by size+spacing
// and rotates the tile content around its center, matching the SVG.
fn samplePattern(p: vec2f, aa: f32) -> vec4f {
  if (u.patA.x < 0.5) { return vec4f(0.0); }
  let tile = max(u.patA.z, 1.0);
  let angle = u.patA.w;
  let opacity = u.patB.y;

  let cell = fract(p / tile) * tile;
  let cen = vec2f(tile * 0.5);
  let ca = cos(-angle);
  let sa = sin(-angle);
  let rel = cell - cen;
  let cr = vec2f(rel.x * ca - rel.y * sa, rel.x * sa + rel.y * ca) + cen;

  let cov = patternCoverage(i32(u.patA.y), cr, tile, u.patB.x, aa);
  if (u.patB.z > 0.5) {
    // Opaque tile background with marks composited on top.
    return vec4f(mix(u.patBg.rgb, u.patColor.rgb, cov), opacity);
  }
  return vec4f(u.patColor.rgb, cov * opacity);
}

@fragment
fn fs(in: VertexOutput) -> @location(0) vec4f {
  let localUV = (in.uv - vec2f(0.5)) * u.rectSize;
  let halfSize = u.rectSize * 0.5;
  let st = i32(u.shapeType);
  var dist: f32;

  if (st == 1) {
    // Circle
    let r = min(halfSize.x, halfSize.y);
    dist = circleSDF(localUV, r);
  } else if (st == 2) {
    // Star
    dist = starSDF(localUV, u.shapeParams.x, u.shapeParams.y, u.shapeParams.z);
  } else {
    // Rectangle (default, also polygon fallback)
    dist = roundedBoxSDF(localUV, halfSize, u.borderRadius);
  }

  let aa = fwidth(dist);

  // Circle/star quads are expanded 1.1x for SDF margin (see fillLayerData);
  // undo that so gradients map to the true shape box.
  var expansion = 1.0;
  if (st == 1 || st == 2) { expansion = 1.1; }
  let boxSize = u.rectSize / expansion;

  // Fill
  let fillC = sampleFill(0, in.uv, boxSize);
  var baseRGB = fillC.rgb;
  var baseA = fillC.a;

  // Pattern overlay (composited over the fill, clipped to the shape below).
  let pPat = in.uv * u.rectSize;
  let pAA = max(fwidth(pPat.x), fwidth(pPat.y));
  let pat = samplePattern(pPat, pAA);
  if (pat.a > 0.0) {
    let outA = pat.a + baseA * (1.0 - pat.a);
    if (outA > 0.0) {
      baseRGB = (pat.rgb * pat.a + baseRGB * baseA * (1.0 - pat.a)) / outA;
    }
    baseA = outA;
  }

  let fillAlpha = 1.0 - smoothstep(-aa, aa, dist);
  var color = vec4f(baseRGB, baseA * u.opacity * fillAlpha);

  // Stroke
  if (u.strokeWidth > 0.0) {
    let strokeC = sampleFill(1, in.uv, boxSize);
    if (strokeC.a > 0.0) {
      let strokeOuter = 1.0 - smoothstep(-aa, aa, dist - u.strokeWidth * 0.5);
      let strokeInner = 1.0 - smoothstep(-aa, aa, -(dist + u.strokeWidth * 0.5));
      let strokeAlpha = strokeOuter * strokeInner;
      let sc = vec4f(strokeC.rgb, strokeC.a * u.opacity * strokeAlpha);
      color = vec4f(mix(color.rgb, sc.rgb, sc.a), max(color.a, sc.a));
    }
  }

  let mA = computeMaskStackAlpha(in.worldPos, i32(u.maskCount + 0.5), u.masks);
  return vec4f(color.rgb, color.a * mA);
}
`; const TEXT_SHADER = /* wgsl */ `
struct MaskSlot {
  params: vec4f,
  center: vec2f,
  size: vec2f,
  rot: f32,
  points: f32,
  inner: f32,
  _pad: f32,
}

struct TextUniforms {
  resolution: vec2f,
  quadPos: vec2f,
  quadSize: vec2f,
  anchorPoint: vec2f,
  rotation: f32,
  opacity: f32,
  maskCount: f32,
  _pad1: f32,
  masks: array<MaskSlot, 8>,
}

@group(0) @binding(0) var<uniform> u: TextUniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var texData: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) worldPos: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOutput {
  var pos = array<vec2f, 6>(
    vec2f(0.0, 0.0),
    vec2f(1.0, 0.0),
    vec2f(0.0, 1.0),
    vec2f(0.0, 1.0),
    vec2f(1.0, 0.0),
    vec2f(1.0, 1.0),
  );

  let p = pos[vi];
  let local = (p - vec2f(0.5)) * u.quadSize;

  let pivot = u.anchorPoint;
  let rel = local - pivot;
  let cosR = cos(u.rotation);
  let sinR = sin(u.rotation);
  let rotated = vec2f(
    rel.x * cosR - rel.y * sinR,
    rel.x * sinR + rel.y * cosR,
  );
  let worldPos = rotated + pivot + u.quadPos;

  let ndc = vec2f(
    (worldPos.x / u.resolution.x) * 2.0 - 1.0,
    1.0 - (worldPos.y / u.resolution.y) * 2.0,
  );

  var out: VertexOutput;
  out.position = vec4f(ndc, 0.0, 1.0);
  out.uv = p;
  out.worldPos = worldPos;
  return out;
}

${MASK_WGSL}

@fragment
fn fs(in: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(texData, texSampler, in.uv);
  let mA = computeMaskStackAlpha(in.worldPos, i32(u.maskCount + 0.5), u.masks);
  return vec4f(color.rgb, color.a * u.opacity * mA);
}
`;

const UNIFORM_ALIGN = 512;
const MAX_LAYERS = 512;
// The shape (rect/circle/star) uniform carries per-shape gradient fill + stroke
// data plus a pattern block, so it has its own larger stride, independent of the
// other pipelines. Layout (bytes): base 80 + masks 384 + fill/stroke arrays 3136
// + pattern 64 = 3664 (916 f32). The fill/stroke arrays are flat with index
// 0 = fill, 1 = stroke. Aligned up to a 256-byte multiple for dynamic offsets.
const SHAPE_UNIFORM_SIZE = 3664;
const SHAPE_UNIFORM_ALIGN = 3840;
const SHAPE_UNIFORM_FLOATS = 916;
const TEXT_UNIFORM_SIZE = 432;

const IMAGE_SHADER = /* wgsl */ `
struct MaskSlot {
  params: vec4f,
  center: vec2f,
  size: vec2f,
  rot: f32,
  points: f32,
  inner: f32,
  _pad: f32,
}

// One entry in the image effect stack: type + up to 7 params.
struct EffectSlot {
  a: vec4f, // (type, p0, p1, p2)
  b: vec4f, // (p3, p4, p5, p6)
}

struct ImageUniforms {
  resolution: vec2f,
  quadPos: vec2f,
  quadSize: vec2f,
  anchorPoint: vec2f,
  rotation: f32,
  opacity: f32,
  brightness: f32,
  contrast: f32,
  saturation: f32,
  exposure: f32,
  gamma: f32,
  maskCount: f32,
  liftR: f32,
  liftG: f32,
  liftB: f32,
  liftIntensity: f32,
  gammaR: f32,
  gammaG: f32,
  gammaB: f32,
  gammaIntensity: f32,
  gainR: f32,
  gainG: f32,
  gainB: f32,
  gainIntensity: f32,
  masks: array<MaskSlot, 8>,
  // Effect stack appended after masks (mask base index unchanged).
  effectCount: f32,
  effectTime: f32,  // frame number, seeds procedural/noise effects
  _epad1: f32,
  _epad2: f32,
  effects: array<EffectSlot, 16>,
}

@group(0) @binding(0) var<uniform> u: ImageUniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var texData: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) worldPos: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOutput {
  var pos = array<vec2f, 6>(
    vec2f(0.0, 0.0),
    vec2f(1.0, 0.0),
    vec2f(0.0, 1.0),
    vec2f(0.0, 1.0),
    vec2f(1.0, 0.0),
    vec2f(1.0, 1.0),
  );

  let p = pos[vi];
  let local = (p - vec2f(0.5)) * u.quadSize;

  let pivot = u.anchorPoint;
  let rel = local - pivot;
  let cosR = cos(u.rotation);
  let sinR = sin(u.rotation);
  let rotated = vec2f(
    rel.x * cosR - rel.y * sinR,
    rel.x * sinR + rel.y * cosR,
  );
  let worldPos = rotated + pivot + u.quadPos;

  let ndc = vec2f(
    (worldPos.x / u.resolution.x) * 2.0 - 1.0,
    1.0 - (worldPos.y / u.resolution.y) * 2.0,
  );

  var out: VertexOutput;
  out.position = vec4f(ndc, 0.0, 1.0);
  out.uv = p;
  out.worldPos = worldPos;
  return out;
}

fn applyLiftGammaGain(color: vec3f) -> vec3f {
  // Lift (shadows)
  var c = color;
  let liftBias = vec3f(u.liftR, u.liftG, u.liftB) * u.liftIntensity;
  c = c + liftBias * (1.0 - c);

  // Gamma (midtones)
  let gammaBias = vec3f(u.gammaR, u.gammaG, u.gammaB) * u.gammaIntensity;
  let gammaAdj = 1.0 / max(vec3f(1.0) + gammaBias, vec3f(0.01));
  c = pow(max(c, vec3f(0.0)), gammaAdj);

  // Gain (highlights)
  let gainBias = vec3f(u.gainR, u.gainG, u.gainB) * u.gainIntensity;
  c = c * (vec3f(1.0) + gainBias);

  return clamp(c, vec3f(0.0), vec3f(1.0));
}

fn rgb2hsv(c: vec3f) -> vec3f {
  let K = vec4f(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  let p = mix(vec4f(c.bg, K.wz), vec4f(c.gb, K.xy), step(c.b, c.g));
  let q = mix(vec4f(p.xyw, c.r), vec4f(c.r, p.yzx), step(p.x, c.r));
  let d = q.x - min(q.w, q.y);
  let e = 1.0e-10;
  return vec3f(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

fn hsv2rgb(c: vec3f) -> vec3f {
  let K = vec4f(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  let p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, vec3f(0.0), vec3f(1.0)), c.y);
}

fn hash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn valueNoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm(p: vec2f) -> f32 {
  var v = 0.0;
  var amp = 0.5;
  var freq = p;
  for (var i = 0; i < 5; i = i + 1) {
    v = v + amp * valueNoise(freq);
    freq = freq * 2.0;
    amp = amp * 0.5;
  }
  return v;
}

// Nearest Worley/Voronoi feature point to p (searches the 3x3 neighbourhood of
// jittered cell centres). Shared by the cellular warps (crystallize/voronoi/
// facet/pointillize snap the sample UV to it) and the cellular color patterns.
fn voronoiCenter(p: vec2f) -> vec2f {
  let ip = floor(p);
  var best = 1.0e9;
  var bestC = p;
  for (var j = -1; j <= 1; j = j + 1) {
    for (var i = -1; i <= 1; i = i + 1) {
      let cell = ip + vec2f(f32(i), f32(j));
      let o = vec2f(hash21(cell), hash21(cell + vec2f(37.2, 17.1)));
      let cp = cell + o;
      let d = distance(p, cp);
      if (d < best) {
        best = d;
        bestC = cp;
      }
    }
  }
  return bestC;
}

// Snap p to the centre of its pointy-top hexagonal cell via cube-coordinate
// rounding. Used by the hexPixelate warp.
fn hexCenter(p: vec2f) -> vec2f {
  let q = 0.5773502692 * p.x - 0.3333333333 * p.y;
  let rr = 0.6666666667 * p.y;
  let cx = q;
  let cz = rr;
  let cy = -cx - cz;
  var rx = round(cx);
  var ry = round(cy);
  var rz = round(cz);
  let dx = abs(rx - cx);
  let dy = abs(ry - cy);
  let dz = abs(rz - cz);
  if (dx > dy && dx > dz) {
    rx = -ry - rz;
  } else if (dy > dz) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }
  return vec2f(1.7320508076 * (rx + rz * 0.5), 1.5 * rz);
}

// ── Texture-aware helpers (class C single-pass). Layer textures have no mipmaps,
// so textureSampleLevel at LOD 0 is exact and, unlike textureSample, is valid in
// the non-uniform control flow these run under. ──
fn sampleTex(uv: vec2f) -> vec3f {
  return textureSampleLevel(texData, texSampler, uv, 0.0).rgb;
}

fn lumaOf(rgb: vec3f) -> f32 {
  return dot(rgb, vec3f(0.299, 0.587, 0.114));
}

// 3x3 gaussian; pass a scaled texel to widen the blur radius.
fn blur3x3(uv: vec2f, texel: vec2f) -> vec3f {
  var s = sampleTex(uv) * 0.25;
  s = s + sampleTex(uv + vec2f(0.0, -texel.y)) * 0.125;
  s = s + sampleTex(uv + vec2f(0.0, texel.y)) * 0.125;
  s = s + sampleTex(uv + vec2f(-texel.x, 0.0)) * 0.125;
  s = s + sampleTex(uv + vec2f(texel.x, 0.0)) * 0.125;
  s = s + sampleTex(uv + vec2f(-texel.x, -texel.y)) * 0.0625;
  s = s + sampleTex(uv + vec2f(texel.x, -texel.y)) * 0.0625;
  s = s + sampleTex(uv + vec2f(-texel.x, texel.y)) * 0.0625;
  s = s + sampleTex(uv + vec2f(texel.x, texel.y)) * 0.0625;
  return s;
}

// Sobel gradient magnitude on luma over a 3x3 neighbourhood.
fn sobelLuma(uv: vec2f, texel: vec2f) -> f32 {
  let tl = lumaOf(sampleTex(uv + vec2f(-texel.x, -texel.y)));
  let tc = lumaOf(sampleTex(uv + vec2f(0.0, -texel.y)));
  let tr = lumaOf(sampleTex(uv + vec2f(texel.x, -texel.y)));
  let ml = lumaOf(sampleTex(uv + vec2f(-texel.x, 0.0)));
  let mr = lumaOf(sampleTex(uv + vec2f(texel.x, 0.0)));
  let bl = lumaOf(sampleTex(uv + vec2f(-texel.x, texel.y)));
  let bc = lumaOf(sampleTex(uv + vec2f(0.0, texel.y)));
  let br = lumaOf(sampleTex(uv + vec2f(texel.x, texel.y)));
  let gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
  let gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
  return sqrt(gx * gx + gy * gy);
}

// Constant-cost disc ops: sample two concentric rings (+center) scaled by a uv
// radius, so cost is independent of the radius in pixels. Used by the C2
// morphological / matte / blur filters.
fn discBlurRGBA(uv: vec2f, rad: vec2f) -> vec4f {
  var sum = textureSampleLevel(texData, texSampler, uv, 0.0);
  var cnt = 1.0;
  for (var i = 0; i < 12; i = i + 1) {
    let ang = f32(i) * 0.5235988;
    let d = vec2f(cos(ang), sin(ang));
    sum = sum + textureSampleLevel(texData, texSampler, uv + d * rad, 0.0);
    sum = sum + textureSampleLevel(texData, texSampler, uv + d * rad * 0.5, 0.0);
    cnt = cnt + 2.0;
  }
  return sum / cnt;
}

fn discDilate(uv: vec2f, rad: vec2f) -> vec4f {
  var mx = textureSampleLevel(texData, texSampler, uv, 0.0);
  for (var i = 0; i < 8; i = i + 1) {
    let ang = f32(i) * 0.7853982;
    let d = vec2f(cos(ang), sin(ang));
    mx = max(mx, textureSampleLevel(texData, texSampler, uv + d * rad, 0.0));
    mx = max(mx, textureSampleLevel(texData, texSampler, uv + d * rad * 0.5, 0.0));
  }
  return mx;
}

fn discErode(uv: vec2f, rad: vec2f) -> vec4f {
  var mn = textureSampleLevel(texData, texSampler, uv, 0.0);
  for (var i = 0; i < 8; i = i + 1) {
    let ang = f32(i) * 0.7853982;
    let d = vec2f(cos(ang), sin(ang));
    mn = min(mn, textureSampleLevel(texData, texSampler, uv + d * rad, 0.0));
    mn = min(mn, textureSampleLevel(texData, texSampler, uv + d * rad * 0.5, 0.0));
  }
  return mn;
}

// Single-pass approximations of morphological opening (erode then dilate) and
// closing (dilate then erode): per direction erode/dilate against the centre,
// then dilate/erode across directions. Identity at rad 0.
fn morphOpen(uv: vec2f, rad: vec2f) -> vec4f {
  let center = textureSampleLevel(texData, texSampler, uv, 0.0);
  var res = vec4f(0.0);
  for (var i = 0; i < 8; i = i + 1) {
    let ang = f32(i) * 0.7853982;
    let d = vec2f(cos(ang), sin(ang));
    res = max(res, min(center, textureSampleLevel(texData, texSampler, uv + d * rad, 0.0)));
  }
  return res;
}

fn morphClose(uv: vec2f, rad: vec2f) -> vec4f {
  let center = textureSampleLevel(texData, texSampler, uv, 0.0);
  var res = vec4f(1.0);
  for (var i = 0; i < 8; i = i + 1) {
    let ang = f32(i) * 0.7853982;
    let d = vec2f(cos(ang), sin(ang));
    res = min(res, max(center, textureSampleLevel(texData, texSampler, uv + d * rad, 0.0)));
  }
  return res;
}

// Kuwahara edge-preserving smoothing: the mean of whichever of the 4 corner 3x3
// quadrants has the least colour variance — the classic oil-painting operator.
fn kuwahara(uv: vec2f, rad: vec2f) -> vec3f {
  var bestMean = sampleTex(uv);
  var bestVar = 1.0e9;
  for (var q = 0; q < 4; q = q + 1) {
    let sx = select(-1.0, 1.0, q == 1 || q == 3);
    let sy = select(-1.0, 1.0, q == 2 || q == 3);
    var mean = vec3f(0.0);
    var m2 = vec3f(0.0);
    for (var j = 0; j < 3; j = j + 1) {
      for (var i = 0; i < 3; i = i + 1) {
        let s = sampleTex(uv + vec2f(f32(i) * sx, f32(j) * sy) * rad);
        mean = mean + s;
        m2 = m2 + s * s;
      }
    }
    mean = mean / 9.0;
    let varc = m2 / 9.0 - mean * mean;
    let vsum = varc.r + varc.g + varc.b;
    if (vsum < bestVar) {
      bestVar = vsum;
      bestMean = mean;
    }
  }
  return bestMean;
}

// Per-pixel color effect stack (class A). type ids match effectRegistry.EFFECT_TYPE,
// interpolated below so registry and shader can't drift. Unknown types are no-ops.
// uv (0..1 across the image) and time (frame number) drive procedural/noise
// effects; effects may modify alpha (keying/opacity).
fn applyColorEffect(color: vec4f, a: vec4f, b: vec4f, uv: vec2f, time: f32) -> vec4f {
  let t = i32(a.x);
  let p0 = a.y;
  var c = color.rgb;
  var alpha = color.a;
  let luma = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  switch t {
    case ${EFFECT_TYPE.vibrance}: {
      let sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
      c = mix(vec3f(luma), c, 1.0 + p0 * (1.0 - sat));
    }
    case ${EFFECT_TYPE.hueShift}: {
      var hsv = rgb2hsv(c);
      hsv.x = fract(hsv.x + p0 / 360.0);
      c = hsv2rgb(hsv);
    }
    case ${EFFECT_TYPE.temperature}: {
      c = c + vec3f(p0 * 0.2, 0.0, -p0 * 0.2);
    }
    case ${EFFECT_TYPE.tint}: {
      c = c + vec3f(-p0 * 0.1, p0 * 0.2, -p0 * 0.1);
    }
    case ${EFFECT_TYPE.whiteBalance}: {
      c = c + vec3f(p0 * 0.15, p0 * 0.05, -p0 * 0.15);
    }
    case ${EFFECT_TYPE.blacks}: {
      c = c + vec3f(p0 * 0.15 * (1.0 - smoothstep(0.0, 0.4, luma)));
    }
    case ${EFFECT_TYPE.whites}: {
      c = c + vec3f(p0 * 0.15 * smoothstep(0.6, 1.0, luma));
    }
    case ${EFFECT_TYPE.shadows}: {
      c = c + vec3f(p0 * 0.25 * (1.0 - smoothstep(0.0, 0.5, luma)));
    }
    case ${EFFECT_TYPE.highlights}: {
      c = c + vec3f(p0 * 0.25 * smoothstep(0.5, 1.0, luma));
    }
    case ${EFFECT_TYPE.midtones}: {
      c = pow(max(c, vec3f(0.0)), vec3f(1.0 / max(1.0 + p0 * 0.5, 0.01)));
    }
    case ${EFFECT_TYPE.lift}: {
      c = c + vec3f(p0 * 0.2) * (vec3f(1.0) - c);
    }
    case ${EFFECT_TYPE.gammaColor}: {
      c = pow(max(c, vec3f(0.0)), vec3f(1.0 / max(p0, 0.01)));
    }
    case ${EFFECT_TYPE.gain}: {
      c = c * p0;
    }
    case ${EFFECT_TYPE.levels}: {
      c = clamp((c - vec3f(p0)) / max(1.0 - p0, 0.001), vec3f(0.0), vec3f(1.0));
    }
    case ${EFFECT_TYPE.curvesRGB}: {
      c = mix(c, smoothstep(vec3f(0.0), vec3f(1.0), c), p0);
    }
    case ${EFFECT_TYPE.curvesR}: {
      c.r = mix(c.r, smoothstep(0.0, 1.0, c.r), p0);
    }
    case ${EFFECT_TYPE.curvesG}: {
      c.g = mix(c.g, smoothstep(0.0, 1.0, c.g), p0);
    }
    case ${EFFECT_TYPE.curvesB}: {
      c.b = mix(c.b, smoothstep(0.0, 1.0, c.b), p0);
    }
    case ${EFFECT_TYPE.posterize}: {
      let n = max(floor(p0), 2.0);
      c = round(c * (n - 1.0)) / (n - 1.0);
    }
    case ${EFFECT_TYPE.solarize}: {
      c = select(c, vec3f(1.0) - c, c > vec3f(p0));
    }

    // ── A2: stylization & palette mapping ──
    case ${EFFECT_TYPE.threshold}: {
      c = vec3f(select(0.0, 1.0, luma > p0));
    }
    case ${EFFECT_TYPE.invert}: {
      c = mix(c, vec3f(1.0) - c, p0);
    }
    case ${EFFECT_TYPE.colorize}: {
      c = mix(c, luma * vec3f(1.0, 0.75, 0.4), p0);
    }
    case ${EFFECT_TYPE.duotone}: {
      let dt = mix(vec3f(0.1, 0.1, 0.4), vec3f(1.0, 0.85, 0.3), luma);
      c = mix(c, dt, p0);
    }
    case ${EFFECT_TYPE.tritone}: {
      let sh = vec3f(0.05, 0.05, 0.2);
      let mid = vec3f(0.6, 0.3, 0.4);
      let hi = vec3f(1.0, 0.9, 0.7);
      var tt = mix(sh, mid, clamp(luma * 2.0, 0.0, 1.0));
      tt = mix(tt, hi, clamp((luma - 0.5) * 2.0, 0.0, 1.0));
      c = mix(c, tt, p0);
    }
    case ${EFFECT_TYPE.gradientMap}: {
      let g0 = vec3f(0.0, 0.1, 0.4);
      let g1 = vec3f(0.8, 0.1, 0.5);
      let g2 = vec3f(1.0, 0.9, 0.2);
      var gm = mix(g0, g1, clamp(luma * 2.0, 0.0, 1.0));
      gm = mix(gm, g2, clamp((luma - 0.5) * 2.0, 0.0, 1.0));
      c = mix(c, gm, p0);
    }
    case ${EFFECT_TYPE.sepia}: {
      let se = vec3f(
        dot(c, vec3f(0.393, 0.769, 0.189)),
        dot(c, vec3f(0.349, 0.686, 0.168)),
        dot(c, vec3f(0.272, 0.534, 0.131)),
      );
      c = mix(c, se, p0);
    }
    case ${EFFECT_TYPE.monochrome}: {
      c = mix(c, vec3f(luma), p0);
    }
    case ${EFFECT_TYPE.bwMixer}: {
      c = vec3f(mix(luma, dot(c, vec3f(0.5, 0.35, 0.15)), p0));
    }
    case ${EFFECT_TYPE.colorBalance}: {
      c = c + vec3f(p0 * 0.1, 0.0, -p0 * 0.1);
    }
    case ${EFFECT_TYPE.splitToning}: {
      let toned = c * mix(vec3f(0.4, 0.6, 1.0), vec3f(1.0, 0.8, 0.5), luma);
      c = mix(c, toned, p0);
    }
    case ${EFFECT_TYPE.falseColor}: {
      let fc = vec3f(smoothstep(0.0, 0.5, luma), smoothstep(0.25, 0.75, luma), smoothstep(0.5, 1.0, luma));
      c = mix(c, fc, p0);
    }
    case ${EFFECT_TYPE.thermalVision}: {
      let tc = vec3f(
        clamp(luma * 2.0, 0.0, 1.0),
        clamp(luma * 2.0 - 0.5, 0.0, 1.0),
        clamp(luma * 4.0 - 3.0, 0.0, 1.0) + clamp(1.0 - luma * 4.0, 0.0, 1.0),
      );
      c = mix(c, tc, p0);
    }
    case ${EFFECT_TYPE.infrared}: {
      c = mix(c, vec3f(c.g, c.b, c.r), p0);
    }
    case ${EFFECT_TYPE.selectiveColor}: {
      let w = clamp(c.r - max(c.g, c.b), 0.0, 1.0);
      c = mix(c, mix(vec3f(luma), c, 1.0 + p0), w);
    }
    case ${EFFECT_TYPE.replaceColor}: {
      let d = 1.0 - clamp(length(c - vec3f(0.8, 0.1, 0.1)) * 2.0, 0.0, 1.0);
      c = mix(c, vec3f(0.1, 0.3, 0.9), d * p0);
    }
    case ${EFFECT_TYPE.channelMixer}: {
      c = vec3f(
        c.r + p0 * (c.g - c.r),
        c.g + p0 * (c.b - c.g),
        c.b + p0 * (c.r - c.b),
      );
    }
    case ${EFFECT_TYPE.extractRed}: {
      c = mix(c, vec3f(c.r, 0.0, 0.0), p0);
    }
    case ${EFFECT_TYPE.extractGreen}: {
      c = mix(c, vec3f(0.0, c.g, 0.0), p0);
    }
    case ${EFFECT_TYPE.extractBlue}: {
      c = mix(c, vec3f(0.0, 0.0, c.b), p0);
    }

    // ── A3: channel/alpha math + procedural + grain ──
    case ${EFFECT_TYPE.alphaOnly}: {
      c = mix(c, vec3f(alpha), p0);
    }
    case ${EFFECT_TYPE.swapChannels}: {
      let mode = i32(p0 + 0.5);
      if (mode == 1) { c = vec3f(c.g, c.r, c.b); }
      else if (mode == 2) { c = vec3f(c.b, c.g, c.r); }
      else if (mode == 3) { c = vec3f(c.r, c.b, c.g); }
    }
    case ${EFFECT_TYPE.opacity}: {
      alpha = alpha * p0;
    }
    case ${EFFECT_TYPE.alphaThreshold}: {
      alpha = alpha * step(p0, alpha);
    }
    case ${EFFECT_TYPE.lumaKey}: {
      alpha = alpha * smoothstep(p0 - 0.05, p0 + 0.05, luma);
    }
    case ${EFFECT_TYPE.spillSuppression}: {
      let m = max(c.r, c.b);
      c.g = mix(c.g, min(c.g, m), p0 * step(m, c.g));
    }
    case ${EFFECT_TYPE.gradientFill}: {
      c = mix(c, mix(vec3f(0.1, 0.2, 0.6), vec3f(0.9, 0.5, 0.2), uv.y), p0);
    }
    case ${EFFECT_TYPE.noiseFill}: {
      c = mix(c, vec3f(hash21(uv * 500.0 + time)), p0);
    }
    case ${EFFECT_TYPE.patternFill}: {
      c = mix(c, vec3f(step(0.5, fract((uv.x + uv.y) * 20.0))), p0);
    }
    case ${EFFECT_TYPE.checkerboard}: {
      let ch = (floor(uv.x * 16.0) + floor(uv.y * 16.0)) % 2.0;
      c = mix(c, vec3f(ch), p0);
    }
    case ${EFFECT_TYPE.dots}: {
      let g = fract(uv * 20.0) - vec2f(0.5);
      c = mix(c, vec3f(step(length(g), 0.3)), p0);
    }
    case ${EFFECT_TYPE.stripes}: {
      c = mix(c, vec3f(step(0.5, fract(uv.y * 20.0))), p0);
    }
    case ${EFFECT_TYPE.plasma}: {
      let v = sin(uv.x * 10.0 + time * 0.1) + sin(uv.y * 10.0 + time * 0.1) + sin((uv.x + uv.y) * 10.0);
      let pc = 0.5 + 0.5 * vec3f(sin(v), sin(v + 2.0), sin(v + 4.0));
      c = mix(c, pc, p0);
    }
    case ${EFFECT_TYPE.clouds}: {
      c = mix(c, vec3f(fbm(uv * 4.0 + vec2f(time * 0.01))), p0);
    }
    case ${EFFECT_TYPE.addNoise}: {
      c = c + vec3f((hash21(uv * 800.0 + time) - 0.5) * p0);
    }
    case ${EFFECT_TYPE.filmGrain}: {
      c = c + vec3f((hash21(uv * 1000.0 + time * 1.7) - 0.5) * p0 * 0.6);
    }
    case ${EFFECT_TYPE.gaussianNoise}: {
      let n = (hash21(uv * 700.0 + time) + hash21(uv * 700.0 + time + 13.0) + hash21(uv * 700.0 + time + 27.0)) / 3.0 - 0.5;
      c = c + vec3f(n * p0);
    }
    case ${EFFECT_TYPE.saltAndPepper}: {
      let r = hash21(uv * 900.0 + time);
      if (r < p0 * 0.5) { c = vec3f(0.0); }
      else if (r > 1.0 - p0 * 0.5) { c = vec3f(1.0); }
    }
    case ${EFFECT_TYPE.perlinNoise}: {
      c = mix(c, vec3f(valueNoise(uv * 20.0 + vec2f(time * 0.05))), p0);
    }
    case ${EFFECT_TYPE.fractalNoise}: {
      c = mix(c, vec3f(fbm(uv * 8.0 + vec2f(time * 0.03))), p0);
    }
    case ${EFFECT_TYPE.dust}: {
      c = c + vec3f(step(1.0 - p0 * 0.05, hash21(uv * 1500.0 + floor(time))));
    }
    case ${EFFECT_TYPE.voronoiPattern}: {
      let sp = uv * 12.0;
      let cell = floor(voronoiCenter(sp));
      let col = vec3f(hash21(cell + vec2f(1.3, 5.7)), hash21(cell + vec2f(13.1, 7.7)), hash21(cell + vec2f(41.2, 91.3)));
      c = mix(c, col, p0);
    }
    case ${EFFECT_TYPE.cellularPattern}: {
      let sp = uv * 12.0;
      let d = clamp(distance(sp, voronoiCenter(sp)), 0.0, 1.0);
      c = mix(c, vec3f(d), p0);
    }

    default: {}
  }
  return vec4f(c, alpha);
}

// Pre-sample UV warp stack (class B). Each case remaps the sampling coordinate;
// the caller composes them in effect order BEFORE the texture is sampled. type ids
// match effectRegistry.EFFECT_TYPE (interpolated below so registry and shader can't
// drift). Unknown types pass through. Contract: geometric warps let uv leave 0..1
// (revealed as a transparent border by the caller); tiling/fold warps keep uv in
// range themselves. aspect keeps radial distortions circular on screen; time
// animates the wave family. ctr is uv centred at 0; ca is aspect-corrected.
fn applyWarpEffect(uv: vec2f, a: vec4f, b: vec4f, aspect: f32, time: f32) -> vec2f {
  let t = i32(a.x);
  let p0 = a.y;
  var w = uv;
  let ctr = uv - vec2f(0.5);
  let ca = vec2f(ctr.x * aspect, ctr.y);
  let r = length(ca);
  switch t {
    // ── B1: geometry & radial distortion ──
    case ${EFFECT_TYPE.rotate}: {
      let ang = -p0 * 0.017453292;
      let cs = cos(ang);
      let sn = sin(ang);
      let d = vec2f(ca.x * cs - ca.y * sn, ca.x * sn + ca.y * cs);
      w = vec2f(d.x / aspect, d.y) + vec2f(0.5);
    }
    case ${EFFECT_TYPE.flipH}: {
      if (p0 > 0.5) { w = vec2f(1.0 - uv.x, uv.y); }
    }
    case ${EFFECT_TYPE.flipV}: {
      if (p0 > 0.5) { w = vec2f(uv.x, 1.0 - uv.y); }
    }
    case ${EFFECT_TYPE.scale}: {
      w = ctr / max(p0, 0.001) + vec2f(0.5);
    }
    case ${EFFECT_TYPE.crop}: {
      let m = p0 * 0.5;
      if (uv.x < m || uv.x > 1.0 - m || uv.y < m || uv.y > 1.0 - m) {
        w = vec2f(-1.0, -1.0);
      }
    }
    case ${EFFECT_TYPE.perspective}: {
      let sx = 1.0 + p0 * (uv.y - 0.5) * 2.0;
      w = vec2f(ctr.x / max(sx, 0.05) + 0.5, uv.y);
    }
    case ${EFFECT_TYPE.shear}: {
      w = vec2f(uv.x + (uv.y - 0.5) * p0, uv.y);
    }
    case ${EFFECT_TYPE.skew}: {
      let k = tan(clamp(p0, -80.0, 80.0) * 0.017453292);
      w = vec2f(uv.x + (uv.y - 0.5) * k, uv.y);
    }
    case ${EFFECT_TYPE.affineTransform}: {
      let ang = -p0 * 0.7853982;
      let cs = cos(ang);
      let sn = sin(ang);
      let d = vec2f(ca.x * cs - ca.y * sn, ca.x * sn + ca.y * cs) / max(1.0 + p0 * 0.3, 0.05);
      w = vec2f(d.x / aspect, d.y) + vec2f(0.5);
    }
    case ${EFFECT_TYPE.offset}: {
      w = vec2f(fract(uv.x - p0), uv.y);
    }
    case ${EFFECT_TYPE.lensDistortion}: {
      let f = 1.0 + p0 * (r * r) + p0 * 0.5 * (r * r * r * r);
      let d = ca * f;
      w = vec2f(d.x / aspect, d.y) + vec2f(0.5);
    }
    case ${EFFECT_TYPE.barrelDistortion}: {
      let d = ca * (1.0 + p0 * 0.8 * (r * r));
      w = vec2f(d.x / aspect, d.y) + vec2f(0.5);
    }
    case ${EFFECT_TYPE.pincushion}: {
      let d = ca * (1.0 - p0 * 0.8 * (r * r));
      w = vec2f(d.x / aspect, d.y) + vec2f(0.5);
    }
    case ${EFFECT_TYPE.fisheye}: {
      let maxr = 0.7071;
      let rn = clamp(r / maxr, 0.0, 1.0);
      let theta = atan2(ca.y, ca.x);
      let rr = mix(r, sin(rn * 1.5707963) * maxr, p0);
      let d = vec2f(cos(theta), sin(theta)) * rr;
      w = vec2f(d.x / aspect, d.y) + vec2f(0.5);
    }
    case ${EFFECT_TYPE.spherize}: {
      let maxr = 0.5;
      if (r < maxr && r > 1.0e-5) {
        let rn = r / maxr;
        let d = ca * mix(1.0, sin(rn * 1.5707963) / rn, p0);
        w = vec2f(d.x / aspect, d.y) + vec2f(0.5);
      }
    }
    case ${EFFECT_TYPE.bulge}: {
      let maxr = 0.5;
      if (r < maxr && r > 1.0e-5) {
        let d = normalize(ca) * pow(r / maxr, 1.0 - p0) * maxr;
        w = vec2f(d.x / aspect, d.y) + vec2f(0.5);
      }
    }
    case ${EFFECT_TYPE.pinch}: {
      let maxr = 0.5;
      if (r < maxr && r > 1.0e-5) {
        let d = normalize(ca) * pow(r / maxr, 1.0 + p0) * maxr;
        w = vec2f(d.x / aspect, d.y) + vec2f(0.5);
      }
    }
    case ${EFFECT_TYPE.twirl}: {
      let maxr = 0.7071;
      let frac = clamp(1.0 - r / maxr, 0.0, 1.0);
      let ang = p0 * 0.017453292 * frac;
      let cs = cos(ang);
      let sn = sin(ang);
      let d = vec2f(ca.x * cs - ca.y * sn, ca.x * sn + ca.y * cs);
      w = vec2f(d.x / aspect, d.y) + vec2f(0.5);
    }
    case ${EFFECT_TYPE.polarCoordinates}: {
      let theta = atan2(ctr.y, ctr.x);
      let rad = clamp(length(ctr) * 2.0, 0.0, 1.0);
      w = mix(uv, vec2f((theta + 3.14159265) / 6.2831853, rad), p0);
    }

    // ── B2: waves, tiling, pixelation, cellular ──
    case ${EFFECT_TYPE.wave}: {
      w = vec2f(uv.x + sin(uv.y * 12.0 + time * 0.05) * (p0 / 500.0), uv.y);
    }
    case ${EFFECT_TYPE.ripple}: {
      let off = sin(r * 40.0 - time * 0.08) * (p0 / 800.0);
      let d = ca + normalize(ca + vec2f(1.0e-5)) * off;
      w = vec2f(d.x / aspect, d.y) + vec2f(0.5);
    }
    case ${EFFECT_TYPE.zigzag}: {
      let tw = abs(fract(r * 20.0) - 0.5) * 4.0 - 1.0;
      let d = ca + normalize(ca + vec2f(1.0e-5)) * tw * (p0 / 800.0);
      w = vec2f(d.x / aspect, d.y) + vec2f(0.5);
    }
    case ${EFFECT_TYPE.turbulentDisplace}: {
      let amp = p0 / 400.0;
      let nx = fbm(uv * 6.0 + vec2f(time * 0.02, 0.0)) - 0.5;
      let ny = fbm(uv * 6.0 + vec2f(31.4, 17.7) + vec2f(0.0, time * 0.02)) - 0.5;
      w = uv + vec2f(nx, ny) * amp;
    }
    case ${EFFECT_TYPE.perspectiveWarp}: {
      let sy = 1.0 + p0 * (uv.x - 0.5) * 2.0;
      w = vec2f(uv.x, ctr.y / max(sy, 0.05) + 0.5);
    }
    case ${EFFECT_TYPE.mirror}: {
      w = vec2f(mix(uv.x, 0.5 - abs(uv.x - 0.5), p0), uv.y);
    }
    case ${EFFECT_TYPE.kaleidoscope}: {
      let wedge = 6.2831853 / max(p0, 2.0);
      var ang = atan2(ca.y, ca.x);
      ang = ang - floor(ang / wedge) * wedge;
      ang = abs(ang - wedge * 0.5);
      let d = vec2f(cos(ang), sin(ang)) * r;
      w = vec2f(d.x / aspect, d.y) + vec2f(0.5);
    }
    case ${EFFECT_TYPE.pixelate}: {
      let cells = max(u.quadSize / max(p0, 1.0), vec2f(1.0));
      w = (floor(uv * cells) + vec2f(0.5)) / cells;
    }
    case ${EFFECT_TYPE.mosaic}: {
      let n = max(max(u.quadSize.x, u.quadSize.y) / max(p0, 1.0), 1.0);
      w = (floor(uv * n) + vec2f(0.5)) / n;
    }
    case ${EFFECT_TYPE.blockPixelation}: {
      let cells = max(u.quadSize / max(p0 * 2.0, 1.0), vec2f(1.0));
      w = (floor(uv * cells) + vec2f(0.5)) / cells;
    }
    case ${EFFECT_TYPE.hexPixelate}: {
      let cells = max(u.quadSize.y / max(p0, 1.0), 1.0);
      let hc = hexCenter(vec2f(uv.x * aspect, uv.y) * cells);
      w = vec2f((hc.x / cells) / aspect, hc.y / cells);
    }
    case ${EFFECT_TYPE.crystallize}: {
      let cells = max(u.quadSize.y / max(p0, 1.0), 1.0);
      let cc = voronoiCenter(vec2f(uv.x * aspect, uv.y) * cells);
      w = vec2f((cc.x / cells) / aspect, cc.y / cells);
    }
    case ${EFFECT_TYPE.voronoi}: {
      let cells = max(u.quadSize.y / max(p0, 1.0), 1.0);
      let cc = voronoiCenter(vec2f(uv.x * aspect, uv.y) * cells);
      w = vec2f((cc.x / cells) / aspect, cc.y / cells);
    }
    case ${EFFECT_TYPE.facet}: {
      let cells = max(u.quadSize.y / max(p0 * 0.5, 1.0), 1.0);
      let cc = voronoiCenter(vec2f(uv.x * aspect, uv.y) * cells);
      w = vec2f((cc.x / cells) / aspect, cc.y / cells);
    }
    case ${EFFECT_TYPE.pointillize}: {
      let cells = max(u.quadSize.y / max(p0, 1.0), 1.0);
      let cc = voronoiCenter(vec2f(uv.x * aspect, uv.y) * cells);
      w = vec2f((cc.x / cells) / aspect, cc.y / cells);
    }
    default: {}
  }
  return w;
}

// Texture-aware spatial stack (class C, single-pass). Runs right after the base
// sample so it can re-read the texture: B3 chromatic/retro re-sample at per-channel
// offset UVs; C1 convolution reads 3x3 neighbours; C2 morphological/matte scan a
// disc. Neighbour reads come from the raw texture (composing multiple spatial ops
// needs an RTT ping-pong, a later batch). type ids match effectRegistry.EFFECT_TYPE.
// texel = 1 uv per screen pixel; effects are identity at their default param (0).
fn applySpatialEffect(color: vec4f, a: vec4f, b: vec4f, uv: vec2f, texel: vec2f, time: f32) -> vec4f {
  let t = i32(a.x);
  let p0 = a.y;
  var c = color.rgb;
  var alpha = color.a;
  switch t {
    // ── B3: chromatic & retro ──
    case ${EFFECT_TYPE.rgbSplit}: {
      let off = p0 * texel.x;
      c = vec3f(sampleTex(uv + vec2f(off, 0.0)).r, c.g, sampleTex(uv - vec2f(off, 0.0)).b);
    }
    case ${EFFECT_TYPE.channelOffset}: {
      let off = p0 * texel.x;
      c = vec3f(sampleTex(uv + vec2f(off, 0.0)).r, c.g, sampleTex(uv - vec2f(off, 0.0)).b);
    }
    case ${EFFECT_TYPE.chromaticAberration}: {
      let dir = uv - vec2f(0.5);
      let amt = p0 * 0.002;
      c = vec3f(sampleTex(uv + dir * amt).r, c.g, sampleTex(uv - dir * amt).b);
    }
    case ${EFFECT_TYPE.refraction}: {
      let n = vec2f(fbm(uv * 8.0) - 0.5, fbm(uv * 8.0 + vec2f(21.7, 9.3)) - 0.5);
      c = sampleTex(uv + n * p0 * 0.05);
    }
    case ${EFFECT_TYPE.heatDistortion}: {
      let dx = sin(uv.y * 40.0 + time * 0.2) * p0 * 0.01;
      let dy = (fbm(uv * 10.0 + vec2f(0.0, time * 0.1)) - 0.5) * p0 * 0.01;
      c = sampleTex(uv + vec2f(dx, dy));
    }
    case ${EFFECT_TYPE.digitalGlitch}: {
      let row = floor(uv.y * 40.0);
      var du = 0.0;
      if (hash21(vec2f(row, floor(time * 0.5))) < p0 * 0.5) {
        du = (hash21(vec2f(row, 7.0)) - 0.5) * p0 * 0.2;
      }
      let off = p0 * texel.x * 6.0;
      c = vec3f(
        sampleTex(uv + vec2f(du + off, 0.0)).r,
        sampleTex(uv + vec2f(du, 0.0)).g,
        sampleTex(uv + vec2f(du - off, 0.0)).b,
      );
    }
    case ${EFFECT_TYPE.vhs}: {
      let jitter = (hash21(vec2f(floor(uv.y * 220.0), floor(time))) - 0.5) * p0 * 0.02;
      let off = p0 * texel.x * 3.0;
      var vc = vec3f(
        sampleTex(uv + vec2f(jitter + off, 0.0)).r,
        sampleTex(uv + vec2f(jitter, 0.0)).g,
        sampleTex(uv + vec2f(jitter - off, 0.0)).b,
      );
      vc = vc * (1.0 - p0 * 0.2 * (0.5 + 0.5 * sin(uv.y * 400.0)));
      vc = vc + vec3f((hash21(uv * 500.0 + time) - 0.5) * p0 * 0.1);
      c = vc;
    }
    case ${EFFECT_TYPE.vhsNoise}: {
      let n = hash21(uv * vec2f(300.0, 800.0) + floor(time * 2.0));
      let band = step(0.985, fract(uv.y * 3.0 + time * 0.05));
      c = mix(c, vec3f(n), p0 * (0.3 + band * 0.7));
    }
    case ${EFFECT_TYPE.crtMonitor}: {
      let cc = uv - vec2f(0.5);
      let r2 = dot(cc, cc);
      let buv = uv + cc * r2 * p0 * 0.3;
      var col = sampleTex(buv);
      col = col * (1.0 - p0 * 0.3 * (0.5 - 0.5 * sin(buv.x * 500.0)));
      col = col * (1.0 - p0 * 0.3 * (0.5 - 0.5 * sin(buv.y * 350.0)));
      col = col * (1.0 - p0 * r2 * 1.2);
      c = col;
    }
    case ${EFFECT_TYPE.scanlines}: {
      c = c * (1.0 - p0 * 0.5 * (0.5 - 0.5 * sin(uv.y * 300.0)));
    }
    case ${EFFECT_TYPE.scanlineNoise}: {
      c = c * (1.0 - p0 * 0.5 * (0.5 - 0.5 * sin(uv.y * 300.0)));
      c = c + vec3f((hash21(uv * 400.0 + floor(time)) - 0.5) * p0 * 0.15);
    }

    // ── C1: convolution — sharpen & edge detect ──
    case ${EFFECT_TYPE.sharpen}: {
      let n = sampleTex(uv + vec2f(0.0, -texel.y)) + sampleTex(uv + vec2f(0.0, texel.y))
            + sampleTex(uv + vec2f(-texel.x, 0.0)) + sampleTex(uv + vec2f(texel.x, 0.0));
      c = c + (c * 4.0 - n) * p0;
    }
    case ${EFFECT_TYPE.unsharpMask}: {
      c = c + (c - blur3x3(uv, texel * 1.5)) * p0;
    }
    case ${EFFECT_TYPE.highPass}: {
      let hp = vec3f(0.5) + (c - blur3x3(uv, texel * (1.0 + p0)));
      c = mix(c, hp, min(p0 * 0.2, 1.0));
    }
    case ${EFFECT_TYPE.edgeEnhance}: {
      let n = sampleTex(uv + vec2f(0.0, -texel.y)) + sampleTex(uv + vec2f(0.0, texel.y))
            + sampleTex(uv + vec2f(-texel.x, 0.0)) + sampleTex(uv + vec2f(texel.x, 0.0));
      c = c + (c * 4.0 - n) * p0 * 0.6;
    }
    case ${EFFECT_TYPE.detailEnhance}: {
      c = c + (c - blur3x3(uv, texel * 2.5)) * p0;
    }
    case ${EFFECT_TYPE.clarity}: {
      c = clamp(c + (c - blur3x3(uv, texel * 3.0)) * p0 * 1.5, vec3f(0.0), vec3f(1.0));
    }
    case ${EFFECT_TYPE.localContrast}: {
      c = clamp(c + (c - blur3x3(uv, texel * 5.0)) * p0 * 2.0, vec3f(0.0), vec3f(1.0));
    }
    case ${EFFECT_TYPE.sobel}: {
      c = mix(c, vec3f(clamp(sobelLuma(uv, texel), 0.0, 1.0)), p0);
    }
    case ${EFFECT_TYPE.laplacian}: {
      let n = lumaOf(sampleTex(uv + vec2f(0.0, -texel.y))) + lumaOf(sampleTex(uv + vec2f(0.0, texel.y)))
            + lumaOf(sampleTex(uv + vec2f(-texel.x, 0.0))) + lumaOf(sampleTex(uv + vec2f(texel.x, 0.0)));
      let e = abs(lumaOf(c) * 4.0 - n);
      c = mix(c, vec3f(clamp(e, 0.0, 1.0)), p0);
    }
    case ${EFFECT_TYPE.outline}: {
      let mag = clamp(sobelLuma(uv, texel) * 1.5, 0.0, 1.0);
      c = mix(c, c * (1.0 - mag), p0);
    }
    case ${EFFECT_TYPE.findEdges}: {
      let mag = clamp(sobelLuma(uv, texel) * 2.0, 0.0, 1.0);
      c = mix(c, vec3f(1.0 - mag), p0);
    }
    case ${EFFECT_TYPE.glowEdges}: {
      let mag = clamp(sobelLuma(uv, texel) * 2.0, 0.0, 1.0);
      c = mix(c, c * mag * 3.0, p0);
    }
    case ${EFFECT_TYPE.emboss}: {
      let e = 0.5 + lumaOf(sampleTex(uv + vec2f(-texel.x, -texel.y)) - sampleTex(uv + vec2f(texel.x, texel.y))) * 2.0;
      c = mix(c, vec3f(clamp(e, 0.0, 1.0)), p0);
    }
    case ${EFFECT_TYPE.edgeDetectColor}: {
      let gx = sampleTex(uv + vec2f(texel.x, 0.0)) - sampleTex(uv + vec2f(-texel.x, 0.0));
      let gy = sampleTex(uv + vec2f(0.0, texel.y)) - sampleTex(uv + vec2f(0.0, -texel.y));
      c = mix(c, clamp(sqrt(gx * gx + gy * gy), vec3f(0.0), vec3f(1.0)), p0);
    }

    // ── C2: morphological & matte (disc-sampled; radius param in px) ──
    case ${EFFECT_TYPE.dilate}: {
      c = discDilate(uv, p0 * texel).rgb;
    }
    case ${EFFECT_TYPE.erode}: {
      c = discErode(uv, p0 * texel).rgb;
    }
    case ${EFFECT_TYPE.opening}: {
      c = morphOpen(uv, p0 * texel).rgb;
    }
    case ${EFFECT_TYPE.closing}: {
      c = morphClose(uv, p0 * texel).rgb;
    }
    case ${EFFECT_TYPE.distanceTransform}: {
      let field = discBlurRGBA(uv, vec2f(p0 * 0.15)).a;
      c = mix(c, vec3f(field), p0);
    }
    case ${EFFECT_TYPE.matteExpansion}: {
      if (p0 > 0.0) { alpha = discDilate(uv, p0 * texel).a; }
      else if (p0 < 0.0) { alpha = discErode(uv, -p0 * texel).a; }
    }
    case ${EFFECT_TYPE.matteShrink}: {
      alpha = discErode(uv, p0 * texel).a;
    }
    case ${EFFECT_TYPE.featherAlpha}: {
      alpha = discBlurRGBA(uv, p0 * texel).a;
    }
    case ${EFFECT_TYPE.alphaBlur}: {
      alpha = discBlurRGBA(uv, p0 * texel).a;
    }
    case ${EFFECT_TYPE.channelBlur}: {
      let bl = discBlurRGBA(uv, p0 * texel);
      c = bl.rgb;
      alpha = bl.a;
    }

    // ── W (lighting): single-pass radial light shafts / flare ──
    case ${EFFECT_TYPE.lightRays}: {
      let toCenter = vec2f(0.5) - uv;
      var acc = vec3f(0.0);
      var wsum = 0.0;
      var wgt = 1.0;
      for (var i = 0; i < 16; i = i + 1) {
        let s = sampleTex(uv + toCenter * (f32(i) / 16.0));
        acc = acc + max(s - vec3f(0.6), vec3f(0.0)) * wgt;
        wsum = wsum + wgt;
        wgt = wgt * 0.92;
      }
      c = c + (acc / max(wsum, 1.0)) * p0 * 2.5;
    }
    case ${EFFECT_TYPE.sunRays}: {
      let toSun = vec2f(0.5, 0.0) - uv;
      var acc = vec3f(0.0);
      var wsum = 0.0;
      var wgt = 1.0;
      for (var i = 0; i < 16; i = i + 1) {
        let s = sampleTex(uv + toSun * (f32(i) / 16.0));
        acc = acc + max(s - vec3f(0.55), vec3f(0.0)) * wgt;
        wsum = wsum + wgt;
        wgt = wgt * 0.9;
      }
      c = c + (acc / max(wsum, 1.0)) * p0 * 2.5;
    }
    case ${EFFECT_TYPE.lightWrap}: {
      let bright = max(blur3x3(uv, texel * 4.0) - vec3f(0.5), vec3f(0.0));
      c = c + bright * p0;
    }
    case ${EFFECT_TYPE.lensFlare}: {
      let axis = vec2f(0.5) - uv;
      var flare = vec3f(0.0);
      for (var i = 1; i <= 4; i = i + 1) {
        let s = sampleTex(uv + axis * (f32(i) * 0.35));
        flare = flare + max(s - vec3f(0.7), vec3f(0.0)) / f32(i);
      }
      let halo = smoothstep(0.32, 0.28, abs(length(uv - vec2f(0.5)) - 0.3));
      c = c + (flare + vec3f(halo) * 0.3) * p0;
    }
    case ${EFFECT_TYPE.specularHighlight}: {
      c = c + vec3f(smoothstep(0.7, 1.0, lumaOf(c))) * p0 * 0.8;
    }

    // ── C3: artistic / painterly ──
    case ${EFFECT_TYPE.oilPainting}: {
      c = mix(c, kuwahara(uv, texel * 2.0), p0);
    }
    case ${EFFECT_TYPE.watercolor}: {
      let b = discBlurRGBA(uv, texel * 4.0).rgb;
      let edge = clamp(sobelLuma(uv, texel) * 2.0, 0.0, 1.0);
      let wc = mix(round(b * 5.0) / 5.0, b, 0.5) * (1.0 - edge * 0.3);
      c = mix(c, wc, p0);
    }
    case ${EFFECT_TYPE.pencilSketch}: {
      let g = lumaOf(c);
      let bl = lumaOf(blur3x3(uv, texel * 3.0));
      c = mix(c, vec3f(clamp(g / max(bl, 0.001), 0.0, 1.0)), p0);
    }
    case ${EFFECT_TYPE.ink}: {
      let edge = clamp(sobelLuma(uv, texel) * 3.0, 0.0, 1.0);
      c = mix(c, vec3f(step(0.5, lumaOf(c)) * (1.0 - edge)), p0);
    }
    case ${EFFECT_TYPE.comic}: {
      let edge = step(0.3, clamp(sobelLuma(uv, texel) * 2.0, 0.0, 1.0));
      c = mix(c, (round(c * 4.0) / 4.0) * (1.0 - edge), p0);
    }
    case ${EFFECT_TYPE.cartoon}: {
      let toon = round(discBlurRGBA(uv, texel * 2.0).rgb * 4.0) / 4.0;
      let edge = step(0.25, clamp(sobelLuma(uv, texel) * 2.0, 0.0, 1.0));
      c = mix(c, toon * (1.0 - edge), p0);
    }
    case ${EFFECT_TYPE.posterPaint}: {
      let post = round(c * 3.0) / 3.0;
      let sat = mix(vec3f(lumaOf(post)), post, 1.4);
      c = mix(c, clamp(sat, vec3f(0.0), vec3f(1.0)), p0);
    }
    case ${EFFECT_TYPE.chalk}: {
      let edge = clamp(sobelLuma(uv, texel) * 3.0, 0.0, 1.0);
      c = mix(c, vec3f(clamp(edge + hash21(uv * 800.0) * 0.15 * edge, 0.0, 1.0)), p0);
    }
    case ${EFFECT_TYPE.halftone}: {
      let cell = fract(uv * 80.0) - vec2f(0.5);
      let dot = step(length(cell), (1.0 - lumaOf(c)) * 0.7);
      c = mix(c, vec3f(1.0 - dot), p0);
    }
    case ${EFFECT_TYPE.crossHatch}: {
      let g = lumaOf(c);
      var h = 1.0;
      if (g < 0.8) { h = min(h, step(0.5, fract((uv.x + uv.y) * 60.0))); }
      if (g < 0.6) { h = min(h, step(0.5, fract((uv.x - uv.y) * 60.0))); }
      if (g < 0.4) { h = min(h, step(0.5, fract(uv.x * 60.0))); }
      if (g < 0.2) { h = min(h, step(0.5, fract(uv.y * 60.0))); }
      c = mix(c, vec3f(h), p0);
    }
    case ${EFFECT_TYPE.woodcut}: {
      let wave = 0.5 + 0.4 * sin(uv.x * 12.0);
      c = mix(c, vec3f(step(fract(uv.y * 40.0 * wave), lumaOf(c))), p0);
    }
    case ${EFFECT_TYPE.stainedGlass}: {
      let sp = uv * 14.0;
      let center = voronoiCenter(sp);
      let glass = sampleTex(clamp(center / 14.0, vec2f(0.0), vec2f(1.0)));
      let lead = smoothstep(0.35, 0.5, distance(sp, center));
      c = mix(c, glass * (1.0 - lead * 0.7), p0);
    }
    case ${EFFECT_TYPE.paintDaubs}: {
      let ang = fbm(uv * 10.0) * 6.2831853;
      let daub = discBlurRGBA(uv + vec2f(cos(ang), sin(ang)) * texel * 4.0, texel * 2.0).rgb;
      c = mix(c, round(daub * 6.0) / 6.0, p0);
    }

    default: {}
  }
  return vec4f(c, alpha);
}

${MASK_WGSL}

@fragment
fn fs(in: VertexOutput) -> @location(0) vec4f {
  let aspect = max(u.quadSize.x, 1.0) / max(u.quadSize.y, 1.0);
  let ec = i32(u.effectCount + 0.5);

  // Pre-sample warp stack (class B): compose the sampling UV in effect order
  // before the texture read. Warp-type slots match here; color-type slots don't.
  var uv = in.uv;
  for (var wi = 0; wi < ec; wi = wi + 1) {
    uv = applyWarpEffect(uv, u.effects[wi].a, u.effects[wi].b, aspect, u.effectTime);
  }

  // Layer textures have no mipmaps, so LOD 0 == textureSample, and an explicit
  // level keeps the read valid across the UV discontinuities that tiling/fold
  // warps introduce.
  var color = textureSampleLevel(texData, texSampler, uv, 0.0);

  // Spatial stage (class C, texture-aware): chromatic/retro (B3), convolution (C1),
  // morphological/matte (C2). Reads texels around the warped uv, so it runs before
  // the border test. Warp/color-type slots hit its default and pass through.
  let texel = 1.0 / max(u.quadSize, vec2f(1.0));
  for (var si = 0; si < ec; si = si + 1) {
    color = applySpatialEffect(color, u.effects[si].a, u.effects[si].b, uv, texel, u.effectTime);
  }

  // The clamp-to-edge sampler + this bounds test give geometric warps a transparent
  // border (tiling/fold warps keep uv in range, so inBounds stays 1).
  let inBounds = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  color = color * inBounds;

  // Exposure
  let exposureMul = pow(2.0, u.exposure);
  color = vec4f(color.rgb * exposureMul, color.a);

  // Brightness
  color = vec4f(color.rgb + vec3f(u.brightness), color.a);

  // Contrast
  let contrastFactor = 1.0 + u.contrast;
  color = vec4f((color.rgb - vec3f(0.5)) * contrastFactor + vec3f(0.5), color.a);

  // Saturation
  let lum = dot(color.rgb, vec3f(0.2126, 0.7152, 0.0722));
  let satFactor = 1.0 + u.saturation;
  color = vec4f(mix(vec3f(lum), color.rgb, satFactor), color.a);

  // Gamma
  let invGamma = 1.0 / max(u.gamma, 0.01);
  color = vec4f(pow(max(color.rgb, vec3f(0.0)), vec3f(invGamma)), color.a);

  // Lift/Gamma/Gain color correction
  color = vec4f(applyLiftGammaGain(color.rgb), color.a);

  // Effect stack (class A per-pixel color). Bounded by effectCount (0 for video).
  // Uses in.uv (the true fragment UV) so procedural fills/patterns stay put while
  // the warp stack above only affected the sampling coordinate.
  for (var ei = 0; ei < ec; ei = ei + 1) {
    color = applyColorEffect(color, u.effects[ei].a, u.effects[ei].b, in.uv, u.effectTime);
  }

  let mA = computeMaskStackAlpha(in.worldPos, i32(u.maskCount + 0.5), u.masks);
  color = vec4f(clamp(color.rgb, vec3f(0.0), vec3f(1.0)), color.a * u.opacity * mA);
  return color;
}
`;

// Image + video layers share this uniform buffer. Its stride is independent of
// the shared UNIFORM_ALIGN (512), enlarged to fit the effect-slot array appended
// AFTER the masks (so the mask base index at float 28 never moves). Layout (bytes):
// header 112 + masks 384 + effectCount(+pad) 16 + effects 512 = 1024 (256 f32).
const IMAGE_UNIFORM_SIZE = 1024;
const IMAGE_UNIFORM_ALIGN = 1024;
const IMAGE_UNIFORM_FLOATS = 256;
// Effect slots: 16 × (2 vec4f = type + 7 params). effectCount at float 124,
// effects array base at float 128.
const IMAGE_MAX_EFFECTS = 16;
const IMAGE_EFFECTCOUNT_FLOAT = 124;
const IMAGE_EFFECTTIME_FLOAT = 125;
const IMAGE_EFFECTS_BASE_FLOAT = 128;

const PATH_SHADER = /* wgsl */ `
struct MaskSlot {
  params: vec4f,
  center: vec2f,
  size: vec2f,
  rot: f32,
  points: f32,
  inner: f32,
  _pad: f32,
}

struct PathUniforms {
  resolution: vec2f,
  position: vec2f,
  anchor: vec2f,
  scale: vec2f,
  rotation: f32,
  opacity: f32,
  maskCount: f32,
  _pad1: f32,
  masks: array<MaskSlot, 8>,
}

@group(0) @binding(0) var<uniform> u: PathUniforms;

struct VertexInput {
  @location(0) pos: vec2f,
  @location(1) color: vec4f,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
  @location(1) world: vec2f,
}

@vertex
fn vs(in: VertexInput) -> VertexOutput {
  let scaled = in.pos * u.scale;
  let rel = scaled - u.anchor;
  let cosR = cos(u.rotation);
  let sinR = sin(u.rotation);
  let rotated = vec2f(
    rel.x * cosR - rel.y * sinR,
    rel.x * sinR + rel.y * cosR,
  );
  let world = rotated + u.anchor + u.position;
  let ndc = vec2f(
    (world.x / u.resolution.x) * 2.0 - 1.0,
    1.0 - (world.y / u.resolution.y) * 2.0,
  );
  var out: VertexOutput;
  out.position = vec4f(ndc, 0.0, 1.0);
  out.color = in.color;
  out.world = world;
  return out;
}

${MASK_WGSL}

@fragment
fn fs(in: VertexOutput) -> @location(0) vec4f {
  let mA = computeMaskStackAlpha(in.world, i32(u.maskCount + 0.5), u.masks);
  return vec4f(in.color.rgb, in.color.a * u.opacity * mA);
}
`;

const PATH_UNIFORM_SIZE = 432;
const PATH_VERTEX_STRIDE = 24; // 6 floats
const PATH_INITIAL_VERTS = 4096;

// Analytic directional motion blur. Each blur-enabled layer is first rendered
// in isolation into a layer texture, then this pass reconstructs a per-pixel
// velocity vector (linear + rotational + scale) from the layer's frame-to-frame
// motion and averages samples taken ALONG that velocity. Sampling is purely
// directional — never radial or gaussian — so a streak forms in the direction
// of travel. Static pixels (zero velocity) return the source untouched.
const BLUR_UNIFORM_SIZE = 48;
const BLUR_SHADER = /* wgsl */ `
struct BlurU {
  resolution: vec2f,   // composition space (width, height)
  pivot: vec2f,        // rotation/scale centre in composition space
  velocity: vec2f,     // linear pivot velocity, composition px / frame
  scaleRate: vec2f,    // fractional scale change per frame, per axis
  omega: f32,          // angular velocity, radians / frame
  shutter: f32,        // shutter angle normalized to 0..1 (angle / 360)
  sampleCount: f32,
  _pad: f32,
}

@group(0) @binding(0) var<uniform> u: BlurU;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

struct VO {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VO {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out: VO;
  out.position = vec4f(p[vi], 0.0, 1.0);
  out.uv = p[vi] * 0.5 + 0.5;
  return out;
}

@fragment
fn fs(in: VO) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(tex));
  let texUV = in.position.xy / dims;
  let base = textureSampleLevel(tex, samp, texUV, 0.0);

  // Composition-space position of this pixel. The scene was rasterized with a
  // y-down mapping, so framebuffer uv maps directly to composition coordinates.
  let compPos = texUV * u.resolution;
  let r = compPos - u.pivot;
  let vel = u.velocity
    + vec2f(-u.omega * r.y, u.omega * r.x)
    + vec2f(u.scaleRate.x * r.x, u.scaleRate.y * r.y);
  let streak = vel * u.shutter; // composition px
  if (length(streak) < 0.5) {
    return base;
  }

  // Streak expressed in texture-uv space.
  let duv = streak / u.resolution;
  let n = max(i32(u.sampleCount), 2);
  var acc = vec4f(0.0);
  for (var k = 0; k < n; k = k + 1) {
    let t = (f32(k) / f32(n - 1)) - 0.5;
    acc = acc + textureSampleLevel(tex, samp, texUV + duv * t, 0.0);
  }
  return acc / f32(n);
}
`;

// A 2.5D projected shadow rendered as two separable Gaussian passes off the
// layer's isolated texture. The shadow samples only the layer's ALPHA: each
// output pixel is inverse-projected back to the object position whose alpha
// casts to it (offset by the light direction, sheared so the cast leans and
// stretches with vertical distance from the anchor, uniformly scaled). The H
// pass projects + blurs horizontally into an intermediate texture; the V pass
// blurs vertically and composites the tinted, premultiplied result under the
// object. blurRadius is a uniform so it animates without recompiling.
const SHADOW_UNIFORM_SIZE = 64;
// Three modes: image (bloom/threshold), outer (alpha-based glow around), inner
// (alpha-inverted glow inside). A single shader handles extract + H blur + V
// blur+composite via entry points. Uniform layout: resolution(2f) + pad(2f) +
// color(4f) + params(4f: intensity, radius, threshold, mode).
const GLOW_UNIFORM_SIZE = 48;
const GLOW_SHADER = /* wgsl */ `
struct GlowU {
  resolution: vec2f,
  _pad: vec2f,
  color: vec4f,
  params: vec4f, // x=intensity, y=radius, z=threshold, w=mode(0=image,1=outer,2=inner)
}

@group(0) @binding(0) var<uniform> u: GlowU;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

struct VO { @builtin(position) position: vec4f }

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VO {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out: VO;
  out.position = vec4f(p[vi], 0.0, 1.0);
  return out;
}

const TAPS: i32 = 20;

fn gw(x: f32, sigma: f32) -> f32 {
  return exp(-0.5 * (x * x) / (sigma * sigma));
}

// Extract pass: extracts the glow source depending on mode.
// mode 0 (image/bloom): pixels above luminance threshold
// mode 1 (outer): alpha channel directly
// mode 2 (inner): inverted alpha (1-a)
@fragment
fn fs_extract(in: VO) -> @location(0) vec4f {
  let uv = in.position.xy / vec2f(textureDimensions(tex));
  let col = textureSampleLevel(tex, samp, uv, 0.0);
  let mode = i32(u.params.w + 0.5);
  let threshold = u.params.z;

  if (mode == 0) {
    let lum = dot(col.rgb, vec3f(0.2126, 0.7152, 0.0722));
    let factor = smoothstep(threshold, threshold + 0.1, lum);
    return vec4f(col.rgb * factor, col.a * factor);
  } else if (mode == 1) {
    return vec4f(u.color.rgb * col.a, col.a);
  } else {
    let inv = 1.0 - col.a;
    return vec4f(u.color.rgb * inv, inv);
  }
}

// Horizontal blur pass
@fragment
fn fs_h(in: VO) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(tex));
  let uv = in.position.xy / dims;
  let radius = u.params.y;
  if (radius < 0.5) {
    return textureSampleLevel(tex, samp, uv, 0.0);
  }
  let sigma = max(radius * 0.5, 0.5);
  let step = radius / f32(TAPS);
  let duvX = step / u.resolution.x;
  var acc = vec4f(0.0);
  var wsum = 0.0;
  for (var i = -TAPS; i <= TAPS; i = i + 1) {
    let off = f32(i);
    let w = gw(off * step, sigma);
    acc = acc + textureSampleLevel(tex, samp, uv + vec2f(off * duvX, 0.0), 0.0) * w;
    wsum = wsum + w;
  }
  return acc / wsum;
}

// Vertical blur pass
@fragment
fn fs_v(in: VO) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(tex));
  let uv = in.position.xy / dims;
  let radius = u.params.y;
  if (radius < 0.5) {
    return textureSampleLevel(tex, samp, uv, 0.0);
  }
  let sigma = max(radius * 0.5, 0.5);
  let step = radius / f32(TAPS);
  let duvY = step / u.resolution.y;
  var acc = vec4f(0.0);
  var wsum = 0.0;
  for (var i = -TAPS; i <= TAPS; i = i + 1) {
    let off = f32(i);
    let w = gw(off * step, sigma);
    acc = acc + textureSampleLevel(tex, samp, uv + vec2f(0.0, off * duvY), 0.0) * w;
    wsum = wsum + w;
  }
  let blurred = acc / wsum;
  let intensity = u.params.x;
  let mode = i32(u.params.w + 0.5);
  // For image glow (bloom): additive blend (alpha=0 signals additive via premultiplied-over)
  if (mode == 0) {
    let rgb = blurred.rgb * intensity * u.color.rgb;
    return vec4f(rgb, 0.0);
  }
  // Outer/inner glow: premultiplied normal composite
  let a = blurred.a * intensity * u.color.a;
  let rgb = u.color.rgb * a;
  return vec4f(rgb, a);
}

// Composite pass for inner glow: masks the glow by the original layer alpha.
// Reads the blurred glow texture at binding(2) and the layer texture at binding(3).
@fragment
fn fs_inner_composite(in: VO) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(tex));
  let uv = in.position.xy / dims;
  let glowSample = textureSampleLevel(tex, samp, uv, 0.0);
  // For inner glow we need the original layer alpha to mask.
  // This entry point is only used when mode==2 (inner). The glow was already
  // computed from inverted alpha, so we multiply by original alpha to confine
  // it inside the object silhouette.
  // NOTE: in the inner composite pipeline, binding(2) is the glow blur result.
  // The layer alpha is baked into the V pass output already for mode==2, so we
  // just pass through the premultiplied result.
  let intensity = u.params.x;
  let a = glowSample.a * intensity * u.color.a;
  let rgb = u.color.rgb * a;
  return vec4f(rgb, a);
}
`;

const SHADOW_SHADER = /* wgsl */ `
struct ShadowU {
  resolution: vec2f,   // composition space (width, height)
  anchor: vec2f,       // projection pivot in composition space
  offset: vec2f,       // light offset in composition px
  params: vec4f,       // x = scale, y = skew, z = blurRadius (comp px), w = unused
  color: vec4f,        // shadow tint, straight alpha 0..1
}

@group(0) @binding(0) var<uniform> u: ShadowU;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

struct VO { @builtin(position) position: vec4f }

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VO {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out: VO;
  out.position = vec4f(p[vi], 0.0, 1.0);
  return out;
}

const TAPS: i32 = 16;

fn gw(x: f32, sigma: f32) -> f32 {
  return exp(-0.5 * (x * x) / (sigma * sigma));
}

// Inverse of the forward projection: given an output composition position,
// return the object composition position whose alpha is cast to it.
fn unproject(op: vec2f) -> vec2f {
  let scale = max(u.params.x, 0.0001);
  let skew = u.params.y;
  let relY = (op.y - u.anchor.y - u.offset.y) / scale;
  let sy = u.anchor.y + relY;
  let sx = u.anchor.x + (op.x - u.anchor.x - u.offset.x) / scale - skew * relY;
  return vec2f(sx, sy);
}

fn sampleAlpha(compPos: vec2f) -> f32 {
  let uv = compPos / u.resolution;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return 0.0; }
  return textureSampleLevel(tex, samp, uv, 0.0).a;
}

@fragment
fn fs_h(in: VO) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(tex));
  let op = (in.position.xy / dims) * u.resolution;
  let radius = u.params.z;
  if (radius < 0.5) {
    return vec4f(u.color.rgb, sampleAlpha(unproject(op)));
  }
  let sigma = max(radius * 0.5, 0.5);
  let step = radius / f32(TAPS);
  var acc = 0.0;
  var wsum = 0.0;
  for (var i = -TAPS; i <= TAPS; i = i + 1) {
    let dx = f32(i) * step;
    let w = gw(dx, sigma);
    acc = acc + sampleAlpha(unproject(op + vec2f(dx, 0.0))) * w;
    wsum = wsum + w;
  }
  return vec4f(u.color.rgb, acc / wsum);
}

@fragment
fn fs_v(in: VO) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(tex));
  let uv = in.position.xy / dims;
  let radius = u.params.z;
  var a = 0.0;
  if (radius < 0.5) {
    a = textureSampleLevel(tex, samp, uv, 0.0).a;
  } else {
    let sigma = max(radius * 0.5, 0.5);
    let step = radius / f32(TAPS);
    let duvY = step / u.resolution.y;
    var acc = 0.0;
    var wsum = 0.0;
    for (var i = -TAPS; i <= TAPS; i = i + 1) {
      let off = f32(i);
      let w = gw(off * step, sigma);
      acc = acc + textureSampleLevel(tex, samp, uv + vec2f(0.0, off * duvY), 0.0).a * w;
      wsum = wsum + w;
    }
    a = acc / wsum;
  }
  let alpha = a * u.color.a;
  return vec4f(u.color.rgb * alpha, alpha);
}
`;

// ─── LAYER BLUR EFFECT ─────────────────────────────────────────────────────
// Supports 4 modes: gaussian (separable), directional, radial, and kawase.
// All modes use the same uniform layout for simplicity; each mode interprets
// the parameters differently. Two full-screen passes (H+V for gaussian/kawase,
// or multi-tap for directional/radial) operate on the isolated layer texture.
const BLUR_EFFECT_SHADER = /* wgsl */ `
struct BlurFxU {
  resolution: vec2f,   // composition size
  params: vec4f,       // x = radius, y = angle (radians), z = strength, w = mode (0=gauss,1=dir,2=radial,3=kawase)
  center: vec2f,       // center for radial/zoom blur (UV 0..1)
  extra: vec2f,        // x = pass index (kawase), y = passes count
}

@group(0) @binding(0) var<uniform> u: BlurFxU;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

struct VO { @builtin(position) position: vec4f }

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VO {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out: VO;
  out.position = vec4f(p[vi], 0.0, 1.0);
  return out;
}

fn gw(x: f32, sigma: f32) -> f32 {
  return exp(-0.5 * (x * x) / (sigma * sigma));
}

const TAPS: i32 = 15;

// Gaussian horizontal pass
@fragment
fn fs_gauss_h(in: VO) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(tex));
  let uv = in.position.xy / dims;
  let radius = u.params.x;
  if (radius < 0.5) { return textureSampleLevel(tex, samp, uv, 0.0); }
  let sigma = max(radius * 0.5, 1.0);
  let step = radius / f32(TAPS);
  let duvX = step / dims.x;
  var acc = vec4f(0.0);
  var wsum = 0.0;
  for (var i = -TAPS; i <= TAPS; i = i + 1) {
    let off = f32(i);
    let w = gw(off * step, sigma);
    acc = acc + textureSampleLevel(tex, samp, uv + vec2f(off * duvX, 0.0), 0.0) * w;
    wsum = wsum + w;
  }
  return acc / wsum;
}

// Gaussian vertical pass
@fragment
fn fs_gauss_v(in: VO) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(tex));
  let uv = in.position.xy / dims;
  let radius = u.params.x;
  if (radius < 0.5) { return textureSampleLevel(tex, samp, uv, 0.0); }
  let sigma = max(radius * 0.5, 1.0);
  let step = radius / f32(TAPS);
  let duvY = step / dims.y;
  var acc = vec4f(0.0);
  var wsum = 0.0;
  for (var i = -TAPS; i <= TAPS; i = i + 1) {
    let off = f32(i);
    let w = gw(off * step, sigma);
    acc = acc + textureSampleLevel(tex, samp, uv + vec2f(0.0, off * duvY), 0.0) * w;
    wsum = wsum + w;
  }
  return acc / wsum;
}

// Directional blur: samples along a single direction vector
@fragment
fn fs_directional(in: VO) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(tex));
  let uv = in.position.xy / dims;
  let strength = u.params.z;
  if (strength < 0.5) { return textureSampleLevel(tex, samp, uv, 0.0); }
  let angle = u.params.y;
  let dir = vec2f(cos(angle), sin(angle)) / dims * strength;
  let samples = TAPS * 2 + 1;
  var acc = vec4f(0.0);
  for (var i = -TAPS; i <= TAPS; i = i + 1) {
    let off = f32(i) / f32(TAPS);
    acc = acc + textureSampleLevel(tex, samp, uv + dir * off, 0.0);
  }
  return acc / f32(samples);
}

// Radial blur: samples along direction from center to pixel
@fragment
fn fs_radial(in: VO) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(tex));
  let uv = in.position.xy / dims;
  let strength = u.params.z;
  if (strength < 0.001) { return textureSampleLevel(tex, samp, uv, 0.0); }
  let center = u.center;
  let dir = uv - center;
  let dist = length(dir);
  let step = dir * (strength * 0.01) / f32(TAPS);
  let samples = TAPS * 2 + 1;
  var acc = vec4f(0.0);
  for (var i = -TAPS; i <= TAPS; i = i + 1) {
    acc = acc + textureSampleLevel(tex, samp, uv + step * f32(i), 0.0);
  }
  return acc / f32(samples);
}

// Kawase blur: 4-corner sampling with progressive offset
@fragment
fn fs_kawase(in: VO) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(tex));
  let uv = in.position.xy / dims;
  let passIdx = u.extra.x;
  let offset = (passIdx + 0.5) / dims;
  let tl = textureSampleLevel(tex, samp, uv + vec2f(-offset.x, -offset.y), 0.0);
  let tr = textureSampleLevel(tex, samp, uv + vec2f( offset.x, -offset.y), 0.0);
  let bl = textureSampleLevel(tex, samp, uv + vec2f(-offset.x,  offset.y), 0.0);
  let br = textureSampleLevel(tex, samp, uv + vec2f( offset.x,  offset.y), 0.0);
  return (tl + tr + bl + br) * 0.25;
}
`;

// Final copy of the composited scene texture to the swapchain. Both store
// premultiplied alpha, so the sample is written through unchanged.
const BLIT_SHADER = /* wgsl */ `
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;

struct VO {
  @builtin(position) position: vec4f,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VO {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out: VO;
  out.position = vec4f(p[vi], 0.0, 1.0);
  return out;
}

@fragment
fn fs(in: VO) -> @location(0) vec4f {
  let texUV = in.position.xy / vec2f(textureDimensions(tex));
  return textureSampleLevel(tex, samp, texUV, 0.0);
}
`;

interface GPUState {
  device: GPUDevice;
  context: GPUCanvasContext;
  pipeline: GPURenderPipeline;
  textPipeline: GPURenderPipeline;
  imagePipeline: GPURenderPipeline;
  bgPipeline: GPURenderPipeline;
  pathPipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
  textUniformBuffer: GPUBuffer;
  imageUniformBuffer: GPUBuffer;
  bgUniformBuffer: GPUBuffer;
  pathUniformBuffer: GPUBuffer;
  pathVertexBuffer: GPUBuffer;
  pathVertexCapacity: number;
  bgBindGroup: GPUBindGroup;
  bindGroupLayout: GPUBindGroupLayout;
  textBindGroupLayout: GPUBindGroupLayout;
  imageBindGroupLayout: GPUBindGroupLayout;
  pathBindGroupLayout: GPUBindGroupLayout;
  textSampler: GPUSampler;
  format: GPUTextureFormat;

  // Motion-blur multi-pass resources. Pipelines/buffers/layouts are created
  // once; the textures + bind groups are (re)allocated lazily by
  // ensureBlurTextures and reused across frames until dimensions change.
  blurPipeline: GPURenderPipeline;
  blitPipeline: GPURenderPipeline;
  blurUniformBuffer: GPUBuffer;
  blurBindGroupLayout: GPUBindGroupLayout;
  blitBindGroupLayout: GPUBindGroupLayout;
  sceneTex: GPUTexture | null;
  layerTex: GPUTexture | null;
  sceneTexView: GPUTextureView | null;
  layerTexView: GPUTextureView | null;
  blurBindGroup: GPUBindGroup | null;
  blitBindGroup: GPUBindGroup | null;
  blurTexW: number;
  blurTexH: number;

  // 2.5D shadow multi-pass resources. The horizontal pass reads the isolated
  // layer texture (alpha only) and writes the projected, horizontally-blurred
  // shadow into shadowTex; the vertical pass blurs shadowTex and composites the
  // tinted result under the object. Created once; textures/bind groups reused.
  shadowHPipeline: GPURenderPipeline;
  shadowVPipeline: GPURenderPipeline;
  shadowUniformBuffer: GPUBuffer;
  shadowBindGroupLayout: GPUBindGroupLayout;
  shadowTex: GPUTexture | null;
  shadowTexView: GPUTextureView | null;
  shadowBindGroupH: GPUBindGroup | null;
  shadowBindGroupV: GPUBindGroup | null;

  // Glow effect multi-pass resources: extract (luminance/alpha threshold),
  // horizontal blur, vertical blur + composite. Two intermediate textures.
  glowExtractPipeline: GPURenderPipeline;
  glowHPipeline: GPURenderPipeline;
  glowVPipeline: GPURenderPipeline;
  glowUniformBuffer: GPUBuffer;
  glowBindGroupLayout: GPUBindGroupLayout;
  glowExtractTex: GPUTexture | null;
  glowExtractTexView: GPUTextureView | null;
  glowBlurTex: GPUTexture | null;
  glowBlurTexView: GPUTextureView | null;
  glowBindGroupLayer: GPUBindGroup | null;
  glowBindGroupExtract: GPUBindGroup | null;
  glowBindGroupBlur: GPUBindGroup | null;

  // Layer blur effect (gaussian/directional/radial/kawase). Uses the same
  // isolation workflow as shadow/glow: render layer → blurFxTex → composite.
  blurFxHPipeline: GPURenderPipeline;
  blurFxVPipeline: GPURenderPipeline;
  blurFxDirPipeline: GPURenderPipeline;
  blurFxRadialPipeline: GPURenderPipeline;
  blurFxKawasePipeline: GPURenderPipeline;
  blurFxUniformBuffer: GPUBuffer;
  blurFxBindGroupLayout: GPUBindGroupLayout;
  blurFxTex: GPUTexture | null;
  blurFxTexView: GPUTextureView | null;
  blurFxBindGroupLayer: GPUBindGroup | null;
  blurFxBindGroupTex: GPUBindGroup | null;
}

export interface RendererStats {
  textTextures: number;
  imageTextures: number;
  totalTextures: number;
  // Cached Render Tree debug counters.
  textCacheHits: number;
  textCacheMisses: number;
  textCacheEvictions: number;
  textCacheBytes: number;
  pathCacheHits: number;
  pathCacheMisses: number;
  pathCacheEvictions: number;
  pathCacheBytes: number;
  tree: RenderTreeStats;
}

export class WebGPURenderer {
  private gpu: GPUState | null = null;
  private offscreenCanvas: OffscreenCanvas | null = null;
  private offscreenGpu: GPUState | null = null;
  private ready = false;
  private offscreenReady = false;
  // Rasterized text textures, evicted LRU under a GPU byte budget. Keys in use
  // this frame are pinned so a draw is never starved of its texture.
  private activeTextKeys = new Set<string>();
  private textTextureCache = new LruCache<GPUTexture>({
    maxBytes: 128 * 1024 * 1024,
    maxEntries: 512,
    onEvict: (_key, tex) => {
      try { tex.destroy(); } catch { /* already gone */ }
    },
    isPinned: (key) => this.activeTextKeys.has(key),
  });
  // Cached Render Tree: tracks dirty/clean state and hierarchical invalidation.
  private renderTree = new RenderTree();
  private frameClock = 0;
  private imageTextures = new Map<string, { texture: GPUTexture; width: number; height: number }>();
  private deviceLost = false;
  private renderErrorCount = 0;
  private deviceLostCallbacks = new Set<(reason: string) => void>();
  // Directional samples taken along the velocity vector in the blur shader.
  // Driven by the quality/export settings (4 = draft, 8 = preview, 16 = high).
  private motionBlurSamples = 16;

  setMotionBlurSamples(n: number): void {
    this.motionBlurSamples = Math.max(2, Math.round(n));
  }

  async initialize(canvas: HTMLCanvasElement): Promise<boolean> {
    if (!navigator.gpu) return false;

    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return false;

    const device = await adapter.requestDevice();

    const context = canvas.getContext('webgpu');
    if (!context) return false;

    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'premultiplied' });

    this.gpu = this.createPipeline(device, context, format);
    this.ready = true;
    this.deviceLost = false;
    videoTextureCache.init(device);
    this.watchDeviceLoss(device);
    return true;
  }

  private watchDeviceLoss(device: GPUDevice): void {
    device.lost.then((info) => {
      // 'destroyed' is an intentional teardown via destroy(); ignore it.
      if (info.reason === 'destroyed') return;
      this.deviceLost = true;
      this.ready = false;
      videoTextureCache.destroyAll();
      const reason = info.message || info.reason || 'unknown';
      for (const cb of this.deviceLostCallbacks) {
        try { cb(reason); } catch { /* listener errors must not break recovery */ }
      }
    }).catch(() => { /* ignore */ });
  }

  onDeviceLost(cb: (reason: string) => void): () => void {
    this.deviceLostCallbacks.add(cb);
    return () => { this.deviceLostCallbacks.delete(cb); };
  }

  isDeviceLost(): boolean {
    return this.deviceLost;
  }

  getStats(): RendererStats {
    const textTextures = this.textTextureCache.size;
    const imageTextures = this.imageTextures.size;
    const textStats = this.textTextureCache.stats();
    const pathStats = getPathTessellationStats();
    return {
      textTextures,
      imageTextures,
      totalTextures: textTextures + imageTextures,
      textCacheHits: textStats.hits,
      textCacheMisses: textStats.misses,
      textCacheEvictions: textStats.evictions,
      textCacheBytes: textStats.bytes,
      pathCacheHits: pathStats.hits,
      pathCacheMisses: pathStats.misses,
      pathCacheEvictions: pathStats.evictions,
      pathCacheBytes: pathStats.bytes,
      tree: this.renderTree.stats(),
    };
  }

  // Release all cached GPU textures without tearing down the device. Used by the
  // memory monitor to relieve pressure, and by Reset Editor as a first pass.
  flushTextureCaches(): void {
    this.activeTextKeys.clear();
    this.textTextureCache.clear();
    for (const entry of this.imageTextures.values()) {
      try { entry.texture.destroy(); } catch { /* already gone */ }
    }
    this.imageTextures.clear();
    videoTextureCache.flush();
  }

  async initializeOffscreen(width: number, height: number): Promise<boolean> {
    if (!navigator.gpu) return false;

    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return false;

    const device = await adapter.requestDevice();

    this.offscreenCanvas = new OffscreenCanvas(width, height);
    const context = this.offscreenCanvas.getContext('webgpu');
    if (!context) return false;

    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'premultiplied' });

    this.offscreenGpu = this.createPipeline(device, context as GPUCanvasContext, format);
    this.offscreenReady = true;
    return true;
  }

  isReady(): boolean {
    return this.ready;
  }

  isOffscreenReady(): boolean {
    return this.offscreenReady;
  }

  private createPipeline(
    device: GPUDevice,
    context: GPUCanvasContext,
    format: GPUTextureFormat
  ): GPUState {
    const shaderModule = device.createShaderModule({ code: RECT_SHADER });

    const uniformBuffer = device.createBuffer({
      size: SHAPE_UNIFORM_ALIGN * MAX_LAYERS,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: SHAPE_UNIFORM_SIZE },
      }],
    });

    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

    const blendState: GPUBlendState = {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    };

    const pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vs' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs',
        targets: [{ format, blend: blendState }],
      },
      primitive: { topology: 'triangle-list' },
    });

    const textShaderModule = device.createShaderModule({ code: TEXT_SHADER });

    const textUniformBuffer = device.createBuffer({
      size: UNIFORM_ALIGN * MAX_LAYERS,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const textBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: TEXT_UNIFORM_SIZE },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
      ],
    });

    const textPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [textBindGroupLayout] });

    const textPipeline = device.createRenderPipeline({
      layout: textPipelineLayout,
      vertex: { module: textShaderModule, entryPoint: 'vs' },
      fragment: {
        module: textShaderModule,
        entryPoint: 'fs',
        targets: [{ format, blend: blendState }],
      },
      primitive: { topology: 'triangle-list' },
    });

    const textSampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });

    // Background pipeline
    const bgShaderModule = device.createShaderModule({ code: BG_SHADER });
    const bgUniformBuffer = device.createBuffer({
      size: BG_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bgBindGroupLayout = device.createBindGroupLayout({
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform', minBindingSize: BG_UNIFORM_SIZE },
      }],
    });

    const bgPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bgBindGroupLayout] });
    const bgPipeline = device.createRenderPipeline({
      layout: bgPipelineLayout,
      vertex: { module: bgShaderModule, entryPoint: 'vs' },
      fragment: {
        module: bgShaderModule,
        entryPoint: 'fs',
        targets: [{ format }],
      },
      primitive: { topology: 'triangle-list' },
    });

    const bgBindGroup = device.createBindGroup({
      layout: bgBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: bgUniformBuffer } }],
    });

    // Image pipeline (with filters + color correction)
    const imageShaderModule = device.createShaderModule({ code: IMAGE_SHADER });

    const imageUniformBuffer = device.createBuffer({
      size: IMAGE_UNIFORM_ALIGN * MAX_LAYERS,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const imageBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: IMAGE_UNIFORM_SIZE },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
      ],
    });

    const imagePipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [imageBindGroupLayout] });

    const imagePipeline = device.createRenderPipeline({
      layout: imagePipelineLayout,
      vertex: { module: imageShaderModule, entryPoint: 'vs' },
      fragment: {
        module: imageShaderModule,
        entryPoint: 'fs',
        targets: [{ format, blend: blendState }],
      },
      primitive: { topology: 'triangle-list' },
    });

    // Path pipeline (tessellated vector geometry, per-vertex color)
    const pathShaderModule = device.createShaderModule({ code: PATH_SHADER });

    const pathUniformBuffer = device.createBuffer({
      size: UNIFORM_ALIGN * MAX_LAYERS,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const pathVertexBuffer = device.createBuffer({
      size: PATH_VERTEX_STRIDE * PATH_INITIAL_VERTS,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    const pathBindGroupLayout = device.createBindGroupLayout({
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: PATH_UNIFORM_SIZE },
      }],
    });

    const pathPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [pathBindGroupLayout] });

    const pathPipeline = device.createRenderPipeline({
      layout: pathPipelineLayout,
      vertex: {
        module: pathShaderModule,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: PATH_VERTEX_STRIDE,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 8, format: 'float32x4' },
          ],
        }],
      },
      fragment: {
        module: pathShaderModule,
        entryPoint: 'fs',
        targets: [{ format, blend: blendState }],
      },
      primitive: { topology: 'triangle-list' },
    });

    // Motion-blur pass: directional sampling of an isolated layer texture,
    // composited over the scene with premultiplied-alpha "over" blending.
    const blurShaderModule = device.createShaderModule({ code: BLUR_SHADER });
    const blurUniformBuffer = device.createBuffer({
      size: UNIFORM_ALIGN * MAX_LAYERS,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const blurBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: BLUR_UNIFORM_SIZE },
        },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      ],
    });
    const premultipliedOver: GPUBlendState = {
      color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    };
    const blurPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [blurBindGroupLayout] }),
      vertex: { module: blurShaderModule, entryPoint: 'vs' },
      fragment: {
        module: blurShaderModule,
        entryPoint: 'fs',
        targets: [{ format, blend: premultipliedOver }],
      },
      primitive: { topology: 'triangle-list' },
    });

    // 2.5D shadow passes: project + blur an isolated layer's alpha in two
    // separable Gaussian passes, then composite under the object.
    const shadowShaderModule = device.createShaderModule({ code: SHADOW_SHADER });
    const shadowUniformBuffer = device.createBuffer({
      size: UNIFORM_ALIGN * MAX_LAYERS,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const shadowBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: SHADOW_UNIFORM_SIZE },
        },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      ],
    });
    const shadowPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [shadowBindGroupLayout] });
    const shadowHPipeline = device.createRenderPipeline({
      layout: shadowPipelineLayout,
      vertex: { module: shadowShaderModule, entryPoint: 'vs' },
      fragment: { module: shadowShaderModule, entryPoint: 'fs_h', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    const shadowVPipeline = device.createRenderPipeline({
      layout: shadowPipelineLayout,
      vertex: { module: shadowShaderModule, entryPoint: 'vs' },
      fragment: {
        module: shadowShaderModule,
        entryPoint: 'fs_v',
        targets: [{ format, blend: premultipliedOver }],
      },
      primitive: { topology: 'triangle-list' },
    });

    // Glow effect passes: extract → H blur → V blur+composite.
    const glowShaderModule = device.createShaderModule({ code: GLOW_SHADER });
    const glowUniformBuffer = device.createBuffer({
      size: UNIFORM_ALIGN * MAX_LAYERS,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const glowBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: GLOW_UNIFORM_SIZE },
        },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      ],
    });
    const glowPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [glowBindGroupLayout] });
    const glowExtractPipeline = device.createRenderPipeline({
      layout: glowPipelineLayout,
      vertex: { module: glowShaderModule, entryPoint: 'vs' },
      fragment: { module: glowShaderModule, entryPoint: 'fs_extract', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    const glowHPipeline = device.createRenderPipeline({
      layout: glowPipelineLayout,
      vertex: { module: glowShaderModule, entryPoint: 'vs' },
      fragment: { module: glowShaderModule, entryPoint: 'fs_h', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    const glowVPipeline = device.createRenderPipeline({
      layout: glowPipelineLayout,
      vertex: { module: glowShaderModule, entryPoint: 'vs' },
      fragment: {
        module: glowShaderModule,
        entryPoint: 'fs_v',
        targets: [{ format, blend: premultipliedOver }],
      },
      primitive: { topology: 'triangle-list' },
    });

    // Layer blur effect pipelines (gaussian H/V, directional, radial, kawase).
    const blurFxShaderModule = device.createShaderModule({ code: BLUR_EFFECT_SHADER });
    const blurFxUniformBuffer = device.createBuffer({
      size: UNIFORM_ALIGN * MAX_LAYERS,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const blurFxBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 48 },
        },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      ],
    });
    const blurFxPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [blurFxBindGroupLayout] });
    const blurFxHPipeline = device.createRenderPipeline({
      layout: blurFxPipelineLayout,
      vertex: { module: blurFxShaderModule, entryPoint: 'vs' },
      fragment: { module: blurFxShaderModule, entryPoint: 'fs_gauss_h', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    const blurFxVPipeline = device.createRenderPipeline({
      layout: blurFxPipelineLayout,
      vertex: { module: blurFxShaderModule, entryPoint: 'vs' },
      fragment: { module: blurFxShaderModule, entryPoint: 'fs_gauss_v', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    const blurFxDirPipeline = device.createRenderPipeline({
      layout: blurFxPipelineLayout,
      vertex: { module: blurFxShaderModule, entryPoint: 'vs' },
      fragment: { module: blurFxShaderModule, entryPoint: 'fs_directional', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    const blurFxRadialPipeline = device.createRenderPipeline({
      layout: blurFxPipelineLayout,
      vertex: { module: blurFxShaderModule, entryPoint: 'vs' },
      fragment: { module: blurFxShaderModule, entryPoint: 'fs_radial', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    const blurFxKawasePipeline = device.createRenderPipeline({
      layout: blurFxPipelineLayout,
      vertex: { module: blurFxShaderModule, entryPoint: 'vs' },
      fragment: { module: blurFxShaderModule, entryPoint: 'fs_kawase', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });

    // Final blit of the composited scene texture to the swapchain.
    const blitShaderModule = device.createShaderModule({ code: BLIT_SHADER });
    const blitBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      ],
    });
    const blitPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [blitBindGroupLayout] }),
      vertex: { module: blitShaderModule, entryPoint: 'vs' },
      fragment: { module: blitShaderModule, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });

    return {
      device, context, pipeline, textPipeline, imagePipeline, bgPipeline, pathPipeline,
      uniformBuffer, textUniformBuffer, imageUniformBuffer, bgUniformBuffer, pathUniformBuffer,
      pathVertexBuffer, pathVertexCapacity: PATH_INITIAL_VERTS, bgBindGroup,
      bindGroupLayout, textBindGroupLayout, imageBindGroupLayout, pathBindGroupLayout,
      textSampler, format,
      blurPipeline, blitPipeline, blurUniformBuffer, blurBindGroupLayout, blitBindGroupLayout,
      sceneTex: null, layerTex: null, sceneTexView: null, layerTexView: null,
      blurBindGroup: null, blitBindGroup: null, blurTexW: 0, blurTexH: 0,
      shadowHPipeline, shadowVPipeline, shadowUniformBuffer, shadowBindGroupLayout,
      shadowTex: null, shadowTexView: null, shadowBindGroupH: null, shadowBindGroupV: null,
      glowExtractPipeline, glowHPipeline, glowVPipeline, glowUniformBuffer, glowBindGroupLayout,
      glowExtractTex: null, glowExtractTexView: null, glowBlurTex: null, glowBlurTexView: null,
      glowBindGroupLayer: null, glowBindGroupExtract: null, glowBindGroupBlur: null,
      blurFxHPipeline, blurFxVPipeline, blurFxDirPipeline, blurFxRadialPipeline, blurFxKawasePipeline,
      blurFxUniformBuffer, blurFxBindGroupLayout,
      blurFxTex: null, blurFxTexView: null, blurFxBindGroupLayer: null, blurFxBindGroupTex: null,
    };
  }

  // Allocate (or reuse) the scene + isolated-layer textures used by the
  // motion-blur passes. Allocation only happens on first use and when the
  // target dimensions change — never per frame — so VRAM stays bounded.
  // Per-precomp offscreen render targets (nested composition → texture), pooled by
  // precomp layer id and reused across frames; reallocated on a size change.
  private precompTexPool = new Map<string, { tex: GPUTexture; view: GPUTextureView; w: number; h: number }>();

  private ensurePrecompTexture(gpu: GPUState, id: string, w: number, h: number): GPUTextureView {
    const width = Math.max(1, Math.round(w));
    const height = Math.max(1, Math.round(h));
    const existing = this.precompTexPool.get(id);
    if (existing && existing.w === width && existing.h === height) return existing.view;
    existing?.tex.destroy();
    const tex = gpu.device.createTexture({
      size: { width, height },
      format: gpu.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    const view = tex.createView();
    this.precompTexPool.set(id, { tex, view, w: width, h: height });
    return view;
  }

  // Recursively pin text-texture cache keys for nested precomp frames so the LRU
  // cannot evict a texture a sub-composition still needs this frame.
  private pinNestedTextKeys(frame: RenderFrame): void {
    for (const layer of frame.layers) {
      if (layer.layerType === 'text' && layer.text) {
        const key = textCacheKey(layer.text);
        if (key) this.activeTextKeys.add(key);
      } else if (layer.layerType === 'precomp' && layer.precomp?.renderFrame) {
        this.pinNestedTextKeys(layer.precomp.renderFrame);
      }
    }
  }

  private ensureBlurTextures(gpu: GPUState, width: number, height: number): void {
    if (gpu.sceneTex && gpu.layerTex && gpu.blurTexW === width && gpu.blurTexH === height) return;

    gpu.sceneTex?.destroy();
    gpu.layerTex?.destroy();
    gpu.shadowTex?.destroy();
    gpu.glowExtractTex?.destroy();
    gpu.glowBlurTex?.destroy();

    const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
    gpu.sceneTex = gpu.device.createTexture({ size: { width, height }, format: gpu.format, usage });
    gpu.layerTex = gpu.device.createTexture({ size: { width, height }, format: gpu.format, usage });
    gpu.shadowTex = gpu.device.createTexture({ size: { width, height }, format: gpu.format, usage });
    gpu.glowExtractTex = gpu.device.createTexture({ size: { width, height }, format: gpu.format, usage });
    gpu.glowBlurTex = gpu.device.createTexture({ size: { width, height }, format: gpu.format, usage });
    gpu.sceneTexView = gpu.sceneTex.createView();
    gpu.layerTexView = gpu.layerTex.createView();
    gpu.shadowTexView = gpu.shadowTex.createView();
    gpu.glowExtractTexView = gpu.glowExtractTex.createView();
    gpu.glowBlurTexView = gpu.glowBlurTex.createView();
    gpu.blurTexW = width;
    gpu.blurTexH = height;

    gpu.blurBindGroup = gpu.device.createBindGroup({
      layout: gpu.blurBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: gpu.blurUniformBuffer, size: BLUR_UNIFORM_SIZE } },
        { binding: 1, resource: gpu.textSampler },
        { binding: 2, resource: gpu.layerTexView },
      ],
    });
    gpu.blitBindGroup = gpu.device.createBindGroup({
      layout: gpu.blitBindGroupLayout,
      entries: [
        { binding: 0, resource: gpu.textSampler },
        { binding: 1, resource: gpu.sceneTexView },
      ],
    });

    // H pass reads the isolated layer texture; V pass reads the H result.
    gpu.shadowBindGroupH = gpu.device.createBindGroup({
      layout: gpu.shadowBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: gpu.shadowUniformBuffer, size: SHADOW_UNIFORM_SIZE } },
        { binding: 1, resource: gpu.textSampler },
        { binding: 2, resource: gpu.layerTexView },
      ],
    });
    gpu.shadowBindGroupV = gpu.device.createBindGroup({
      layout: gpu.shadowBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: gpu.shadowUniformBuffer, size: SHADOW_UNIFORM_SIZE } },
        { binding: 1, resource: gpu.textSampler },
        { binding: 2, resource: gpu.shadowTexView },
      ],
    });

    // Glow bind groups: extract reads layerTex, H reads extractTex, V reads blurTex.
    gpu.glowBindGroupLayer = gpu.device.createBindGroup({
      layout: gpu.glowBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: gpu.glowUniformBuffer, size: GLOW_UNIFORM_SIZE } },
        { binding: 1, resource: gpu.textSampler },
        { binding: 2, resource: gpu.layerTexView },
      ],
    });
    gpu.glowBindGroupExtract = gpu.device.createBindGroup({
      layout: gpu.glowBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: gpu.glowUniformBuffer, size: GLOW_UNIFORM_SIZE } },
        { binding: 1, resource: gpu.textSampler },
        { binding: 2, resource: gpu.glowExtractTexView },
      ],
    });
    gpu.glowBindGroupBlur = gpu.device.createBindGroup({
      layout: gpu.glowBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: gpu.glowUniformBuffer, size: GLOW_UNIFORM_SIZE } },
        { binding: 1, resource: gpu.textSampler },
        { binding: 2, resource: gpu.glowBlurTexView },
      ],
    });

    // Layer blur effect bind groups: reads layerTex first, then ping-pongs via blurFxTex.
    gpu.blurFxTex?.destroy();
    gpu.blurFxTex = gpu.device.createTexture({ size: { width, height }, format: gpu.format, usage });
    gpu.blurFxTexView = gpu.blurFxTex.createView();
    gpu.blurFxBindGroupLayer = gpu.device.createBindGroup({
      layout: gpu.blurFxBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: gpu.blurFxUniformBuffer, size: 48 } },
        { binding: 1, resource: gpu.textSampler },
        { binding: 2, resource: gpu.layerTexView },
      ],
    });
    gpu.blurFxBindGroupTex = gpu.device.createBindGroup({
      layout: gpu.blurFxBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: gpu.blurFxUniformBuffer, size: 48 } },
        { binding: 1, resource: gpu.textSampler },
        { binding: 2, resource: gpu.blurFxTexView },
      ],
    });
  }

  private ensurePathVertexCapacity(gpu: GPUState, vertexCount: number): void {
    if (vertexCount <= gpu.pathVertexCapacity) return;
    let cap = gpu.pathVertexCapacity;
    while (cap < vertexCount) cap *= 2;
    gpu.pathVertexBuffer.destroy();
    gpu.pathVertexBuffer = gpu.device.createBuffer({
      size: PATH_VERTEX_STRIDE * cap,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    gpu.pathVertexCapacity = cap;
  }

  renderFrame(frame: RenderFrame, target: 'screen' | 'offscreen' = 'screen'): void {
    if (target === 'screen' && this.deviceLost) return;
    try {
      this.renderFrameUnsafe(frame, target);
    } catch (err) {
      if (target === 'screen') this.handleRenderError(err);
      else throw err;
    }
  }

  private handleRenderError(err: unknown): void {
    this.renderErrorCount++;
    const reason = err instanceof Error ? err.message : String(err);
    // Repeated synchronous render failures indicate a dead/corrupt device that
    // the async device.lost promise may not have surfaced yet. Treat as loss.
    if (this.renderErrorCount >= 3 && !this.deviceLost) {
      this.deviceLost = true;
      this.ready = false;
      for (const cb of this.deviceLostCallbacks) {
        try { cb(reason); } catch { /* ignore */ }
      }
    }
  }

  private renderFrameUnsafe(frame: RenderFrame, target: 'screen' | 'offscreen' = 'screen', opts?: PrecompRenderOpts): void {
    const gpu = target === 'screen' ? this.gpu : this.offscreenGpu;
    if (!gpu) return;
    const depth = opts?.depth ?? 0;

    const { device, context, pipeline, textPipeline, imagePipeline, bgPipeline, pathPipeline, uniformBuffer, textUniformBuffer, imageUniformBuffer, pathUniformBuffer, bgBindGroup, bindGroupLayout, textBindGroupLayout, imageBindGroupLayout, pathBindGroupLayout, textSampler } = gpu;

    // Upload background uniforms (per-call — a nested precomp frame has its own bg).
    this.uploadBackgroundUniforms(gpu, frame.background);

    // Cached Render Tree bookkeeping runs ONLY at the top level; nested precomp
    // frames re-render fully into their own textures (no dirty-tracking). Text keys
    // are pinned recursively so a sub-composition's text texture can't be evicted.
    if (depth === 0) {
      this.frameClock++;
      this.renderTree.syncFromLayers(frame.layers);
      this.activeTextKeys.clear();
      this.pinNestedTextKeys(frame);
      this.renderTree.markAllClean(this.frameClock);
    }

    // Precomp pre-pass: render each precomp layer's nested composition into its own
    // pooled texture, via a RECURSIVE renderFrameUnsafe with its own encoder+submit
    // (so passes never alias the parent's in-flight scene pass). The resolve step
    // already bounded nesting (renderFrame is null past the cap); a render-depth cap
    // is a second backstop.
    const precompViews = new Map<string, GPUTextureView>();
    if (depth < MAX_PRECOMP_DEPTH) {
      for (const layer of frame.layers) {
        if (layer.layerType === 'precomp' && layer.precomp?.renderFrame) {
          const pc = layer.precomp;
          const view = this.ensurePrecompTexture(gpu, layer.id, pc.width, pc.height);
          this.renderFrameUnsafe(pc.renderFrame!, target, {
            depth: depth + 1, targetView: view, targetW: pc.width, targetH: pc.height, clearAlpha: 0,
          });
          precompViews.set(layer.id, view);
        }
      }
    }

    const shapeLayers: { index: number; layer: ResolvedLayer }[] = [];
    const textLayers: { index: number; layer: ResolvedLayer }[] = [];
    const videoLayers: { index: number; layer: ResolvedLayer }[] = [];
    const imageLayers: { index: number; layer: ResolvedLayer }[] = [];
    const pathLayers: { index: number; layer: ResolvedLayer }[] = [];

    // Expand procedural grid/tile layers into multiple instances
    const expandedLayers: ResolvedLayer[] = [];
    for (const layer of frame.layers) {
      if (layer.proceduralLoop?.kind === 'gridArray' && layer.proceduralLoop.grid) {
        const grid = layer.proceduralLoop.grid;
        const totalWidth = grid.gridCols * grid.cellWidth;
        const totalHeight = grid.gridRows * grid.cellHeight;
        const baseX = layer.transform.positionX - totalWidth / 2;
        const baseY = layer.transform.positionY - totalHeight / 2;
        for (const inst of grid.instances) {
          expandedLayers.push({
            ...layer,
            proceduralLoop: undefined,
            transform: {
              ...layer.transform,
              positionX: baseX + inst.x + grid.cellWidth / 2,
              positionY: baseY + inst.y + grid.cellHeight / 2,
              rotation: layer.transform.rotation + inst.rotation,
              scaleX: layer.transform.scaleX * inst.scaleX,
              scaleY: layer.transform.scaleY * inst.scaleY,
              opacity: layer.transform.opacity * inst.opacity,
            },
          });
        }
      } else if (layer.proceduralLoop?.kind === 'tileScroll' && layer.proceduralLoop.tile) {
        const tile = layer.proceduralLoop.tile;
        const tw = tile.tileWidth * layer.transform.scaleX;
        const th = tile.tileHeight * layer.transform.scaleY;
        const cols = Math.ceil(frame.width / tw) + 2;
        const rows = Math.ceil(frame.height / th) + 2;
        const offsetPx = tile.offsetU * tw;
        const offsetPy = tile.offsetV * th;
        for (let r = -1; r < rows; r++) {
          for (let c = -1; c < cols; c++) {
            expandedLayers.push({
              ...layer,
              proceduralLoop: undefined,
              transform: {
                ...layer.transform,
                positionX: c * tw + tw / 2 - offsetPx,
                positionY: r * th + th / 2 - offsetPy,
              },
            });
          }
        }
      } else {
        expandedLayers.push(layer);
      }
    }

    for (let i = 0; i < expandedLayers.length; i++) {
      const layer = expandedLayers[i];
      if (layer.layerType === 'text') {
        textLayers.push({ index: i, layer });
      } else if (layer.layerType === 'video') {
        videoLayers.push({ index: i, layer });
      } else if (layer.layerType === 'image' || layer.layerType === 'particle' || layer.layerType === 'fieldSampled' || layer.layerType === 'lottieIcon' || layer.layerType === 'precomp') {
        // A precomp composites like an image: its pre-rendered texture as a
        // transformed, opacity-scaled quad through the image pipeline.
        imageLayers.push({ index: i, layer });
      } else if (layer.shape && layer.shape.renderType === 'polygon') {
        pathLayers.push({ index: i, layer });
      } else {
        shapeLayers.push({ index: i, layer });
      }
    }

    if (shapeLayers.length > 0) {
      const bufferData = new ArrayBuffer(SHAPE_UNIFORM_ALIGN * shapeLayers.length);
      for (let i = 0; i < shapeLayers.length; i++) {
        const data = new Float32Array(bufferData, SHAPE_UNIFORM_ALIGN * i, SHAPE_UNIFORM_FLOATS);
        this.fillLayerData(data, shapeLayers[i].layer, frame.width, frame.height);
      }
      device.queue.writeBuffer(uniformBuffer, 0, bufferData, 0, SHAPE_UNIFORM_ALIGN * shapeLayers.length);
    }

    const textBindGroups: (GPUBindGroup | null)[] = [];
    if (textLayers.length > 0) {
      const textBufData = new ArrayBuffer(UNIFORM_ALIGN * textLayers.length);
      for (let i = 0; i < textLayers.length; i++) {
        const textLayer = textLayers[i].layer;
        const text = textLayer.text;
        if (!text) {
          textBindGroups.push(null);
          continue;
        }

        const rendered = renderTextToCanvas(text);
        if (!rendered) {
          textBindGroups.push(null);
          continue;
        }

        const t = textLayer.transform;
        const data = new Float32Array(textBufData, UNIFORM_ALIGN * i, 108);
        data[0] = frame.width;
        data[1] = frame.height;
        data[2] = t.positionX;
        data[3] = t.positionY;
        data[4] = rendered.width * t.scaleX;
        data[5] = rendered.height * t.scaleY;
        data[6] = t.anchorX;
        data[7] = t.anchorY;
        data[8] = t.rotation * (Math.PI / 180);
        data[9] = t.opacity;
        this.writeMaskUniforms(data, 10, 12, textLayer.masks);

        const gpuTexture = this.getOrCreateTextTexture(gpu, rendered.key, rendered.bitmap, rendered.width, rendered.height);
        if (!gpuTexture) {
          textBindGroups.push(null);
          continue;
        }

        const tbg = device.createBindGroup({
          layout: textBindGroupLayout,
          entries: [
            { binding: 0, resource: { buffer: textUniformBuffer, size: TEXT_UNIFORM_SIZE } },
            { binding: 1, resource: textSampler },
            { binding: 2, resource: gpuTexture.createView() },
          ],
        });
        textBindGroups.push(tbg);
      }
      device.queue.writeBuffer(textUniformBuffer, 0, textBufData, 0, UNIFORM_ALIGN * textLayers.length);
    }

    const videoBindGroups: (GPUBindGroup | null)[] = [];
    if (videoLayers.length > 0) {
      const videoBufData = new ArrayBuffer(IMAGE_UNIFORM_ALIGN * videoLayers.length);
      for (let i = 0; i < videoLayers.length; i++) {
        const vidLayer = videoLayers[i].layer;
        const video = vidLayer.video;
        if (!video) {
          videoBindGroups.push(null);
          continue;
        }

        const sourceFrame = video.sourceFrame;
        // Report the exact resolved source frame so the scheduler prefetches from
        // the same trim/offset/rate the renderer draws (single mapping source).
        frameScheduler.reportVideoRequirement(vidLayer.id, video.assetId, sourceFrame, video.playbackRate);
        // Only upload when the layer's texture doesn't already hold this exact
        // source frame — avoids a redundant GPU copy every render while paused.
        if (videoTextureCache.getCurrentFrameIndex(vidLayer.id) !== sourceFrame) {
          const videoFrame = frameScheduler.getFrame(video.assetId, sourceFrame);
          if (videoFrame) {
            videoTextureCache.uploadFrame(vidLayer.id, sourceFrame, videoFrame);
          }
        }

        const gpuTexture = videoTextureCache.getTexture(vidLayer.id);
        if (!gpuTexture) {
          videoBindGroups.push(null);
          continue;
        }

        const t = vidLayer.transform;
        const data = new Float32Array(videoBufData, IMAGE_UNIFORM_ALIGN * i, IMAGE_UNIFORM_FLOATS);
        data[0] = frame.width;
        data[1] = frame.height;
        data[2] = t.positionX;
        data[3] = t.positionY;
        data[4] = video.sourceWidth * t.scaleX;
        data[5] = video.sourceHeight * t.scaleY;
        data[6] = t.anchorX;
        data[7] = t.anchorY;
        data[8] = t.rotation * (Math.PI / 180);
        data[9] = t.opacity;
        // filters zeroed for video, EXCEPT gamma: the shader computes
        // 1/max(gamma,0.01), so a zeroed gamma slot yields pow(color, 100) →
        // near-black. Write the identity (1) to keep video color untouched.
        data[14] = 1;
        this.writeMaskUniforms(data, 15, 28, vidLayer.masks);

        const vbg = device.createBindGroup({
          layout: imageBindGroupLayout,
          entries: [
            { binding: 0, resource: { buffer: imageUniformBuffer, size: IMAGE_UNIFORM_SIZE } },
            { binding: 1, resource: textSampler },
            { binding: 2, resource: gpuTexture.createView() },
          ],
        });
        videoBindGroups.push(vbg);
      }
      device.queue.writeBuffer(imageUniformBuffer, 0, videoBufData, 0, IMAGE_UNIFORM_ALIGN * videoLayers.length);
    }

    // Image layers - use imagePipeline with filter uniforms
    const imageBindGroups: (GPUBindGroup | null)[] = [];
    if (imageLayers.length > 0) {
      const imageBufData = new ArrayBuffer(IMAGE_UNIFORM_ALIGN * imageLayers.length);
      for (let i = 0; i < imageLayers.length; i++) {
        const imgLayer = imageLayers[i].layer;

        let bitmap: ImageBitmap | OffscreenCanvas | null = null;
        let sourceWidth = 0;
        let sourceHeight = 0;
        let textureKey = '';
        let precompView: GPUTextureView | null = null; // set for precomp layers (pre-rendered texture)
        const imgFilters = { brightness: 0, contrast: 0, saturation: 0, exposure: 0, gamma: 1 };
        let imgEffects: ResolvedEffect[] = [];
        const imgCC = {
          lift: { r: 0, g: 0, b: 0, intensity: 0, luminance: 0 },
          gamma: { r: 0, g: 0, b: 0, intensity: 0, luminance: 0 },
          gain: { r: 0, g: 0, b: 0, intensity: 0, luminance: 0 },
        };

        if (imgLayer.layerType === 'particle' && imgLayer.particle) {
          const pCanvas = particleRenderer.renderParticleLayer(
            imgLayer.id,
            imgLayer.particle.emitterConfigJSON,
            imgLayer.particle.seed,
            imgLayer.particle.localFrame,
            frame.width,
            frame.height,
          );
          if (!pCanvas) {
            imageBindGroups.push(null);
            continue;
          }
          bitmap = pCanvas;
          sourceWidth = frame.width;
          sourceHeight = frame.height;
          textureKey = `__particle_${imgLayer.id}`;
        } else if (imgLayer.layerType === 'fieldSampled' && imgLayer.fieldSampled) {
          const fsCanvas = fieldSampledRenderer.renderFieldLayer(
            imgLayer.id,
            imgLayer.fieldSampled.configJSON,
            imgLayer.fieldSampled.localFrame,
            30,
            frame.width,
            frame.height,
          );
          if (!fsCanvas) {
            imageBindGroups.push(null);
            continue;
          }
          bitmap = fsCanvas;
          sourceWidth = frame.width;
          sourceHeight = frame.height;
          textureKey = `__fieldSampled_${imgLayer.id}`;
        } else if (imgLayer.layerType === 'lottieIcon' && imgLayer.lottieIcon) {
          const lottieCanvas = lottieRendererEngine.renderLottieFrame(imgLayer.id, imgLayer.lottieIcon);
          if (!lottieCanvas) {
            imageBindGroups.push(null);
            continue;
          }
          bitmap = lottieCanvas;
          sourceWidth = imgLayer.lottieIcon.sourceWidth || lottieCanvas.width;
          sourceHeight = imgLayer.lottieIcon.sourceHeight || lottieCanvas.height;
          textureKey = `__lottie_${imgLayer.id}_${imgLayer.lottieIcon.localFrame}_${imgLayer.lottieIcon.color}`;
        } else if (imgLayer.layerType === 'precomp') {
          const view = precompViews.get(imgLayer.id);
          if (!view || !imgLayer.precomp) {
            imageBindGroups.push(null);
            continue;
          }
          precompView = view;
          sourceWidth = imgLayer.precomp.width;
          sourceHeight = imgLayer.precomp.height;
          // filters/CC/effects stay identity → the precomp texture composites as-is.
        } else {
          const img = imgLayer.image;
          if (!img) {
            imageBindGroups.push(null);
            continue;
          }
          bitmap = mediaAssetManager.getImageBitmap(img.assetId);
          if (!bitmap) {
            imageBindGroups.push(null);
            continue;
          }
          sourceWidth = img.sourceWidth;
          sourceHeight = img.sourceHeight;
          textureKey = img.assetId;
          Object.assign(imgFilters, img.filters);
          Object.assign(imgCC.lift, img.colorCorrection.lift);
          Object.assign(imgCC.gamma, img.colorCorrection.gamma);
          Object.assign(imgCC.gain, img.colorCorrection.gain);
          imgEffects = img.effects;
        }

        const t = imgLayer.transform;
        const data = new Float32Array(imageBufData, IMAGE_UNIFORM_ALIGN * i, IMAGE_UNIFORM_FLOATS);
        data[0] = frame.width;
        data[1] = frame.height;
        data[2] = t.positionX;
        data[3] = t.positionY;
        data[4] = sourceWidth * t.scaleX;
        data[5] = sourceHeight * t.scaleY;
        data[6] = t.anchorX;
        data[7] = t.anchorY;
        data[8] = t.rotation * (Math.PI / 180);
        data[9] = t.opacity;
        data[10] = imgFilters.brightness;
        data[11] = imgFilters.contrast;
        data[12] = imgFilters.saturation;
        data[13] = imgFilters.exposure;
        data[14] = imgFilters.gamma;
        // data[15] = maskCount (written by writeMaskUniforms)
        data[16] = imgCC.lift.r;
        data[17] = imgCC.lift.g;
        data[18] = imgCC.lift.b;
        data[19] = imgCC.lift.intensity;
        data[20] = imgCC.gamma.r;
        data[21] = imgCC.gamma.g;
        data[22] = imgCC.gamma.b;
        data[23] = imgCC.gamma.intensity;
        data[24] = imgCC.gain.r;
        data[25] = imgCC.gain.g;
        data[26] = imgCC.gain.b;
        data[27] = imgCC.gain.intensity;

        this.writeMaskUniforms(data, 15, 28, imgLayer.masks);
        this.writeEffectSlots(data, imgEffects);
        data[IMAGE_EFFECTTIME_FLOAT] = frame.frameNumber; // seeds procedural/noise effects

        let textureView: GPUTextureView | null;
        if (precompView) {
          textureView = precompView;
        } else {
          const gpuTexture = bitmap ? this.getOrCreateImageTexture(gpu, textureKey, bitmap, sourceWidth, sourceHeight) : null;
          textureView = gpuTexture?.createView() ?? null;
        }
        if (!textureView) {
          imageBindGroups.push(null);
          continue;
        }

        const ibg = device.createBindGroup({
          layout: imageBindGroupLayout,
          entries: [
            { binding: 0, resource: { buffer: imageUniformBuffer, size: IMAGE_UNIFORM_SIZE } },
            { binding: 1, resource: textSampler },
            { binding: 2, resource: textureView },
          ],
        });
        imageBindGroups.push(ibg);
      }
      device.queue.writeBuffer(imageUniformBuffer, IMAGE_UNIFORM_ALIGN * videoLayers.length, imageBufData, 0, IMAGE_UNIFORM_ALIGN * imageLayers.length);
    }

    // Path layers - tessellate vector geometry into a shared vertex buffer
    const pathRanges: { first: number; count: number }[] = [];
    if (pathLayers.length > 0) {
      const merged: number[] = [];
      let vertexOffset = 0;
      const pathBufData = new ArrayBuffer(UNIFORM_ALIGN * pathLayers.length);
      for (let i = 0; i < pathLayers.length; i++) {
        const layer = pathLayers[i].layer;
        const s = layer.shape!;
        const tess = tessellatePathCached(layer.id, {
          vertices: s.vertices,
          closed: s.closed,
          fillColor: s.fillColor,
          strokeColor: s.strokeColor,
          strokeWidth: s.strokeWidth,
          lineCap: s.lineCap,
          lineJoin: s.lineJoin,
        });

        pathRanges.push({ first: vertexOffset, count: tess.vertexCount });
        for (let j = 0; j < tess.data.length; j++) merged.push(tess.data[j]);
        vertexOffset += tess.vertexCount;

        const t = layer.transform;
        const u = new Float32Array(pathBufData, UNIFORM_ALIGN * i, 108);
        u[0] = frame.width;
        u[1] = frame.height;
        u[2] = t.positionX;
        u[3] = t.positionY;
        u[4] = t.anchorX;
        u[5] = t.anchorY;
        u[6] = t.scaleX;
        u[7] = t.scaleY;
        u[8] = t.rotation * (Math.PI / 180);
        u[9] = t.opacity;
        this.writeMaskUniforms(u, 10, 12, layer.masks);
      }

      if (merged.length > 0) {
        const totalVerts = merged.length / PATH_FLOATS_PER_VERTEX;
        this.ensurePathVertexCapacity(gpu, totalVerts);
        device.queue.writeBuffer(gpu.pathVertexBuffer, 0, new Float32Array(merged));
      }
      device.queue.writeBuffer(pathUniformBuffer, 0, pathBufData, 0, UNIFORM_ALIGN * pathLayers.length);
    }

    const shapeBindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{
        binding: 0,
        resource: { buffer: uniformBuffer, size: SHAPE_UNIFORM_SIZE },
      }],
    });

    const pathBindGroup = pathLayers.length > 0
      ? device.createBindGroup({
          layout: pathBindGroupLayout,
          entries: [{
            binding: 0,
            resource: { buffer: pathUniformBuffer, size: PATH_UNIFORM_SIZE },
          }],
        })
      : null;

    // Build an ordered list of draw calls. Each entry carries its layer's
    // motion-blur descriptor (if any) so the render path below can decide
    // between the single-pass fast path and the per-layer blur path. Bind
    // groups and dynamic offsets are identical regardless of the target pass.
    type Draw = { blur?: ResolvedLayer['motionBlur']; shadow?: ResolvedLayer['shadow']; glow?: ResolvedLayer['glow']; blurFx?: ResolvedLayer['blur']; fn: (p: GPURenderPassEncoder) => void };
    const draws: Draw[] = [];
    {
      let shapeIdx = 0, textIdx = 0, videoIdx = 0, imageIdx = 0, pathIdx = 0;
      // Iterate expandedLayers (NOT frame.layers): bucket `index` values refer to
      // expandedLayers positions, and procedural loops make expandedLayers longer
      // than frame.layers. Bounding by frame.layers.length would silently drop
      // every expanded copy past the original layer count (incl. looped video).
      for (let i = 0; i < expandedLayers.length; i++) {
        const blur = expandedLayers[i].motionBlur;
        const shadow = expandedLayers[i].shadow;
        const glow = expandedLayers[i].glow;
        const blurFx = expandedLayers[i].blur;
        if (shapeIdx < shapeLayers.length && shapeLayers[shapeIdx].index === i) {
          const slot = shapeIdx;
          draws.push({ blur, shadow, glow, blurFx, fn: (p) => {
            p.setPipeline(pipeline);
            p.setBindGroup(0, shapeBindGroup, [SHAPE_UNIFORM_ALIGN * slot]);
            p.draw(6);
          } });
          shapeIdx++;
        } else if (pathIdx < pathLayers.length && pathLayers[pathIdx].index === i) {
          const range = pathRanges[pathIdx];
          const slot = pathIdx;
          if (pathBindGroup && range && range.count > 0) {
            const pbg = pathBindGroup;
            draws.push({ blur, shadow, glow, blurFx, fn: (p) => {
              p.setPipeline(pathPipeline);
              p.setVertexBuffer(0, gpu.pathVertexBuffer);
              p.setBindGroup(0, pbg, [UNIFORM_ALIGN * slot]);
              p.draw(range.count, 1, range.first);
            } });
          }
          pathIdx++;
        } else if (textIdx < textLayers.length && textLayers[textIdx].index === i) {
          const bindGroup = textBindGroups[textIdx];
          const slot = textIdx;
          if (bindGroup) {
            draws.push({ blur, shadow, glow, blurFx, fn: (p) => {
              p.setPipeline(textPipeline);
              p.setBindGroup(0, bindGroup, [UNIFORM_ALIGN * slot]);
              p.draw(6);
            } });
          }
          textIdx++;
        } else if (videoIdx < videoLayers.length && videoLayers[videoIdx].index === i) {
          const bindGroup = videoBindGroups[videoIdx];
          const slot = videoIdx;
          if (bindGroup) {
            draws.push({ blur, shadow, glow, blurFx, fn: (p) => {
              p.setPipeline(imagePipeline);
              p.setBindGroup(0, bindGroup, [IMAGE_UNIFORM_ALIGN * slot]);
              p.draw(6);
            } });
          }
          videoIdx++;
        } else if (imageIdx < imageLayers.length && imageLayers[imageIdx].index === i) {
          const bindGroup = imageBindGroups[imageIdx];
          const slot = videoLayers.length + imageIdx;
          if (bindGroup) {
            draws.push({ blur, shadow, glow, blurFx, fn: (p) => {
              p.setPipeline(imagePipeline);
              p.setBindGroup(0, bindGroup, [IMAGE_UNIFORM_ALIGN * slot]);
              p.draw(6);
            } });
          }
          imageIdx++;
        }
      }
    }

    const blurDraws = draws.filter((d) => d.blur);
    const shadowDraws = draws.filter((d) => d.shadow);
    const glowDraws = draws.filter((d) => d.glow);
    const blurFxDraws = draws.filter((d) => d.blurFx);
    const hasBlur = this.motionBlurSamples > 1 && blurDraws.length > 0;
    const hasShadow = shadowDraws.length > 0;
    const hasGlow = glowDraws.length > 0;
    const hasBlurFx = blurFxDraws.length > 0;
    const hasMultipass = hasBlur || hasShadow || hasGlow || hasBlurFx;

    // Render target: the swapchain at the top level, or a precomp's offscreen
    // texture when rendering a nested composition (clearAlpha 0 → transparent).
    const swapTexture = opts?.targetView ? null : context.getCurrentTexture();
    const targetView = opts?.targetView ?? swapTexture!.createView();
    const targetW = opts?.targetW ?? swapTexture!.width;
    const targetH = opts?.targetH ?? swapTexture!.height;
    const clearAlpha = opts?.clearAlpha ?? 1;
    const encoder = device.createCommandEncoder();

    if (!hasMultipass) {
      // Fast path: composite the whole scene directly to the target in a single
      // pass. No extra textures, no extra GPU work when no effects are in use.
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: targetView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: clearAlpha },
        }],
      });
      pass.setPipeline(bgPipeline);
      pass.setBindGroup(0, bgBindGroup);
      pass.draw(6);
      for (const d of draws) d.fn(pass);
      pass.end();
    } else {
      this.ensureBlurTextures(gpu, targetW, targetH);

      // Upload one blur uniform slot per blur-enabled layer.
      if (hasBlur) {
        const blurBufData = new ArrayBuffer(UNIFORM_ALIGN * blurDraws.length);
        for (let k = 0; k < blurDraws.length; k++) {
          const mb = blurDraws[k].blur!;
          const f = new Float32Array(blurBufData, UNIFORM_ALIGN * k, 12);
          f[0] = frame.width;
          f[1] = frame.height;
          f[2] = mb.pivotX;
          f[3] = mb.pivotY;
          f[4] = mb.vx;
          f[5] = mb.vy;
          f[6] = mb.scaleRateX;
          f[7] = mb.scaleRateY;
          f[8] = mb.omega;
          f[9] = mb.shutter / 360;
          f[10] = this.motionBlurSamples;
          f[11] = 0;
        }
        device.queue.writeBuffer(gpu.blurUniformBuffer, 0, blurBufData, 0, UNIFORM_ALIGN * blurDraws.length);
      }

      // Upload one shadow uniform slot per shadow-enabled layer.
      if (hasShadow) {
        const shadowBufData = new ArrayBuffer(UNIFORM_ALIGN * shadowDraws.length);
        for (let k = 0; k < shadowDraws.length; k++) {
          const sh = shadowDraws[k].shadow!;
          const rad = sh.lightAngle * Math.PI / 180;
          const dirX = Math.cos(rad);
          const dirY = Math.sin(rad);
          const f = new Float32Array(shadowBufData, UNIFORM_ALIGN * k, 16);
          f[0] = frame.width;
          f[1] = frame.height;
          f[2] = sh.pivotX;
          f[3] = sh.pivotY;
          f[4] = dirX * sh.lightDistance;       // offset.x
          f[5] = dirY * sh.lightDistance;       // offset.y
          // f[6], f[7] padding
          f[8] = Math.max(sh.shadowScale, 0.0001); // params.x scale
          f[9] = dirX * sh.lightDistance;        // params.y skew (horizontal lean)
          f[10] = Math.max(sh.blurRadius, 0);    // params.z blurRadius
          f[11] = 0;
          f[12] = sh.color[0];
          f[13] = sh.color[1];
          f[14] = sh.color[2];
          f[15] = sh.color[3];
        }
        device.queue.writeBuffer(gpu.shadowUniformBuffer, 0, shadowBufData, 0, UNIFORM_ALIGN * shadowDraws.length);
      }

      // Upload one glow uniform slot per glow-enabled layer.
      if (hasGlow) {
        const glowBufData = new ArrayBuffer(UNIFORM_ALIGN * glowDraws.length);
        for (let k = 0; k < glowDraws.length; k++) {
          const gl = glowDraws[k].glow!;
          const f = new Float32Array(glowBufData, UNIFORM_ALIGN * k, 12);
          f[0] = frame.width;                      // resolution.x
          f[1] = frame.height;                     // resolution.y
          f[2] = 0; f[3] = 0;                     // _pad
          f[4] = gl.color[0];                      // color.r
          f[5] = gl.color[1];                      // color.g
          f[6] = gl.color[2];                      // color.b
          f[7] = gl.color[3];                      // color.a
          f[8] = gl.intensity;                     // params.x
          f[9] = gl.radius;                        // params.y
          f[10] = gl.threshold;                    // params.z
          const modeFloat = gl.mode === 'image' ? 0 : gl.mode === 'outer' ? 1 : 2;
          f[11] = modeFloat;                       // params.w
        }
        device.queue.writeBuffer(gpu.glowUniformBuffer, 0, glowBufData, 0, UNIFORM_ALIGN * glowDraws.length);
      }

      // Upload blur effect uniforms (non-kawase modes; kawase writes per-pass).
      if (hasBlurFx) {
        const blurFxBufData = new ArrayBuffer(UNIFORM_ALIGN * blurFxDraws.length);
        for (let k = 0; k < blurFxDraws.length; k++) {
          const bfx = blurFxDraws[k].blurFx!;
          const f = new Float32Array(blurFxBufData, UNIFORM_ALIGN * k, 12);
          f[0] = frame.width;         // resolution.x
          f[1] = frame.height;        // resolution.y
          f[2] = bfx.radius;          // params.x = radius
          f[3] = bfx.angle * Math.PI / 180; // params.y = angle in radians
          f[4] = bfx.strength;        // params.z = strength
          const modeFloat = bfx.type === 'gaussian' ? 0 : bfx.type === 'directional' ? 1 : bfx.type === 'radial' ? 2 : 3;
          f[5] = modeFloat;           // params.w = mode
          f[6] = bfx.centerX;         // center.x
          f[7] = bfx.centerY;         // center.y
          f[8] = 0;                   // extra.x (pass index, set per-pass for kawase)
          f[9] = bfx.passes;          // extra.y
        }
        device.queue.writeBuffer(gpu.blurFxUniformBuffer, 0, blurFxBufData, 0, UNIFORM_ALIGN * blurFxDraws.length);
      }

      const sceneView = gpu.sceneTexView!;
      const layerView = gpu.layerTexView!;
      const shadowView = gpu.shadowTexView!;
      const glowExtractView = gpu.glowExtractTexView!;
      const glowBlurView = gpu.glowBlurTexView!;

      let scenePass = encoder.beginRenderPass({
        colorAttachments: [{ view: sceneView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
      });
      scenePass.setPipeline(bgPipeline);
      scenePass.setBindGroup(0, bgBindGroup);
      scenePass.draw(6);

      let blurSlot = 0;
      let shadowSlot = 0;
      let glowSlot = 0;
      let blurFxSlot = 0;
      for (const d of draws) {
        const needsBlur = hasBlur && !!d.blur;
        const needsShadow = !!d.shadow;
        const needsGlow = !!d.glow;
        const needsBlurFx = !!d.blurFx;
        if (!needsBlur && !needsShadow && !needsGlow && !needsBlurFx) {
          d.fn(scenePass);
          continue;
        }

        const myShadowSlot = needsShadow ? shadowSlot++ : -1;
        const myBlurSlot = needsBlur ? blurSlot++ : -1;
        const myGlowSlot = needsGlow ? glowSlot++ : -1;
        const myBlurFxSlot = needsBlurFx ? blurFxSlot++ : -1;

        // Render the isolated layer into the layer texture.
        scenePass.end();
        const layerPass = encoder.beginRenderPass({
          colorAttachments: [{ view: layerView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
        });
        d.fn(layerPass);
        layerPass.end();

        // Layer blur effect: applies Gaussian/Directional/Radial/Kawase blur
        // to the isolated layer texture before shadow/glow/composite. The blurred
        // result ends up in layerTex (via ping-pong with blurFxTex).
        if (needsBlurFx) {
          const bfx = d.blurFx!;
          const blurFxView = gpu.blurFxTexView!;
          if (bfx.type === 'gaussian') {
            // H pass: layerTex → blurFxTex
            const hPass = encoder.beginRenderPass({
              colorAttachments: [{ view: blurFxView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
            });
            hPass.setPipeline(gpu.blurFxHPipeline);
            hPass.setBindGroup(0, gpu.blurFxBindGroupLayer!, [UNIFORM_ALIGN * myBlurFxSlot]);
            hPass.draw(3);
            hPass.end();
            // V pass: blurFxTex → layerTex
            const vPass = encoder.beginRenderPass({
              colorAttachments: [{ view: layerView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
            });
            vPass.setPipeline(gpu.blurFxVPipeline);
            vPass.setBindGroup(0, gpu.blurFxBindGroupTex!, [UNIFORM_ALIGN * myBlurFxSlot]);
            vPass.draw(3);
            vPass.end();
          } else if (bfx.type === 'directional') {
            // Single pass: layerTex → blurFxTex, then copy back
            const dirPass = encoder.beginRenderPass({
              colorAttachments: [{ view: blurFxView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
            });
            dirPass.setPipeline(gpu.blurFxDirPipeline);
            dirPass.setBindGroup(0, gpu.blurFxBindGroupLayer!, [UNIFORM_ALIGN * myBlurFxSlot]);
            dirPass.draw(3);
            dirPass.end();
            // Write radius=0 so gaussian V acts as passthrough blit
            const zeroBuf = new Float32Array(12);
            zeroBuf[0] = frame.width; zeroBuf[1] = frame.height;
            device.queue.writeBuffer(gpu.blurFxUniformBuffer, UNIFORM_ALIGN * myBlurFxSlot, zeroBuf);
            // Copy blurFxTex → layerTex so downstream effects use the blurred result
            const copyBack = encoder.beginRenderPass({
              colorAttachments: [{ view: layerView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
            });
            copyBack.setPipeline(gpu.blurFxVPipeline);
            copyBack.setBindGroup(0, gpu.blurFxBindGroupTex!, [UNIFORM_ALIGN * myBlurFxSlot]);
            copyBack.draw(3);
            copyBack.end();
          } else if (bfx.type === 'radial') {
            const radPass = encoder.beginRenderPass({
              colorAttachments: [{ view: blurFxView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
            });
            radPass.setPipeline(gpu.blurFxRadialPipeline);
            radPass.setBindGroup(0, gpu.blurFxBindGroupLayer!, [UNIFORM_ALIGN * myBlurFxSlot]);
            radPass.draw(3);
            radPass.end();
            const zeroBuf2 = new Float32Array(12);
            zeroBuf2[0] = frame.width; zeroBuf2[1] = frame.height;
            device.queue.writeBuffer(gpu.blurFxUniformBuffer, UNIFORM_ALIGN * myBlurFxSlot, zeroBuf2);
            const copyBack = encoder.beginRenderPass({
              colorAttachments: [{ view: layerView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
            });
            copyBack.setPipeline(gpu.blurFxVPipeline);
            copyBack.setBindGroup(0, gpu.blurFxBindGroupTex!, [UNIFORM_ALIGN * myBlurFxSlot]);
            copyBack.draw(3);
            copyBack.end();
          } else if (bfx.type === 'kawase') {
            // Multi-pass kawase: ping-pong between layerTex and blurFxTex
            const passes = Math.max(1, Math.min(bfx.passes, 8));
            for (let kp = 0; kp < passes; kp++) {
              const isEven = kp % 2 === 0;
              const srcBG = isEven ? gpu.blurFxBindGroupLayer! : gpu.blurFxBindGroupTex!;
              const dstView = isEven ? blurFxView : layerView;
              // Write kawase pass index into uniform extra.x
              const kawaseData = new Float32Array(12);
              kawaseData[0] = frame.width;
              kawaseData[1] = frame.height;
              kawaseData[2] = bfx.radius;
              kawaseData[3] = 0;
              kawaseData[4] = bfx.strength;
              kawaseData[5] = 3; // mode = kawase
              kawaseData[6] = bfx.centerX;
              kawaseData[7] = bfx.centerY;
              kawaseData[8] = kp + 1; // pass index (1-based offset)
              kawaseData[9] = passes;
              device.queue.writeBuffer(gpu.blurFxUniformBuffer, UNIFORM_ALIGN * myBlurFxSlot, kawaseData);
              const kPass = encoder.beginRenderPass({
                colorAttachments: [{ view: dstView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
              });
              kPass.setPipeline(gpu.blurFxKawasePipeline);
              kPass.setBindGroup(0, srcBG, [UNIFORM_ALIGN * myBlurFxSlot]);
              kPass.draw(3);
              kPass.end();
            }
            // Ensure final result is in layerTex (if odd number of passes, it's in blurFxTex)
            if (passes % 2 !== 0) {
              const zeroBufK = new Float32Array(12);
              zeroBufK[0] = frame.width; zeroBufK[1] = frame.height;
              device.queue.writeBuffer(gpu.blurFxUniformBuffer, UNIFORM_ALIGN * myBlurFxSlot, zeroBufK);
              const finalCopy = encoder.beginRenderPass({
                colorAttachments: [{ view: layerView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
              });
              finalCopy.setPipeline(gpu.blurFxVPipeline);
              finalCopy.setBindGroup(0, gpu.blurFxBindGroupTex!, [UNIFORM_ALIGN * myBlurFxSlot]);
              finalCopy.draw(3);
              finalCopy.end();
            }
          }
        }

        // Shadow: horizontal project+blur into shadowTex, then vertical blur
        // composited under the scene.
        if (needsShadow) {
          const hPass = encoder.beginRenderPass({
            colorAttachments: [{ view: shadowView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
          });
          hPass.setPipeline(gpu.shadowHPipeline);
          hPass.setBindGroup(0, gpu.shadowBindGroupH!, [UNIFORM_ALIGN * myShadowSlot]);
          hPass.draw(3);
          hPass.end();

          const vPass = encoder.beginRenderPass({
            colorAttachments: [{ view: sceneView, loadOp: 'load', storeOp: 'store' }],
          });
          vPass.setPipeline(gpu.shadowVPipeline);
          vPass.setBindGroup(0, gpu.shadowBindGroupV!, [UNIFORM_ALIGN * myShadowSlot]);
          vPass.draw(3);
          vPass.end();
        }

        // Outer glow composites BEFORE the object (behind it).
        if (needsGlow && d.glow!.mode === 'outer') {
          // Extract: layerTex → glowExtractTex
          const extractPass = encoder.beginRenderPass({
            colorAttachments: [{ view: glowExtractView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
          });
          extractPass.setPipeline(gpu.glowExtractPipeline);
          extractPass.setBindGroup(0, gpu.glowBindGroupLayer!, [UNIFORM_ALIGN * myGlowSlot]);
          extractPass.draw(3);
          extractPass.end();

          // H blur: glowExtractTex → glowBlurTex
          const hBlur = encoder.beginRenderPass({
            colorAttachments: [{ view: glowBlurView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
          });
          hBlur.setPipeline(gpu.glowHPipeline);
          hBlur.setBindGroup(0, gpu.glowBindGroupExtract!, [UNIFORM_ALIGN * myGlowSlot]);
          hBlur.draw(3);
          hBlur.end();

          // V blur + composite: glowBlurTex → sceneView
          const vBlur = encoder.beginRenderPass({
            colorAttachments: [{ view: sceneView, loadOp: 'load', storeOp: 'store' }],
          });
          vBlur.setPipeline(gpu.glowVPipeline);
          vBlur.setBindGroup(0, gpu.glowBindGroupBlur!, [UNIFORM_ALIGN * myGlowSlot]);
          vBlur.draw(3);
          vBlur.end();
        }

        // Object over the shadow/outer-glow, unless shadow-only or glow-only.
        const skipObject = (d.shadow?.onlyShadow) || (d.glow?.onlyGlow && !d.shadow);
        if (!skipObject) {
          if (needsBlur) {
            const composite = encoder.beginRenderPass({
              colorAttachments: [{ view: sceneView, loadOp: 'load', storeOp: 'store' }],
            });
            composite.setPipeline(gpu.blurPipeline);
            composite.setBindGroup(0, gpu.blurBindGroup!, [UNIFORM_ALIGN * myBlurSlot]);
            composite.draw(3);
            composite.end();
          } else {
            const objPass = encoder.beginRenderPass({
              colorAttachments: [{ view: sceneView, loadOp: 'load', storeOp: 'store' }],
            });
            d.fn(objPass);
            objPass.end();
          }
        }

        // Image glow (bloom) and inner glow composite AFTER the object (on top).
        if (needsGlow && d.glow!.mode !== 'outer') {
          // Extract: layerTex → glowExtractTex
          const extractPass = encoder.beginRenderPass({
            colorAttachments: [{ view: glowExtractView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
          });
          extractPass.setPipeline(gpu.glowExtractPipeline);
          extractPass.setBindGroup(0, gpu.glowBindGroupLayer!, [UNIFORM_ALIGN * myGlowSlot]);
          extractPass.draw(3);
          extractPass.end();

          // H blur: glowExtractTex → glowBlurTex
          const hBlur = encoder.beginRenderPass({
            colorAttachments: [{ view: glowBlurView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
          });
          hBlur.setPipeline(gpu.glowHPipeline);
          hBlur.setBindGroup(0, gpu.glowBindGroupExtract!, [UNIFORM_ALIGN * myGlowSlot]);
          hBlur.draw(3);
          hBlur.end();

          // V blur + composite: glowBlurTex → sceneView (premultiplied-over)
          const vBlur = encoder.beginRenderPass({
            colorAttachments: [{ view: sceneView, loadOp: 'load', storeOp: 'store' }],
          });
          vBlur.setPipeline(gpu.glowVPipeline);
          vBlur.setBindGroup(0, gpu.glowBindGroupBlur!, [UNIFORM_ALIGN * myGlowSlot]);
          vBlur.draw(3);
          vBlur.end();
        }

        scenePass = encoder.beginRenderPass({
          colorAttachments: [{ view: sceneView, loadOp: 'load', storeOp: 'store' }],
        });
      }
      scenePass.end();

      // Blit the composited scene to the target (swapchain or precomp texture).
      const blitPass = encoder.beginRenderPass({
        colorAttachments: [{
          view: targetView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: clearAlpha },
        }],
      });
      blitPass.setPipeline(gpu.blitPipeline);
      blitPass.setBindGroup(0, gpu.blitBindGroup!);
      blitPass.draw(3);
      blitPass.end();
    }

    device.queue.submit([encoder.finish()]);
    if (target === 'screen') this.renderErrorCount = 0;
  }

  private static readonly BLEND_MODE_MAP: Record<string, number> = {
    normal: 0, multiply: 1, screen: 2, overlay: 3,
    softLight: 4, add: 5, darken: 6, lighten: 7,
  };

  private uploadBackgroundUniforms(gpu: GPUState, background: Background): void {
    const { device, bgUniformBuffer } = gpu;
    const layers = background.layers;
    const numLayers = Math.min(layers.length, BG_MAX_LAYERS);

    // Layout: 1 vec4 header + 10 vec4 per layer (2 params + 4 stops * 2 vec4)
    const totalVec4s = 1 + BG_MAX_LAYERS * 10;
    const data = new Float32Array(totalVec4s * 4);

    // Header vec4
    data[0] = numLayers;

    for (let i = 0; i < numLayers; i++) {
      const layer = layers[i];
      const base = (1 + i * 10) * 4; // offset in floats

      const typeMap: Record<string, number> = { solid: 0, linear: 1, radial: 2 };
      // vec4[0]: type, enabled, opacity, blendMode
      data[base + 0] = typeMap[layer.type] ?? 0;
      data[base + 1] = layer.enabled ? 1 : 0;
      data[base + 2] = layer.opacity;
      data[base + 3] = WebGPURenderer.BLEND_MODE_MAP[layer.blendMode] ?? 0;
      // vec4[1]: angle, centerX, centerY, radius
      data[base + 4] = layer.angle;
      data[base + 5] = layer.centerX;
      data[base + 6] = layer.centerY;
      data[base + 7] = layer.radius;

      // 4 stops, each 2 vec4: (r, g, b, position), (opacity, 0, 0, 0)
      for (let s = 0; s < BG_MAX_STOPS; s++) {
        const stop = layer.stops[s] || layer.stops[layer.stops.length - 1];
        const sBase = base + 8 + s * 8;
        data[sBase + 0] = stop.color[0];
        data[sBase + 1] = stop.color[1];
        data[sBase + 2] = stop.color[2];
        data[sBase + 3] = stop.position;
        data[sBase + 4] = stop.opacity;
        data[sBase + 5] = 0;
        data[sBase + 6] = 0;
        data[sBase + 7] = 0;
      }
    }

    device.queue.writeBuffer(bgUniformBuffer, 0, data.buffer, 0, totalVec4s * 16);
  }

  private getOrCreateTextTexture(
    gpu: GPUState,
    cacheKey: string,
    bitmap: ImageBitmap,
    width: number,
    height: number
  ): GPUTexture | null {
    const { device } = gpu;

    let gpuTexture = this.textTextureCache.get(cacheKey);
    if (gpuTexture) return gpuTexture;

    gpuTexture = device.createTexture({
      size: { width, height },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture: gpuTexture },
      { width, height }
    );

    this.textTextureCache.set(cacheKey, gpuTexture, width * height * 4);
    return gpuTexture;
  }

  private getOrCreateImageTexture(
    gpu: GPUState,
    assetId: string,
    bitmap: ImageBitmap | OffscreenCanvas | HTMLCanvasElement,
    width: number,
    height: number
  ): GPUTexture | null {
    const { device } = gpu;
    let entry = this.imageTextures.get(assetId);

    const isParticle = assetId.startsWith('__particle_');

    if (entry && (entry.width !== width || entry.height !== height)) {
      entry.texture.destroy();
      this.imageTextures.delete(assetId);
      entry = undefined;
    }

    if (!entry || isParticle) {
      if (!entry) {
        const texture = device.createTexture({
          size: { width, height },
          format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        entry = { texture, width, height };
        this.imageTextures.set(assetId, entry);
      }

      device.queue.copyExternalImageToTexture(
        { source: bitmap as ImageBitmap },
        { texture: entry.texture },
        { width, height }
      );
    }

    return entry.texture;
  }

  async renderFrameAsync(frame: RenderFrame, target: 'screen' | 'offscreen' = 'screen'): Promise<void> {
    const gpu = target === 'screen' ? this.gpu : this.offscreenGpu;
    if (!gpu) return;

    this.renderFrame(frame, target);
    await gpu.device.queue.onSubmittedWorkDone();
  }

  private fillLayerData(
    data: Float32Array,
    layer: ResolvedLayer,
    canvasW: number,
    canvasH: number
  ): void {
    const t = layer.transform;
    const s = layer.shape!;

    // Expand size for star/circle to give SDF margin (undone in the shader for
    // gradient mapping via the same 1.1 factor).
    let w = s.width * t.scaleX;
    let h = s.height * t.scaleY;
    if (s.renderType === 'star' || s.renderType === 'circle') {
      w *= 1.1;
      h *= 1.1;
    }

    // Base block (floats 0..19). See SHAPE_UNIFORM layout notes.
    data[0] = canvasW;
    data[1] = canvasH;
    data[2] = t.positionX;
    data[3] = t.positionY;
    data[4] = w;
    data[5] = h;
    data[6] = t.anchorX;
    data[7] = t.anchorY;
    // rotation, opacity, borderRadius, shapeType
    data[8] = t.rotation * (Math.PI / 180);
    data[9] = t.opacity;
    data[10] = s.borderRadius;

    const shapeTypeMap: Record<string, number> = { rectangle: 0, circle: 1, star: 2, polygon: 3 };
    data[11] = shapeTypeMap[s.renderType] ?? 0;

    // shapeParams: vec4 at floats 12..15
    data[12] = s.points;
    data[13] = s.outerRadius * t.scaleX;
    data[14] = s.innerRadius * t.scaleX;
    data[15] = 0;

    // strokeWidth (16); maskCount (17) written by writeMaskUniforms; pad 18,19
    data[16] = s.strokeWidth * t.scaleX;
    data[18] = 0;
    data[19] = 0;

    // masks: floats 20..115 (8 slots * 12)
    this.writeMaskUniforms(data, 17, 20, layer.masks);

    // Fill (index 0) and stroke (index 1) descriptors.
    this.packFill(data, 0, s.fill ?? { kind: 0, color: s.fillColor, layers: [] });
    this.packFill(data, 1, s.stroke ?? { kind: 0, color: s.strokeColor, layers: [] });

    // Pattern overlay (floats 900..915).
    this.packPattern(data, s.pattern);
  }

  // Writes a ResolvedPattern into the pattern block of the shape uniform.
  //   patA @900 (enabled, type, tile, angle), patB @904 (markSize, opacity,
  //   hasBg, _), patColor @908 (rgb), patBg @912 (rgb).
  private packPattern(data: Float32Array, pat: ResolvedPattern | undefined): void {
    if (!pat || !pat.enabled) {
      data[900] = 0; // disabled (buffer is zero-initialized, but be explicit)
      return;
    }
    data[900] = 1;
    data[901] = pat.patternType;
    data[902] = pat.size + pat.spacing; // tile
    data[903] = pat.angle;
    data[904] = pat.size;
    data[905] = pat.opacity;
    data[906] = pat.hasBackground ? 1 : 0;
    data[908] = pat.color[0];
    data[909] = pat.color[1];
    data[910] = pat.color[2];
    data[912] = pat.backgroundColor[0];
    data[913] = pat.backgroundColor[1];
    data[914] = pat.backgroundColor[2];
  }

  // Writes a ResolvedFill into the flat fill arrays of the shape uniform.
  // `fi` selects fill (0) or stroke (1). Float offsets index the shared arrays:
  //   fHeader @116, fSolid @124, fMeta @132, fMeta2 @196, fColors @260, fPos @772
  private packFill(data: Float32Array, fi: number, fill: ResolvedFill): void {
    const layerCount = Math.min(fill.layers.length, 8);
    // fHeader[fi] = (kind, layerCount, _, _)
    const hBase = 116 + fi * 4;
    data[hBase] = fill.kind;
    data[hBase + 1] = layerCount;
    // fSolid[fi] = rgba
    const sBase = 124 + fi * 4;
    data[sBase] = fill.color[0];
    data[sBase + 1] = fill.color[1];
    data[sBase + 2] = fill.color[2];
    data[sBase + 3] = fill.color[3];

    for (let L = 0; L < layerCount; L++) {
      const ly = fill.layers[L];
      const gi = fi * 8 + L;                 // global (fill,layer) index
      // fMeta = (gradientType, angle, cx, cy)
      const mBase = 132 + gi * 4;
      data[mBase] = ly.gradientType;
      data[mBase + 1] = ly.angle;
      data[mBase + 2] = ly.centerX;
      data[mBase + 3] = ly.centerY;
      // fMeta2 = (blendMode, stopCount, _, _)
      const m2Base = 196 + gi * 4;
      const stopCount = Math.min(ly.stops.length, 8);
      data[m2Base] = ly.blendMode;
      data[m2Base + 1] = stopCount;

      for (let sIdx = 0; sIdx < stopCount; sIdx++) {
        const stop = ly.stops[sIdx];
        const g = fi * 64 + L * 8 + sIdx;    // global stop index
        const cBase = 260 + g * 4;           // fColors
        data[cBase] = stop.color[0];
        data[cBase + 1] = stop.color[1];
        data[cBase + 2] = stop.color[2];
        data[cBase + 3] = stop.color[3];
        // fPos packs 4 positions per vec4 contiguously, so linear indexing works.
        data[772 + g] = stop.position;
      }
    }
  }

  private writeMaskUniforms(
    data: Float32Array,
    maskCountOffset: number,
    masksOffset: number,
    masks: ResolvedMask[] | undefined
  ): void {
    const typeMap: Record<string, number> = { rectangle: 1, ellipse: 2, star: 3, polygon: 4 };
    const count = masks ? Math.min(masks.length, 8) : 0;
    data[maskCountOffset] = count;
    for (let i = 0; i < count; i++) {
      const m = masks![i];
      const base = masksOffset + i * 12;
      data[base] = typeMap[m.type] ?? 1;
      data[base + 1] = m.invert ? 1 : 0;
      data[base + 2] = m.opacity;
      data[base + 3] = m.feather;
      data[base + 4] = m.centerX;
      data[base + 5] = m.centerY;
      data[base + 6] = m.sizeX * 0.5;
      data[base + 7] = m.sizeY * 0.5;
      data[base + 8] = m.rotation * (Math.PI / 180);
      data[base + 9] = m.points;
      data[base + 10] = m.innerRadius;
      data[base + 11] = 0;
    }
    // Zero remaining slots
    for (let i = count; i < 8; i++) {
      const base = masksOffset + i * 12;
      for (let j = 0; j < 12; j++) data[base + j] = 0;
    }
  }

  // Packs the image effect stack into the uniform (effectCount at float 124,
  // then IMAGE_MAX_EFFECTS slots of 8 floats each: type + 7 params). The buffer
  // is freshly zero-initialized each frame, so unused slots stay 0 (harmless).
  private writeEffectSlots(data: Float32Array, effects: ResolvedEffect[]): void {
    const count = Math.min(effects.length, IMAGE_MAX_EFFECTS);
    data[IMAGE_EFFECTCOUNT_FLOAT] = count;
    for (let i = 0; i < count; i++) {
      const e = effects[i];
      const base = IMAGE_EFFECTS_BASE_FLOAT + i * 8;
      data[base] = e.type;
      for (let p = 0; p < 7; p++) {
        data[base + 1 + p] = e.params[p] ?? 0;
      }
    }
  }

  getOffscreenCanvas(): OffscreenCanvas | null {
    return this.offscreenCanvas;
  }

  destroy(): void {
    this.activeTextKeys.clear();
    this.textTextureCache.clear();
    this.renderTree.clear();
    for (const entry of this.imageTextures.values()) {
      entry.texture.destroy();
    }
    this.imageTextures.clear();
    videoTextureCache.destroyAll();
    this.gpu?.device.destroy();
    this.offscreenGpu?.device.destroy();
    this.gpu = null;
    this.offscreenGpu = null;
    this.ready = false;
    this.offscreenReady = false;
  }
}
