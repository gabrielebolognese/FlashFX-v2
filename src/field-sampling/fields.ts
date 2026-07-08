import type { FieldDefinition, GlyphFieldDef, NoiseFieldDef, PathFieldDef, CompositeFieldDef } from './types';

export interface FieldGrid {
  data: Float32Array;
  width: number;
  height: number;
}

export function rasterizeField(
  field: FieldDefinition,
  width: number,
  height: number,
  time: number,
): FieldGrid {
  const data = new Float32Array(width * height);

  switch (field.type) {
    case 'glyph':
      rasterizeGlyph(field, width, height, data);
      break;
    case 'noise':
      rasterizeNoise(field, width, height, time, data);
      break;
    case 'path':
      rasterizePath(field, width, height, data);
      break;
    case 'composite':
      rasterizeComposite(field, width, height, time, data);
      break;
  }

  return { data, width, height };
}

export function sampleFieldAt(grid: FieldGrid, x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || ix >= grid.width || iy < 0 || iy >= grid.height) return 0;
  return grid.data[iy * grid.width + ix];
}

export function sampleFieldBilinear(grid: FieldGrid, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, grid.width - 1);
  const y1 = Math.min(y0 + 1, grid.height - 1);
  if (x0 < 0 || y0 < 0 || x0 >= grid.width || y0 >= grid.height) return 0;

  const fx = x - x0;
  const fy = y - y0;
  const w = grid.width;

  const v00 = grid.data[y0 * w + x0];
  const v10 = grid.data[y0 * w + x1];
  const v01 = grid.data[y1 * w + x0];
  const v11 = grid.data[y1 * w + x1];

  return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
}

