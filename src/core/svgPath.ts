// B83 - SVG path data -> FlashFX bezier contours (pure leaf, types only).
//
// Parses the `d` attribute of an SVG <path> (M L H V C S Q T A Z, absolute and relative, implicit
// command repetition, exponent numbers, packed flags like "a1 1 0 01 1 1") into closed or open
// contours of PathVertex (handles RELATIVE to their anchor, the FlashFX convention). Quadratics are
// raised to cubics exactly; arcs are split into <= 90 degree cubic segments (standard endpoint ->
// centre conversion, SVG implementation notes F.6). Used by `editor.setShapeMorph` poses of type
// "svg" so an agent can morph into any logo / icon / glyph outline it can describe as path data.

import type { PathVertex, Vec2 } from './types';

export interface SvgContour { vertices: PathVertex[]; closed: boolean }

const CMD_RE = /[MmLlHhVvCcSsQqTtAaZz]/;

const PARAMS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/**
 * Command-aware tokenizer: inside an arc (A / a) the large-arc and sweep flags are read as ONE
 * character each, so packed forms like "a1 1 0 01 1 1" or "a1,1,0,1,1,1,1" both parse.
 */
function tokenize(d: string): Array<string | number> {
  const out: Array<string | number> = [];
  let i = 0;
  const n = d.length;
  let cmd = '';
  let argIdx = 0;
  while (i < n) {
    const c = d[i];
    if (CMD_RE.test(c)) { out.push(c); cmd = c.toUpperCase(); argIdx = 0; i++; continue; }
    if (c === ',' || /\s/.test(c)) { i++; continue; }
    const np = PARAMS[cmd] ?? 0;
    const slot = np > 0 ? argIdx % np : 0;
    if (cmd === 'A' && (slot === 3 || slot === 4) && (c === '0' || c === '1')) {
      out.push(c === '1' ? 1 : 0);
      argIdx++;
      i++;
      continue;
    }
    const m = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(d.slice(i, i + 64));
    if (!m) throw new Error(`svg path: unexpected "${c}" at ${i}`);
    out.push(parseFloat(m[0]));
    argIdx++;
    i += m[0].length;
  }
  return out;
}

