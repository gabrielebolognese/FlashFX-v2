// The pre-B10e mask coverage CPU twin (core/maskCoverage.ts at commit 09c9f90), ported verbatim to JS.
// The golden reference that proves a mask stack WITHOUT modes / expansion still covers exactly as it
// did before B10e (all masks multiplied, `params.y` = invert only, the last slot float unused). Used by
// verify-mask-coverage.mjs. Do not "fix" this file - it is a frozen snapshot.

const MASK_SLOTS = 8;
const MASK_SLOT_FLOATS = 12;
const FREEFORM_MASK_TYPE = 5;
const FREEFORM_BEZIER_STRIDE = 7;
const FREEFORM_POLY_STRIDE = 3;
const FREEFORM_FLATTEN_TOL = 0.25;
const FREEFORM_MAX_PIECES = 32;

function cubicPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}

function cubicPieces(p0, p1, p2, p3, tol, maxPieces) {
  if (p1[0] === p0[0] && p1[1] === p0[1] && p2[0] === p3[0] && p2[1] === p3[1]) return 1;
  const ddx1 = p0[0] - 2 * p1[0] + p2[0], ddy1 = p0[1] - 2 * p1[1] + p2[1];
  const ddx2 = p1[0] - 2 * p2[0] + p3[0], ddy2 = p1[1] - 2 * p2[1] + p3[1];
  const dd = Math.max(Math.hypot(ddx1, ddy1), Math.hypot(ddx2, ddy2));
  return Math.min(maxPieces, Math.max(1, Math.ceil(Math.sqrt((0.75 * dd) / tol))));
}

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function starSDF(px, py, points, outerR, innerR) {
  const pi = 3.14159265;
  const n = Math.max(points, 2);
  const an = pi / n;
  const R = Math.max(outerR, 1e-4);
  const ri = Math.min(R, Math.max(innerR, 1e-4));
  let a = Math.atan2(py, px) + pi * 0.5;
  a = a - 2 * an * Math.floor(a / (2 * an) + 0.5);
  a = Math.abs(a);
  const r = Math.hypot(px, py);
  const qx = r * Math.cos(a), qy = r * Math.sin(a);
  const vOutX = R, vOutY = 0;
  const vInX = ri * Math.cos(an), vInY = ri * Math.sin(an);
  const ex = vInX - vOutX, ey = vInY - vOutY;
  const wx = qx - vOutX, wy = qy - vOutY;
  const t = Math.min(1, Math.max(0, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
  const d = Math.hypot(wx - ex * t, wy - ey * t);
  const cr = ex * wy - ey * wx;
  return cr > 0 ? -d : d;
}

function ngonSDF(px, py, r, n) {
  const nn = Math.max(n, 3);
  const an = 3.14159265 / nn;
  const ax = Math.cos(an), ay = Math.sin(an);
  const bn = Math.atan2(px, py);
  const m = bn - 2 * an * Math.floor(bn / (2 * an) + 0.5);
  const len = Math.hypot(px, py);
  let qx = len * Math.cos(m);
  let qy = len * Math.abs(Math.sin(m));
  qx -= r * ax;
  qy -= r * ay;
  qy += Math.min(Math.max(-qy, 0), r * ay);
  return Math.hypot(qx, qy) * Math.sign(qx);
}

function ellipseSDF(px, py, ax, ay) {
  const k1 = Math.hypot(px / ax, py / ay);
  const k2 = Math.hypot(px / (ax * ax), py / (ay * ay));
  return (k1 * (k1 - 1)) / Math.max(k2, 0.0001);
}

function parametricAlpha(b, o, x, y) {
  const mtype = Math.round(b[o]);
  if (mtype === 0) return 1;
  const relX = x - b[o + 4], relY = y - b[o + 5];
  const c = Math.cos(-b[o + 8]), s = Math.sin(-b[o + 8]);
  const px = relX * c - relY * s, py = relX * s + relY * c;
  const sx = b[o + 6], sy = b[o + 7];
  let d;
  if (mtype === 1) {
    const qx = Math.abs(px) - sx, qy = Math.abs(py) - sy;
    d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
  } else if (mtype === 2) {
    d = ellipseSDF(px, py, Math.max(sx, 0.001), Math.max(sy, 0.001));
  } else if (mtype === 3) {
    d = starSDF(px, py, b[o + 9], sx, b[o + 10]);
  } else {
    d = ngonSDF(px, py, sx, b[o + 9]);
  }
  const feather = Math.max(b[o + 3], 0.001);
  let a = 1 - smoothstep(-feather, feather, d);
  if (b[o + 1] > 0.5) a = 1 - a;
  return 1 - b[o + 2] * (1 - a);
}

function freeformCoverage(b, o, x, y) {
  const n = Math.round(b[o + 4]);
  const mode = Math.round(b[o + 5]);
  const maxF = Math.max(b[o + 3], 0.001);
  let minD = 1e30;
  let fAt = maxF;
  let inside = false;
  const outside = x < b[o + 6] - (maxF + 1) || y < b[o + 7] - (maxF + 1) || x > b[o + 8] + (maxF + 1) || y > b[o + 9] + (maxF + 1);
  if (!outside && n >= 3) {
    const d0 = o + MASK_SLOT_FLOATS;
    let winding = 0;
    for (let k = 0; k < n; k++) {
      const k1 = k + 1 >= n ? 0 : k + 1;
      let p0, p1, p2, p3, f0, f1;
      if (mode === 0) {
        const a = d0 + k * FREEFORM_BEZIER_STRIDE, c = d0 + k1 * FREEFORM_BEZIER_STRIDE;
        p0 = [b[a], b[a + 1]]; p1 = [b[a + 4], b[a + 5]]; p2 = [b[c + 2], b[c + 3]]; p3 = [b[c], b[c + 1]];
        f0 = b[a + 6]; f1 = b[c + 6];
      } else {
        const a = d0 + k * FREEFORM_POLY_STRIDE, c = d0 + k1 * FREEFORM_POLY_STRIDE;
        p0 = [b[a], b[a + 1]]; p3 = [b[c], b[c + 1]]; p1 = p0; p2 = p3;
        f0 = b[a + 2]; f1 = b[c + 2];
      }
      const pieces = cubicPieces(p0, p1, p2, p3, FREEFORM_FLATTEN_TOL, FREEFORM_MAX_PIECES);
      let prev = p0;
      for (let j = 1; j <= pieces; j++) {
        const cur = cubicPoint(p0, p1, p2, p3, j / pieces);
        const ex = cur[0] - prev[0], ey = cur[1] - prev[1];
        const wx = x - prev[0], wy = y - prev[1];
        const ee = ex * ex + ey * ey;
        const tt = ee > 1e-12 ? Math.min(1, Math.max(0, (wx * ex + wy * ey) / ee)) : 0;
        const d = Math.hypot(wx - ex * tt, wy - ey * tt);
        if (d < minD) {
          minD = d;
          fAt = f0 + (f1 - f0) * ((j - 1 + tt) / pieces);
        }
        const isLeft = ex * wy - ey * wx;
        if (prev[1] <= y) {
          if (cur[1] > y && isLeft > 0) winding++;
        } else if (cur[1] <= y && isLeft < 0) {
          winding--;
        }
        prev = cur;
      }
    }
    inside = winding !== 0;
  }
  const sd = inside ? -minD : minD;
  const f = Math.max(fAt, 0.001);
  let a = 1 - smoothstep(-f, f, sd);
  if (b[o + 1] > 0.5) a = 1 - a;
  return { alpha: 1 - b[o + 2] * (1 - a), signedDist: sd };
}

/** The pre-B10e stack: every mask multiplied. */
export function legacyMaskStackCoverage(block, offset, slotCount, x, y) {
  if (slotCount <= 0) return 1;
  let alpha = 1;
  let i = 0;
  while (i < slotCount && i < MASK_SLOTS) {
    const o = offset + i * MASK_SLOT_FLOATS;
    if (Math.round(block[o]) === FREEFORM_MASK_TYPE) {
      alpha *= freeformCoverage(block, o, x, y).alpha;
      i += Math.max(Math.round(block[o + 10]), 1);
    } else {
      alpha *= parametricAlpha(block, o, x, y);
      i += 1;
    }
  }
  return alpha;
}
