// Mask coverage WGSL, shared by every masked pipeline (rect / text / video / image / pattern shaders
// interpolate it after declaring `struct MaskSlot` + a `masks: array<MaskSlot, 8>` uniform). Moved out
// of renderer.ts (B10d-mask) so the GPU harness (`npm run gpu:masks`) can compile and run the exact
// shipping code. The slot layout is defined by core/maskCoverage.ts `packMaskSlots`, and
// `maskStackField` there is this shader's CPU twin - change both together.
//
// B10e: masks combine by MODE (params.y = invert + 2 * modeId; intersect = 0 is the legacy multiply)
// and grow / choke by EXPANSION (the slot's last float, `_pad`). `computeMaskStack` also returns the
// CSG signed distance + outward normal of the combined matte for the image shader's Refine Edge pass;
// `computeMaskStackAlpha` (every other caller) asks for no normal.

import { FREEFORM_MASK_TYPE, FREEFORM_FLATTEN_TOL, FREEFORM_MAX_PIECES, FREEFORM_BEZIER_STRIDE, FREEFORM_POLY_STRIDE, MASK_MODE_ID } from '../core/maskCoverage';

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

fn mask_invert(m: MaskSlot) -> bool { return (i32(m.params.y + 0.5) & 1) == 1; }
fn mask_mode(m: MaskSlot) -> i32 { return i32(m.params.y + 0.5) >> 1u; }

// Raw signed distance of a parametric mask's shape (rect / ellipse / star / regular polygon).
fn mask_parametricSD(world: vec2f, m: MaskSlot) -> f32 {
  let mtype = i32(m.params.x + 0.5);
  let rel = world - m.center;
  let c = cos(-m.rot);
  let s = sin(-m.rot);
  let p = vec2f(rel.x * c - rel.y * s, rel.x * s + rel.y * c);
  if (mtype == 1) {
    let q = abs(p) - m.size;
    return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0);
  } else if (mtype == 2) {
    return mask_ellipseSDF(p, max(m.size, vec2f(0.001)));
  } else if (mtype == 3) {
    return mask_starSDF(p, m.points, m.size.x, m.inner);
  }
  return mask_ngonSDF(p, m.size.x, m.points);
}

// One mask at a point: (coverage after feather + invert, signed distance after expansion - negated
// when inverted, unit gradient of that distance). band = the Refine Edge radius: the gradient is only
// computed where |d| < band (0 = the alpha-only path: never).
fn mask_parametricEval(world: vec2f, m: MaskSlot, band: f32) -> vec4f {
  let d = mask_parametricSD(world, m) - m._pad;
  let feather = max(m.params.w, 0.001);
  var a = 1.0 - smoothstep(-feather, feather, d);
  let inv = mask_invert(m);
  if (inv) { a = 1.0 - a; }
  var g = vec2f(0.0);
  if (band > 0.0 && abs(d) < band) {
    let hx = mask_parametricSD(world + vec2f(0.5, 0.0), m) - mask_parametricSD(world - vec2f(0.5, 0.0), m);
    let hy = mask_parametricSD(world + vec2f(0.0, 0.5), m) - mask_parametricSD(world - vec2f(0.0, 0.5), m);
    let gl = length(vec2f(hx, hy));
    if (gl > 1e-6) { g = vec2f(hx, hy) / gl; }
  }
  if (inv) { return vec4f(a, -d, -g); }
  return vec4f(a, d, g);
}

fn mask_cubic(p0: vec2f, p1: vec2f, p2: vec2f, p3: vec2f, t: f32) -> vec2f {
  let u = 1.0 - t;
  return p0 * (u * u * u) + p1 * (3.0 * u * u * t) + p2 * (3.0 * u * t * t) + p3 * (t * t * t);
}

