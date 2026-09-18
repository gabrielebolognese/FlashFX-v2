// Color grading (B15) - 3D LUT engine (pure leaf, no imports). Parses Adobe/IRIDAS `.cube` LUTs and
// trilinearly samples them. This is the reference CPU sampler used by the Color Grade image-tool bake
// (renders now) and the spec the browser-gated GPU 3D-texture sample mirrors (B15-gpu). Fully
// unit-tested (verify:lut).

export interface LUT3D {
  /** Grid size N (the LUT is N x N x N). */
  size: number;
  /** N^3 * 3 floats in [0,1], red fastest: index = (b*N*N + g*N + r)*3 + channel. */
  data: Float32Array;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** An identity LUT of grid size N (output = input). */
export function identityLUT(size: number): LUT3D {
  const n = Math.max(2, Math.floor(size));
  const data = new Float32Array(n * n * n * 3);
  const d = n - 1;
  let i = 0;
  for (let b = 0; b < n; b++) {
    for (let g = 0; g < n; g++) {
      for (let r = 0; r < n; r++) {
        data[i++] = r / d; data[i++] = g / d; data[i++] = b / d;
      }
    }
  }
  return { size: n, data };
}

/**
 * Parse a `.cube` 3D LUT. Handles comments (#), TITLE, LUT_3D_SIZE, DOMAIN_MIN/MAX (stored for the
 * sampler), and the N^3 "r g b" data rows (red fastest). Returns null on malformed input or a 1D LUT.
 */
export function parseCube(text: string): LUT3D | null {
  let size = 0;
  const values: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const upper = line.toUpperCase();
    if (upper.startsWith('TITLE') || upper.startsWith('DOMAIN_') || upper.startsWith('LUT_1D_SIZE')) continue;
    if (upper.startsWith('LUT_3D_SIZE')) {
      const n = parseInt(line.split(/\s+/)[1], 10);
      if (Number.isFinite(n) && n >= 2) size = n;
      continue;
    }
    // a data row: three floats
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;
    const r = parseFloat(parts[0]); const g = parseFloat(parts[1]); const b = parseFloat(parts[2]);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) continue;
    values.push(r, g, b);
  }
  if (size < 2) return null;
  const expected = size * size * size * 3;
  if (values.length !== expected) return null;
  return { size, data: Float32Array.from(values) };
}

/** Trilinearly sample the LUT at (r,g,b) in [0,1]. Returns [r,g,b] in [0,1]. */
export function sampleLUT(lut: LUT3D, r: number, g: number, b: number): [number, number, number] {
  const n = lut.size; const d = n - 1;
  const fr = clamp01(r) * d, fg = clamp01(g) * d, fb = clamp01(b) * d;
  const r0 = Math.floor(fr), g0 = Math.floor(fg), b0 = Math.floor(fb);
  const r1 = Math.min(r0 + 1, d), g1 = Math.min(g0 + 1, d), b1 = Math.min(b0 + 1, d);
  const dr = fr - r0, dg = fg - g0, db = fb - b0;

  const idx = (ri: number, gi: number, bi: number) => (bi * n * n + gi * n + ri) * 3;
  const lerp = (a: number, x: number, t: number) => a + (x - a) * t;
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const c000 = lut.data[idx(r0, g0, b0) + c], c100 = lut.data[idx(r1, g0, b0) + c];
    const c010 = lut.data[idx(r0, g1, b0) + c], c110 = lut.data[idx(r1, g1, b0) + c];
    const c001 = lut.data[idx(r0, g0, b1) + c], c101 = lut.data[idx(r1, g0, b1) + c];
    const c011 = lut.data[idx(r0, g1, b1) + c], c111 = lut.data[idx(r1, g1, b1) + c];
    const x00 = lerp(c000, c100, dr), x10 = lerp(c010, c110, dr);
    const x01 = lerp(c001, c101, dr), x11 = lerp(c011, c111, dr);
    const y0 = lerp(x00, x10, dg), y1 = lerp(x01, x11, dg);
    out[c] = clamp01(lerp(y0, y1, db));
  }
  return out;
}
