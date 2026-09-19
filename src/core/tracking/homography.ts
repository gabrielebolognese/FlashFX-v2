// Corner-pin homography (B27) - pure projective geometry (leaf module, no imports). Solves the 3x3
// homography mapping a source quad to a destination quad (the classic corner-pin / planar-track
// warp), applies it to points, and inverts it. Deterministic + unit-tested (verify:tracking). The
// tracker that FINDS the quad across frames is browser image analysis (B27-track); this math consumes
// four corner positions.

export type Pt = [number, number];
export type Quad = [Pt, Pt, Pt, Pt];
/** Row-major 3x3 homography [ a b c ; d e f ; g h 1 ]. */
export type Homography = [number, number, number, number, number, number, number, number, number];

export const IDENTITY_HOMOGRAPHY: Homography = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Solve A x = b for an n x n system by Gaussian elimination with partial pivoting. null if singular. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  // augmented matrix
  const m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    // pivot
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    if (Math.abs(m[piv][col]) < 1e-12) return null;
    [m[col], m[piv]] = [m[piv], m[col]];
    // eliminate
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** The homography mapping the 4 `src` corners onto the 4 `dst` corners. Falls back to identity if degenerate. */
export function computeHomography(src: Quad, dst: Quad): Homography {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]); b.push(v);
  }
  const h = solveLinear(A, b);
  if (!h) return [...IDENTITY_HOMOGRAPHY] as Homography;
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/** Apply a homography to a point (perspective divide). */
export function applyHomography(H: Homography, p: Pt): Pt {
  const x = p[0], y = p[1];
  const w = H[6] * x + H[7] * y + H[8] || 1e-12;
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

/** Inverse homography (adjugate / determinant). null if singular. */
export function invertHomography(H: Homography): Homography | null {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h, B = c * h - b * i, C = b * f - c * e;
  const D = f * g - d * i, E = a * i - c * g, F = c * d - a * f;
  const G = d * h - e * g, Hh = b * g - a * h, I = a * e - b * d;
  const det = a * A + b * D + c * G;
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  const out = [A * inv, B * inv, C * inv, D * inv, E * inv, F * inv, G * inv, Hh * inv, I * inv] as Homography;
  // normalise so out[8] = 1
  const s = out[8] || 1e-12;
  return out.map((v) => v / s) as Homography;
}
