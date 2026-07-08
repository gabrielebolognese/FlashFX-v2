import type { RenderFrame, ResolvedLayer, ResolvedMask, Background } from '../core/types';
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

struct Uniforms {
  resolution: vec2f,
  rectPos: vec2f,
  rectSize: vec2f,
  anchorPoint: vec2f,
  fillColor: vec4f,
  rotation: f32,
  opacity: f32,
  borderRadius: f32,
  shapeType: f32,
  shapeParams: vec4f,
  strokeColor: vec4f,
  strokeWidth: f32,
  maskCount: f32,
  _pad1: f32,
  _pad2: f32,
  masks: array<MaskSlot, 8>,
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

  // Fill
  let fillAlpha = 1.0 - smoothstep(-aa, aa, dist);
  var color = vec4f(u.fillColor.rgb, u.fillColor.a * u.opacity * fillAlpha);

  // Stroke
  if (u.strokeWidth > 0.0 && u.strokeColor.a > 0.0) {
    let strokeOuter = 1.0 - smoothstep(-aa, aa, dist - u.strokeWidth * 0.5);
    let strokeInner = 1.0 - smoothstep(-aa, aa, -(dist + u.strokeWidth * 0.5));
    let strokeAlpha = strokeOuter * strokeInner;
    let sc = vec4f(u.strokeColor.rgb, u.strokeColor.a * u.opacity * strokeAlpha);
    color = vec4f(mix(color.rgb, sc.rgb, sc.a), max(color.a, sc.a));
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

const UNIFORM_SIZE = 496;
const UNIFORM_ALIGN = 512;
const MAX_LAYERS = 512;
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

${MASK_WGSL}

@fragment
fn fs(in: VertexOutput) -> @location(0) vec4f {
  var color = textureSample(texData, texSampler, in.uv);

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

  let mA = computeMaskStackAlpha(in.worldPos, i32(u.maskCount + 0.5), u.masks);
  color = vec4f(clamp(color.rgb, vec3f(0.0), vec3f(1.0)), color.a * u.opacity * mA);
  return color;
}
`;

const IMAGE_UNIFORM_SIZE = 496;

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

const BLUR_FX_UNIFORM_SIZE = 32; // 2 + 4 + 2 + 2 = 10 floats = 40 bytes → align to 48 → use 32*N...
// Actually: vec2f(8) + vec4f(16) + vec2f(8) + vec2f(8) = 40 bytes. Round up to 48 for alignment.

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
      size: UNIFORM_ALIGN * MAX_LAYERS,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: UNIFORM_SIZE },
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
      size: UNIFORM_ALIGN * MAX_LAYERS,
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

  private renderFrameUnsafe(frame: RenderFrame, target: 'screen' | 'offscreen' = 'screen'): void {
    const gpu = target === 'screen' ? this.gpu : this.offscreenGpu;
    if (!gpu) return;

    const { device, context, pipeline, textPipeline, imagePipeline, bgPipeline, pathPipeline, uniformBuffer, textUniformBuffer, imageUniformBuffer, pathUniformBuffer, bgBindGroup, bindGroupLayout, textBindGroupLayout, imageBindGroupLayout, pathBindGroupLayout, textSampler } = gpu;

    // Upload background uniforms
    this.uploadBackgroundUniforms(gpu, frame.background);

    // Cached Render Tree pass 1 — invalidation. Reconcile nodes against this
    // frame's layers; content-signature changes (local geometry/text/etc.) mark
    // nodes dirty, world transforms do not. Pin the text keys drawn this frame
    // so the LRU cannot evict a texture that is still needed below.
    this.frameClock++;
    this.renderTree.syncFromLayers(frame.layers);
    this.activeTextKeys.clear();
    for (const layer of frame.layers) {
      if (layer.layerType === 'text' && layer.text) {
        const key = textCacheKey(layer.text);
        if (key) this.activeTextKeys.add(key);
      }
    }
    // Pass 2 bookkeeping: artifacts for dirty nodes are (re)generated lazily by
    // the content-signature caches during the draws below, so the tree's nodes
    // are valid for this frame once sync has run.
    this.renderTree.markAllClean(this.frameClock);

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
      } else if (layer.layerType === 'image' || layer.layerType === 'particle' || layer.layerType === 'fieldSampled' || layer.layerType === 'lottieIcon') {
        imageLayers.push({ index: i, layer });
      } else if (layer.shape && layer.shape.renderType === 'polygon') {
        pathLayers.push({ index: i, layer });
      } else {
        shapeLayers.push({ index: i, layer });
      }
    }

    if (shapeLayers.length > 0) {
      const bufferData = new ArrayBuffer(UNIFORM_ALIGN * shapeLayers.length);
      for (let i = 0; i < shapeLayers.length; i++) {
        const data = new Float32Array(bufferData, UNIFORM_ALIGN * i, 124);
        this.fillLayerData(data, shapeLayers[i].layer, frame.width, frame.height);
      }
      device.queue.writeBuffer(uniformBuffer, 0, bufferData, 0, UNIFORM_ALIGN * shapeLayers.length);
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
      const videoBufData = new ArrayBuffer(UNIFORM_ALIGN * videoLayers.length);
      for (let i = 0; i < videoLayers.length; i++) {
        const vidLayer = videoLayers[i].layer;
        const video = vidLayer.video;
        if (!video) {
          videoBindGroups.push(null);
          continue;
        }

        const sourceFrame = video.sourceFrame;
        const videoFrame = frameScheduler.getFrame(video.assetId, sourceFrame);
        if (videoFrame) {
          videoTextureCache.uploadFrame(vidLayer.id, sourceFrame, videoFrame);
        }

        const gpuTexture = videoTextureCache.getTexture(vidLayer.id);
        if (!gpuTexture) {
          videoBindGroups.push(null);
          continue;
        }

        const t = vidLayer.transform;
        const data = new Float32Array(videoBufData, UNIFORM_ALIGN * i, 124);
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
        // filters zeroed for video
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
      device.queue.writeBuffer(imageUniformBuffer, 0, videoBufData, 0, UNIFORM_ALIGN * videoLayers.length);
    }

    // Image layers - use imagePipeline with filter uniforms
    const imageBindGroups: (GPUBindGroup | null)[] = [];
    if (imageLayers.length > 0) {
      const imageBufData = new ArrayBuffer(UNIFORM_ALIGN * imageLayers.length);
      for (let i = 0; i < imageLayers.length; i++) {
        const imgLayer = imageLayers[i].layer;

        let bitmap: ImageBitmap | OffscreenCanvas | null = null;
        let sourceWidth = 0;
        let sourceHeight = 0;
        let textureKey = '';
        const imgFilters = { brightness: 0, contrast: 0, saturation: 0, exposure: 0, gamma: 1 };
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
        }

        const t = imgLayer.transform;
        const data = new Float32Array(imageBufData, UNIFORM_ALIGN * i, 124);
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

        const gpuTexture = this.getOrCreateImageTexture(gpu, textureKey, bitmap, sourceWidth, sourceHeight);
        if (!gpuTexture) {
          imageBindGroups.push(null);
          continue;
        }

        const ibg = device.createBindGroup({
          layout: imageBindGroupLayout,
          entries: [
            { binding: 0, resource: { buffer: imageUniformBuffer, size: IMAGE_UNIFORM_SIZE } },
            { binding: 1, resource: textSampler },
            { binding: 2, resource: gpuTexture.createView() },
          ],
        });
        imageBindGroups.push(ibg);
      }
      device.queue.writeBuffer(imageUniformBuffer, UNIFORM_ALIGN * videoLayers.length, imageBufData, 0, UNIFORM_ALIGN * imageLayers.length);
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
        resource: { buffer: uniformBuffer, size: UNIFORM_SIZE },
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
      for (let i = 0; i < frame.layers.length; i++) {
        const blur = frame.layers[i].motionBlur;
        const shadow = frame.layers[i].shadow;
        const glow = frame.layers[i].glow;
        const blurFx = frame.layers[i].blur;
        if (shapeIdx < shapeLayers.length && shapeLayers[shapeIdx].index === i) {
          const slot = shapeIdx;
          draws.push({ blur, shadow, glow, blurFx, fn: (p) => {
            p.setPipeline(pipeline);
            p.setBindGroup(0, shapeBindGroup, [UNIFORM_ALIGN * slot]);
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
              p.setBindGroup(0, bindGroup, [UNIFORM_ALIGN * slot]);
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
              p.setBindGroup(0, bindGroup, [UNIFORM_ALIGN * slot]);
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

    const texture = context.getCurrentTexture();
    const encoder = device.createCommandEncoder();

    if (!hasMultipass) {
      // Fast path: composite the whole scene directly to the swapchain in a
      // single pass. No extra textures, no extra GPU work when neither motion
      // blur nor shadow is in use.
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: texture.createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        }],
      });
      pass.setPipeline(bgPipeline);
      pass.setBindGroup(0, bgBindGroup);
      pass.draw(6);
      for (const d of draws) d.fn(pass);
      pass.end();
    } else {
      this.ensureBlurTextures(gpu, texture.width, texture.height);

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

      // Blit the composited scene to the swapchain.
      const blitPass = encoder.beginRenderPass({
        colorAttachments: [{
          view: texture.createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
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

    // Expand size for star/circle to give SDF margin
    let w = s.width * t.scaleX;
    let h = s.height * t.scaleY;
    if (s.renderType === 'star' || s.renderType === 'circle') {
      w *= 1.1;
      h *= 1.1;
    }

    data[0] = canvasW;
    data[1] = canvasH;
    data[2] = t.positionX;
    data[3] = t.positionY;
    data[4] = w;
    data[5] = h;
    data[6] = t.anchorX;
    data[7] = t.anchorY;
    // fillColor
    data[8] = s.fillColor[0];
    data[9] = s.fillColor[1];
    data[10] = s.fillColor[2];
    data[11] = s.fillColor[3];
    // rotation, opacity, borderRadius, shapeType
    data[12] = t.rotation * (Math.PI / 180);
    data[13] = t.opacity;
    data[14] = s.borderRadius;

    const shapeTypeMap: Record<string, number> = { rectangle: 0, circle: 1, star: 2, polygon: 3 };
    data[15] = shapeTypeMap[s.renderType] ?? 0;

    // shapeParams: vec4 at offset 16
    data[16] = s.points;
    data[17] = s.outerRadius * t.scaleX;
    data[18] = s.innerRadius * t.scaleX;
    data[19] = 0;

    // strokeColor: vec4 at offset 20
    data[20] = s.strokeColor[0];
    data[21] = s.strokeColor[1];
    data[22] = s.strokeColor[2];
    data[23] = s.strokeColor[3];

    // strokeWidth + padding at offset 24
    data[24] = s.strokeWidth * t.scaleX;
    // data[25] = maskCount (written by writeMaskUniforms)
    data[26] = 0;
    data[27] = 0;

    this.writeMaskUniforms(data, 25, 28, layer.masks);
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
