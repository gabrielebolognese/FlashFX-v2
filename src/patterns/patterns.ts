import type { PatternConfig, PatternStop } from './types';

// PURE pattern field math — deterministic function of (uv, aspect, time). Written to mirror the WGSL
// utilities in renderer.ts (hash21/valueNoise/fbm) so it can port 1:1 to a GPU fragment shader.

function rot(x: number, y: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}
function hash21(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash21(ix, iy), b = hash21(ix + 1, iy), c = hash21(ix, iy + 1), d = hash21(ix + 1, iy + 1);
  return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
}
function fbm(x: number, y: number, oct: number): number {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += amp * valueNoise(x * f, y * f); f *= 2; amp *= 0.5; }
  return v;
}
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Scalar field in [0,1] for a pattern at uv (0..1), aspect-corrected, at time t (seconds). */
export function patternValue(cfg: PatternConfig, u: number, v: number, aspect: number, t: number): number {
  let px = (u - 0.5) * aspect, py = v - 0.5;
  [px, py] = rot(px, py, cfg.rotationDeg);
  const s = Math.max(0.05, cfg.scale) * 4, sp = t * cfg.speed;
  if (cfg.warp) { const wx = px; px += cfg.warp * 0.3 * Math.sin(py * 3 + sp); py += cfg.warp * 0.3 * Math.cos(wx * 3 + sp); }

  let val: number;
  switch (cfg.type) {
    case 'waves': {
      const n = Math.max(1, Math.round(cfg.complexity));
      let a = 0;
      for (let i = 0; i < n; i++) { const ang = i * 2.399963; a += Math.sin((px * Math.cos(ang) + py * Math.sin(ang)) * s + sp * (1 + i * 0.2)); }
      val = (a / n) * 0.5 + 0.5; break;
    }
    case 'plasma': {
      const x = px * s, y = py * s;
      const a = Math.sin(x + sp) + Math.sin(y + sp * 1.1) + Math.sin((x + y) * 0.7 + sp * 0.8) + Math.sin(Math.hypot(x, y) + sp * 1.3);
      val = (a / 4) * 0.5 + 0.5; break;
    }
    case 'kaleidoscope': {
      const r = Math.hypot(px, py);
      const n = Math.max(2, Math.round(cfg.complexity));
      let ang = Math.atan2(py, px) / (Math.PI * 2);
      ang = Math.abs(((ang * n) % 1 + 1) % 1 * 2 - 1); // mirror into n wedges
      val = fbm(ang * s + sp * 0.1, r * s - sp * 0.2, 3); break;
    }
    case 'mosaic': {
      const gx = px * s, gy = py * s, cx = Math.floor(gx), cy = Math.floor(gy);
      let best = 9, bh = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = cx + ox, ny = cy + oy;
        const jx = nx + hash21(nx, ny) + 0.3 * Math.sin(sp + hash21(nx, ny) * 6.2831);
        const jy = ny + hash21(ny, nx) + 0.3 * Math.cos(sp + hash21(ny, nx) * 6.2831);
        const d = Math.hypot(gx - jx, gy - jy);
        if (d < best) { best = d; bh = hash21(nx * 1.7 + 0.3, ny * 1.3 + 0.7); }
      }
      val = bh; break;
    }
    default: val = 0;
  }
  return clamp01((val - 0.5) * (1 + cfg.contrast * 2) + 0.5);
}

/** Sample a color ramp at v ∈ [0,1]. */
export function samplePalette(stops: PatternStop[], v: number, smooth: boolean): [number, number, number] {
  if (!stops || stops.length === 0) return [v, v, v];
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  if (v <= sorted[0].pos) return sorted[0].color;
  const last = sorted[sorted.length - 1];
  if (v >= last.pos) return last.color;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (v >= a.pos && v <= b.pos) {
      let t = (v - a.pos) / ((b.pos - a.pos) || 1);
      if (smooth) t = t * t * (3 - 2 * t);
      return [a.color[0] + (b.color[0] - a.color[0]) * t, a.color[1] + (b.color[1] - a.color[1]) * t, a.color[2] + (b.color[2] - a.color[2]) * t];
    }
  }
  return last.color;
}