// Freeform (path) mask (B10d-mask). The mask is a run of slots starting at header slot h:
// params = (type, invert + 2 * maskMode, opacity, maxFeather), center = (count, mode), size = bbox min,
// (rot, points) = bbox max, inner = span, _pad = expansion. The span-1 data slots are a flat float
// stream - bezier (mode 0): ${FREEFORM_BEZIER_STRIDE} floats per vertex (x, y, inX, inY, outX, outY, feather), polyline
// (mode 1): ${FREEFORM_POLY_STRIDE} floats per point (x, y, feather). Each cubic is flattened adaptively (Wang's bound);
// the signed distance is the nearest-edge distance, negative inside (nonzero winding); the feather is
// interpolated along that edge between its two vertices' feathers. Returns what mask_parametricEval does.
fn mask_freeformEval(world: vec2f, masks: array<MaskSlot, 8>, h: i32, band: f32) -> vec4f {
  let hd = masks[h];
  let n = i32(hd.center.x + 0.5);
  let mode = i32(hd.center.y + 0.5);
  let span = i32(hd.inner + 0.5);
  let maxF = max(hd.params.w, 0.001);
  let expn = hd._pad;
  var minD = 1e30;
  var fAt = maxF;
  var inside = false;
  var q = vec2f(0.0);
  var eAt = vec2f(0.0);
  var area2 = 0.0;
  // bbox early-out, widened by the grown edge and by the refine band (beyond it this edge cannot be the
  // refined one, so "far" is exact enough for the field).
  let pad = vec2f(maxF + 1.0 + max(expn, 0.0) + band);
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
          q = prev + e * tt;
          eAt = e;
        }
        area2 = area2 + (prev.x * cur.y - cur.x * prev.y);
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
  let sd = select(minD, -minD, inside) - expn;
  let f = max(fAt, 0.001);
  var a = 1.0 - smoothstep(-f, f, sd);
  let inv = mask_invert(hd);
  if (inv) { a = 1.0 - a; }
  var g = vec2f(0.0);
  if (band > 0.0 && minD < 1e29 && abs(sd) < band) {
    if (minD > 1e-5) {
      g = (world - q) / minD * select(1.0, -1.0, inside);
    } else {
      // Exactly on the outline: the edge's outward perpendicular (orientation from the signed area).
      let len = length(eAt);
      if (len > 1e-12) { g = vec2f(eAt.y, -eAt.x) / len * select(-1.0, 1.0, area2 >= 0.0); }
    }
  }
  if (inv) { return vec4f(a, -sd, -g); }
  return vec4f(a, sd, g);
}

// The whole stack, combined top to bottom by mode (After Effects semantics): returns (coverage, CSG
// signed distance of the combined matte, its unit outward normal). maskCount counts SLOTS: a parametric
// mask is one slot, a freeform mask a run of 'inner' slots (skipped as a unit). A stack whose first mask
// is intersect / subtract / darken starts from the full layer, otherwise from nothing. band = the Refine
// Edge radius: the normal is exact wherever |sd| < band (0 = alpha only).
fn computeMaskStack(world: vec2f, maskCount: i32, masks: array<MaskSlot, 8>, band: f32) -> vec4f {
  if (maskCount <= 0) { return vec4f(1.0, -1e30, 0.0, 0.0); }
  let m0 = mask_mode(masks[0]);
  let startFull = m0 == ${MASK_MODE_ID.intersect} || m0 == ${MASK_MODE_ID.subtract} || m0 == ${MASK_MODE_ID.darken};
  var acc = select(0.0, 1.0, startFull);
  var sdAcc = select(1e30, -1e30, startFull);
  var gAcc = vec2f(0.0);
  var i = 0;
  loop {
    if (i >= maskCount || i >= 8) { break; }
    let m = masks[i];
    let t = i32(m.params.x + 0.5);
    if (t == 0) {
      i = i + 1;
      continue;
    }
    var ev: vec4f;
    var adv = 1;
    if (t == ${FREEFORM_MASK_TYPE}) {
      ev = mask_freeformEval(world, masks, i, band);
      adv = max(i32(m.inner + 0.5), 1);
    } else {
      ev = mask_parametricEval(world, m, band);
    }
    let o = m.params.z;
    let c = ev.x;
    let mode = mask_mode(m);
    if (mode == ${MASK_MODE_ID.add}) { acc = min(1.0, acc + o * c); }
    else if (mode == ${MASK_MODE_ID.subtract}) { acc = max(0.0, acc - o * c); }
    else if (mode == ${MASK_MODE_ID.lighten}) { acc = max(acc, o * c); }
    else if (mode == ${MASK_MODE_ID.darken}) { acc = min(acc, 1.0 - o * (1.0 - c)); }
    else if (mode == ${MASK_MODE_ID.difference}) { acc = abs(acc - o * c); }
    else { acc = acc * (1.0 - o * (1.0 - c)); }
    if (o > 0.0) {
      let s = ev.y;
      let g = ev.zw;
      if (mode == ${MASK_MODE_ID.add} || mode == ${MASK_MODE_ID.lighten}) {
        if (s < sdAcc) { sdAcc = s; gAcc = g; }
      } else if (mode == ${MASK_MODE_ID.subtract}) {
        if (-s > sdAcc) { sdAcc = -s; gAcc = -g; }
      } else if (mode == ${MASK_MODE_ID.difference}) {
        // xor: max(min(acc, s), -max(acc, s))
        var lo = sdAcc;
        var gLo = gAcc;
        var hi = s;
        var gHi = g;
        if (s < sdAcc) { lo = s; gLo = g; hi = sdAcc; gHi = gAcc; }
        if (lo >= -hi) { sdAcc = lo; gAcc = gLo; } else { sdAcc = -hi; gAcc = -gHi; }
      } else if (s > sdAcc) {
        sdAcc = s;
        gAcc = g;
      }
    }
    i = i + adv;
  }
  return vec4f(acc, sdAcc, gAcc);
}

fn computeMaskStackAlpha(world: vec2f, maskCount: i32, masks: array<MaskSlot, 8>) -> f32 {
  return computeMaskStack(world, maskCount, masks, 0.0).x;
}
`;
