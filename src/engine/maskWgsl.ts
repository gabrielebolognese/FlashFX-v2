// Mask coverage WGSL, shared by every masked pipeline (rect / text / video / image / pattern shaders
// interpolate it after declaring `struct MaskSlot` + a `masks: array<MaskSlot, 8>` uniform). Moved out
// of renderer.ts (B10d-mask) so the GPU harness (`npm run gpu:masks`) can compile and run the exact
// shipping code. The slot layout is defined by core/maskCoverage.ts `packMaskSlots`, and
// `maskStackCoverage` there is this shader's CPU twin - change both together.

import { FREEFORM_MASK_TYPE, FREEFORM_FLATTEN_TOL, FREEFORM_MAX_PIECES, FREEFORM_BEZIER_STRIDE, FREEFORM_POLY_STRIDE } from '../core/maskCoverage';

const f32Lit = (v: number) => (Number.isInteger(v) ? `${v}.0` : `${v}`);

export const MASK_WGSL = /* wgsl */ `
// N-pointed star SDF (mask variant - identical math to starSDF). Inside < 0.
fn mask_starSDF(p: vec2f, points: f32, outerR: f32, innerR: f32) -> f32 {
  let pi = 3.14159265;
  let n = max(points, 2.0);
  let an = pi / n;
  let R = max(outerR, 1e-4);
  let ri = clamp(innerR, 1e-4, R);
  var a = atan2(p.y, p.x) + pi * 0.5;
  a = a - 2.0 * an * floor(a / (2.0 * an) + 0.5);
  a = abs(a);
  let r = length(p);
  let q = vec2f(r * cos(a), r * sin(a));
  let vOut = vec2f(R, 0.0);
  let vIn = vec2f(ri * cos(an), ri * sin(an));
  let e = vIn - vOut;
  let w = q - vOut;
  let t = clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
  let d = length(w - e * t);
  let cr = e.x * w.y - e.y * w.x;
  return select(d, -d, cr > 0.0);
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

fn mask_cubic(p0: vec2f, p1: vec2f, p2: vec2f, p3: vec2f, t: f32) -> vec2f {
  let u = 1.0 - t;
  return p0 * (u * u * u) + p1 * (3.0 * u * u * t) + p2 * (3.0 * u * t * t) + p3 * (t * t * t);
}

// Freeform (path) mask coverage (B10d-mask). The mask is a run of slots starting at header slot h:
// params = (type, invert, opacity, maxFeather), center = (count, mode), size = bbox min,
// (rot, points) = bbox max, inner = span. The span-1 data slots are a flat float stream - bezier
// (mode 0): ${FREEFORM_BEZIER_STRIDE} floats per vertex (x, y, inX, inY, outX, outY, feather), polyline (mode 1):
// ${FREEFORM_POLY_STRIDE} floats per point (x, y, feather). Each cubic is flattened adaptively (Wang's bound);
// the signed distance is the nearest-edge distance, negative inside (nonzero winding); the feather is
// interpolated along that edge between its two vertices' feathers.
fn computeFreeformMaskAlpha(world: vec2f, masks: array<MaskSlot, 8>, h: i32) -> f32 {
  let hd = masks[h];
  let n = i32(hd.center.x + 0.5);
  let mode = i32(hd.center.y + 0.5);
  let span = i32(hd.inner + 0.5);
  let maxF = max(hd.params.w, 0.001);
  var minD = 1e30;
  var fAt = maxF;
  var inside = false;
  let pad = vec2f(maxF + 1.0);
  let outside = any(world < hd.size - pad) || any(world > vec2f(hd.rot, hd.points) + pad);
  if (!outside && n >= 3) {
    var fd: array<f32, 84>;
    for (var s = 1; s < span; s = s + 1) {
      let m = masks[h + s];
      let b = (s - 1) * 12;
      fd[b] = m.params.x;
      fd[b + 1] = m.params.y;
      fd[b + 2] = m.params.z;
      fd[b + 3] = m.params.w;
      fd[b + 4] = m.center.x;
      fd[b + 5] = m.center.y;
      fd[b + 6] = m.size.x;
      fd[b + 7] = m.size.y;
      fd[b + 8] = m.rot;
      fd[b + 9] = m.points;
      fd[b + 10] = m.inner;
      fd[b + 11] = m._pad;
    }
    var winding = 0;
    for (var k = 0; k < n; k = k + 1) {
      let k1 = select(k + 1, 0, k + 1 >= n);
      var p0: vec2f;
      var p1: vec2f;
      var p2: vec2f;
      var p3: vec2f;
      var f0: f32;
      var f1: f32;
      if (mode == 0) {
        let ia = k * ${FREEFORM_BEZIER_STRIDE};
        let ic = k1 * ${FREEFORM_BEZIER_STRIDE};
        p0 = vec2f(fd[ia], fd[ia + 1]);
        p1 = vec2f(fd[ia + 4], fd[ia + 5]);
        p2 = vec2f(fd[ic + 2], fd[ic + 3]);
        p3 = vec2f(fd[ic], fd[ic + 1]);
        f0 = fd[ia + 6];
        f1 = fd[ic + 6];
      } else {
        let ia = k * ${FREEFORM_POLY_STRIDE};
        let ic = k1 * ${FREEFORM_POLY_STRIDE};
        p0 = vec2f(fd[ia], fd[ia + 1]);
        p3 = vec2f(fd[ic], fd[ic + 1]);
        p1 = p0;
        p2 = p3;
        f0 = fd[ia + 2];
        f1 = fd[ic + 2];
      }
      var pieces = 1;
      if (!(all(p1 == p0) && all(p2 == p3))) {
        let dd = max(length(p0 - 2.0 * p1 + p2), length(p1 - 2.0 * p2 + p3));
        pieces = clamp(i32(ceil(sqrt(0.75 * dd / ${f32Lit(FREEFORM_FLATTEN_TOL)}))), 1, ${FREEFORM_MAX_PIECES});
      }
      var prev = p0;
      for (var j = 1; j <= pieces; j = j + 1) {
        let cur = mask_cubic(p0, p1, p2, p3, f32(j) / f32(pieces));
        let e = cur - prev;
        let w = world - prev;
        let ee = dot(e, e);
        var tt = 0.0;
        if (ee > 1e-12) { tt = clamp(dot(w, e) / ee, 0.0, 1.0); }
        let d = length(w - e * tt);
        if (d < minD) {
          minD = d;
          fAt = mix(f0, f1, (f32(j - 1) + tt) / f32(pieces));
        }
        let isLeft = e.x * w.y - e.y * w.x;
        if (prev.y <= world.y) {
          if (cur.y > world.y && isLeft > 0.0) { winding = winding + 1; }
        } else if (cur.y <= world.y && isLeft < 0.0) {
          winding = winding - 1;
        }
        prev = cur;
      }
    }
    inside = winding != 0;
  }
  let sd = select(minD, -minD, inside);
  let f = max(fAt, 0.001);
  var a = 1.0 - smoothstep(-f, f, sd);
  if (hd.params.y > 0.5) { a = 1.0 - a; }
  return 1.0 - hd.params.z * (1.0 - a);
}

// Multiplies every mask's coverage. maskCount counts SLOTS: a parametric mask is one slot, a
// freeform mask a run of 'inner' slots (skipped as a unit).
fn computeMaskStackAlpha(world: vec2f, maskCount: i32, masks: array<MaskSlot, 8>) -> f32 {
  if (maskCount <= 0) { return 1.0; }
  var alpha = 1.0;
  var i = 0;
  loop {
    if (i >= maskCount || i >= 8) { break; }
    let m = masks[i];
    if (i32(m.params.x + 0.5) == ${FREEFORM_MASK_TYPE}) {
      alpha = alpha * computeFreeformMaskAlpha(world, masks, i);
      i = i + max(i32(m.inner + 0.5), 1);
    } else {
      alpha = alpha * computeMaskAlpha(world, m.params, m.center, m.size, m.rot, m.points, m.inner);
      i = i + 1;
    }
  }
  return alpha;
}
`;