function corner(p: Vec2): PathVertex {
  return { position: [p[0], p[1]], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' };
}

/** Arc (SVG endpoint form) -> cubic segments as [c1, c2, end] triples in absolute coordinates. */
export function arcToCubics(p0: Vec2, rxIn: number, ryIn: number, phiDeg: number, large: number, sweep: number, p1: Vec2): Array<[Vec2, Vec2, Vec2]> {
  let rx = Math.abs(rxIn), ry = Math.abs(ryIn);
  if (rx < 1e-9 || ry < 1e-9 || (p0[0] === p1[0] && p0[1] === p1[1])) return rx < 1e-9 || ry < 1e-9 ? [[p0, p1, p1]] : [];
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2;
  const x1 = cos * dx + sin * dy, y1 = -sin * dx + cos * dy;
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let co = den === 0 ? 0 : Math.sqrt(Math.max(0, num / den));
  if (large === sweep) co = -co;
  const cxp = (co * rx * y1) / ry, cyp = (-co * ry * x1) / rx;
  const cx = cos * cxp - sin * cyp + (p0[0] + p1[0]) / 2;
  const cy = sin * cxp + cos * cyp + (p0[1] + p1[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number): number => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let dt = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  else if (sweep && dt < 0) dt += 2 * Math.PI;
  const segs = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const step = dt / segs;
  const k = (4 / 3) * Math.tan(step / 4);
  const out: Array<[Vec2, Vec2, Vec2]> = [];
  const pt = (t: number): Vec2 => {
    const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
    return [cos * ex - sin * ey + cx, sin * ex + cos * ey + cy];
  };
  const dpt = (t: number): Vec2 => {
    const ex = -rx * Math.sin(t), ey = ry * Math.cos(t);
    return [cos * ex - sin * ey, sin * ex + cos * ey];
  };
  let t = t1;
  for (let s = 0; s < segs; s++) {
    const a = pt(t), b = pt(t + step);
    const da = dpt(t), db = dpt(t + step);
    const end: Vec2 = s === segs - 1 ? [p1[0], p1[1]] : b;
    out.push([[a[0] + k * da[0], a[1] + k * da[1]], [b[0] - k * db[0], b[1] - k * db[1]], end]);
    t += step;
  }
  return out;
}

/**
 * Parse SVG path data into contours. Every subpath becomes one contour; "Z" closes it (a final point
 * equal to the start is merged into the start so the ring has no zero-length edge). Handles are
 * relative to their anchor; vertexType is 'smooth' where the in / out handles are collinear.
 */
export function parseSvgPath(d: string): SvgContour[] {
  if (typeof d !== 'string' || !d.trim()) throw new Error('svg path: "d" must be a non-empty string');
  const tokens = tokenize(d);
  const contours: SvgContour[] = [];
  let cur: PathVertex[] = [];
  let pen: Vec2 = [0, 0];
  let start: Vec2 = [0, 0];
  let lastC2: Vec2 | null = null; // reflected control for S
  let lastQ: Vec2 | null = null; // reflected control for T
  let cmd = '';
  let i = 0;

  const flush = (closed: boolean): void => {
    if (cur.length === 0) return;
    if (closed && cur.length > 1) {
      const a = cur[0], b = cur[cur.length - 1];
      if (Math.abs(a.position[0] - b.position[0]) < 1e-6 && Math.abs(a.position[1] - b.position[1]) < 1e-6) {
        a.handleIn = [b.handleIn[0], b.handleIn[1]];
        cur.pop();
      }
    }
    if (cur.length >= 2 || (cur.length === 1 && closed)) contours.push({ vertices: cur, closed });
    cur = [];
  };
  const lineTo = (p: Vec2): void => {
    if (cur.length === 0) cur.push(corner(pen));
    cur.push(corner(p));
    pen = [p[0], p[1]];
  };
  const cubicTo = (c1: Vec2, c2: Vec2, p: Vec2): void => {
    if (cur.length === 0) cur.push(corner(pen));
    const last = cur[cur.length - 1];
    last.handleOut = [c1[0] - pen[0], c1[1] - pen[1]];
    cur.push({ position: [p[0], p[1]], handleIn: [c2[0] - p[0], c2[1] - p[1]], handleOut: [0, 0], vertexType: 'corner' });
    pen = [p[0], p[1]];
  };

  while (i < tokens.length) {
    const t = tokens[i];
    if (typeof t === 'string') { cmd = t; i++; if (cmd === 'Z' || cmd === 'z') { flush(true); pen = [start[0], start[1]]; lastC2 = null; lastQ = null; } continue; }
    if (!cmd) throw new Error('svg path: must start with a command (M)');
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    const ox = rel ? pen[0] : 0, oy = rel ? pen[1] : 0;
    if (up === 'Z') throw new Error('svg path: numbers after Z');
    const np = PARAMS[up];
    const args: number[] = [];
    for (let k = 0; k < np; k++) {
      const v = tokens[i + k];
      if (typeof v !== 'number') throw new Error(`svg path: "${cmd}" needs ${np} numbers`);
      args.push(v);
    }
    i += np;
    switch (up) {
      case 'M': {
        flush(false);
        pen = [args[0] + ox, args[1] + oy];
        start = [pen[0], pen[1]];
        cur.push(corner(pen));
        cmd = rel ? 'l' : 'L'; // implicit lineto after the first pair
        lastC2 = null; lastQ = null;
        break;
      }
      case 'L': lineTo([args[0] + ox, args[1] + oy]); lastC2 = null; lastQ = null; break;
      case 'H': lineTo([args[0] + ox, pen[1]]); lastC2 = null; lastQ = null; break;
      case 'V': lineTo([pen[0], args[0] + oy]); lastC2 = null; lastQ = null; break;
      case 'C': {
        const c1: Vec2 = [args[0] + ox, args[1] + oy], c2: Vec2 = [args[2] + ox, args[3] + oy], p: Vec2 = [args[4] + ox, args[5] + oy];
        cubicTo(c1, c2, p); lastC2 = c2; lastQ = null; break;
      }
      case 'S': {
        const c1: Vec2 = lastC2 ? [2 * pen[0] - lastC2[0], 2 * pen[1] - lastC2[1]] : [pen[0], pen[1]];
        const c2: Vec2 = [args[0] + ox, args[1] + oy], p: Vec2 = [args[2] + ox, args[3] + oy];
        cubicTo(c1, c2, p); lastC2 = c2; lastQ = null; break;
      }
      case 'Q': case 'T': {
        const q: Vec2 = up === 'Q' ? [args[0] + ox, args[1] + oy] : (lastQ ? [2 * pen[0] - lastQ[0], 2 * pen[1] - lastQ[1]] : [pen[0], pen[1]]);
        const p: Vec2 = up === 'Q' ? [args[2] + ox, args[3] + oy] : [args[0] + ox, args[1] + oy];
        const c1: Vec2 = [pen[0] + (2 / 3) * (q[0] - pen[0]), pen[1] + (2 / 3) * (q[1] - pen[1])];
        const c2: Vec2 = [p[0] + (2 / 3) * (q[0] - p[0]), p[1] + (2 / 3) * (q[1] - p[1])];
        cubicTo(c1, c2, p); lastQ = q; lastC2 = null; break;
      }
      case 'A': {
        const p: Vec2 = [args[5] + ox, args[6] + oy];
        for (const [c1, c2, e] of arcToCubics(pen, args[0], args[1], args[2], args[3], args[4], p)) cubicTo(c1, c2, e);
        if (cur.length === 0) lineTo(p);
        pen = [p[0], p[1]];
        lastC2 = null; lastQ = null; break;
      }
      default: throw new Error(`svg path: unsupported command "${cmd}"`);
    }
  }
  flush(false);
  // Mark anchors whose handles are collinear (and non-zero) as smooth.
  for (const c of contours) {
    for (const v of c.vertices) {
      const a = v.handleIn, b = v.handleOut;
      const la = Math.hypot(a[0], a[1]), lb = Math.hypot(b[0], b[1]);
      if (la > 1e-9 && lb > 1e-9 && Math.abs(a[0] * b[1] - a[1] * b[0]) / (la * lb) < 1e-3 && a[0] * b[0] + a[1] * b[1] < 0) v.vertexType = 'smooth';
    }
  }
  if (contours.length === 0) throw new Error('svg path: no drawable subpath');
  return contours;
}