function rasterizeGlyph(field: GlyphFieldDef, width: number, height: number, data: Float32Array): void {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${field.fontWeight} ${field.fontSize * field.resolution}px "${field.fontFamily}"`;
  ctx.fillText(field.text, width / 2, height / 2);

  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  for (let i = 0; i < width * height; i++) {
    data[i] = pixels[i * 4] / 255;
  }

  applyDistanceTransform(data, width, height);
}

function applyDistanceTransform(data: Float32Array, width: number, height: number): void {
  const maxDist = 16;
  const INF = maxDist * maxDist + 1;
  const dist = new Float32Array(data.length);

  // Initialize distance field: 0 for foreground, INF for background
  for (let i = 0; i < data.length; i++) {
    dist[i] = data[i] > 0.5 ? 0 : INF;
  }

  // 2-pass chamfer distance (fast approximation of EDT)
  // Forward pass (top-left to bottom-right)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (x > 0) dist[idx] = Math.min(dist[idx], dist[idx - 1] + 1);
      if (y > 0) dist[idx] = Math.min(dist[idx], dist[(y - 1) * width + x] + 1);
      if (x > 0 && y > 0) dist[idx] = Math.min(dist[idx], dist[(y - 1) * width + (x - 1)] + 1.414);
      if (x < width - 1 && y > 0) dist[idx] = Math.min(dist[idx], dist[(y - 1) * width + (x + 1)] + 1.414);
    }
  }

  // Backward pass (bottom-right to top-left)
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const idx = y * width + x;
      if (x < width - 1) dist[idx] = Math.min(dist[idx], dist[idx + 1] + 1);
      if (y < height - 1) dist[idx] = Math.min(dist[idx], dist[(y + 1) * width + x] + 1);
      if (x < width - 1 && y < height - 1) dist[idx] = Math.min(dist[idx], dist[(y + 1) * width + (x + 1)] + 1.414);
      if (x > 0 && y < height - 1) dist[idx] = Math.min(dist[idx], dist[(y + 1) * width + (x - 1)] + 1.414);
    }
  }

  // Convert distance to 0..1 field value
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.max(0, 1 - Math.sqrt(dist[i]) / maxDist);
  }
}

function rasterizeNoise(field: NoiseFieldDef, width: number, height: number, time: number, data: Float32Array): void {
  const timeOffset = time * field.timeSpeed;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = 0;
      let amplitude = 1;
      let frequency = field.scale;
      let maxAmp = 0;

      for (let o = 0; o < field.octaves; o++) {
        const nx = x * frequency + field.seed * 100;
        const ny = y * frequency + field.seed * 200;
        const nz = timeOffset * frequency;
        value += simplexNoise3D(nx, ny, nz) * amplitude;
        maxAmp += amplitude;
        amplitude *= field.persistence;
        frequency *= field.lacunarity;
      }

      value = (value / maxAmp + 1) * 0.5;
      data[y * width + x] = value > field.threshold ? value : 0;
    }
  }
}

function rasterizePath(field: PathFieldDef, width: number, height: number, data: Float32Array): void {
  if (field.points.length < 2) return;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();

  if (field.smoothing > 0) {
    drawSmoothPath(ctx, field.points, field.smoothing, field.closed);
  } else {
    ctx.moveTo(field.points[0][0], field.points[0][1]);
    for (let i = 1; i < field.points.length; i++) {
      ctx.lineTo(field.points[i][0], field.points[i][1]);
    }
    if (field.closed) ctx.closePath();
  }
  ctx.stroke();

  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  for (let i = 0; i < width * height; i++) {
    data[i] = pixels[i * 4] / 255;
  }

  applyDistanceTransform(data, width, height);
}

function drawSmoothPath(
  ctx: OffscreenCanvasRenderingContext2D,
  points: [number, number][],
  smoothing: number,
  closed: boolean,
): void {
  const pts = closed ? [...points, points[0], points[1]] : points;
  ctx.moveTo(pts[0][0], pts[0][1]);

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];

    const cp1x = curr[0] - (next[0] - prev[0]) * smoothing * 0.25;
    const cp1y = curr[1] - (next[1] - prev[1]) * smoothing * 0.25;
    const cp2x = curr[0] + (next[0] - prev[0]) * smoothing * 0.25;
    const cp2y = curr[1] + (next[1] - prev[1]) * smoothing * 0.25;

    const midX = (prev[0] + curr[0]) / 2;
    const midY = (prev[1] + curr[1]) / 2;
    ctx.quadraticCurveTo(cp1x, cp1y, midX + (curr[0] - midX), midY + (curr[1] - midY));

    if (i < pts.length - 2) {
      ctx.quadraticCurveTo(cp2x, cp2y, (curr[0] + next[0]) / 2, (curr[1] + next[1]) / 2);
    }
  }

  if (!closed && pts.length > 1) {
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  }
}

function rasterizeComposite(field: CompositeFieldDef, width: number, height: number, time: number, data: Float32Array): void {
  if (field.fields.length === 0) return;

  const first = rasterizeField(field.fields[0], width, height, time);
  data.set(first.data);

  for (let f = 1; f < field.fields.length; f++) {
    const other = rasterizeField(field.fields[f], width, height, time);
    const len = width * height;

    switch (field.op) {
      case 'union':
        for (let i = 0; i < len; i++) data[i] = Math.max(data[i], other.data[i]);
        break;
      case 'intersect':
        for (let i = 0; i < len; i++) data[i] = Math.min(data[i], other.data[i]);
        break;
      case 'subtract':
        for (let i = 0; i < len; i++) data[i] = Math.max(0, data[i] - other.data[i]);
        break;
      case 'multiply':
        for (let i = 0; i < len; i++) data[i] *= other.data[i];
        break;
    }
  }
}

// Simplex 3D noise (simplified implementation)
const GRAD3: [number, number, number][] = [
  [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
  [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
  [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1],
];

const PERM = new Uint8Array(512);
const PERM_MOD12 = new Uint8Array(512);

(function initPerm() {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher-Yates with fixed seed
  let s = 12345;
  for (let i = 255; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) {
    PERM[i] = p[i & 255];
    PERM_MOD12[i] = PERM[i] % 12;
  }
})();

function simplexNoise3D(xin: number, yin: number, zin: number): number {
  const F3 = 1.0 / 3.0;
  const G3 = 1.0 / 6.0;

  const s = (xin + yin + zin) * F3;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);
  const k = Math.floor(zin + s);

  const t = (i + j + k) * G3;
  const X0 = i - t;
  const Y0 = j - t;
  const Z0 = k - t;
  const x0 = xin - X0;
  const y0 = yin - Y0;
  const z0 = zin - Z0;

  let i1: number, j1: number, k1: number;
  let i2: number, j2: number, k2: number;

  if (x0 >= y0) {
    if (y0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; }
    else if (x0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; }
    else { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }
  } else {
    if (y0 < z0) { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; }
    else if (x0 < z0) { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; }
    else { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; }
  }

  const x1 = x0 - i1 + G3;
  const y1 = y0 - j1 + G3;
  const z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2 * G3;
  const y2 = y0 - j2 + 2 * G3;
  const z2 = z0 - k2 + 2 * G3;
  const x3 = x0 - 1 + 3 * G3;
  const y3 = y0 - 1 + 3 * G3;
  const z3 = z0 - 1 + 3 * G3;

  const ii = i & 255;
  const jj = j & 255;
  const kk = k & 255;

  let n0 = 0, n1 = 0, n2 = 0, n3 = 0;

  let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
  if (t0 >= 0) {
    t0 *= t0;
    const gi0 = PERM_MOD12[ii + PERM[jj + PERM[kk]]];
    n0 = t0 * t0 * (GRAD3[gi0][0]*x0 + GRAD3[gi0][1]*y0 + GRAD3[gi0][2]*z0);
  }

  let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
  if (t1 >= 0) {
    t1 *= t1;
    const gi1 = PERM_MOD12[ii+i1 + PERM[jj+j1 + PERM[kk+k1]]];
    n1 = t1 * t1 * (GRAD3[gi1][0]*x1 + GRAD3[gi1][1]*y1 + GRAD3[gi1][2]*z1);
  }

  let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
  if (t2 >= 0) {
    t2 *= t2;
    const gi2 = PERM_MOD12[ii+i2 + PERM[jj+j2 + PERM[kk+k2]]];
    n2 = t2 * t2 * (GRAD3[gi2][0]*x2 + GRAD3[gi2][1]*y2 + GRAD3[gi2][2]*z2);
  }

  let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
  if (t3 >= 0) {
    t3 *= t3;
    const gi3 = PERM_MOD12[ii+1 + PERM[jj+1 + PERM[kk+1]]];
    n3 = t3 * t3 * (GRAD3[gi3][0]*x3 + GRAD3[gi3][1]*y3 + GRAD3[gi3][2]*z3);
  }

  return 32 * (n0 + n1 + n2 + n3);
}
