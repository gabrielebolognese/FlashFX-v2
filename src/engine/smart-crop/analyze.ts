import type { Region } from './cropSolver';

// Smart Crop - image analysis (browser). Runs ONCE per image; the result feeds the pure solver, which
// re-solves for any aspect ratio without re-analyzing. Detection is classical + no model download:
//   - saliency/detail: Sobel gradient magnitude aggregated into a coarse grid, thresholded into blobs
//   - faces: best-effort via the browser Shape Detection API (window.FaceDetector) when available
// Both degrade gracefully (empty faces where unsupported; the solver then leans on saliency/center).
// This is CPU 2D-canvas work - not runtime-testable here, so browser-gated; the solver it feeds is
// fully harnessed (verify:crop-solver).

export interface SaliencyGrid { cols: number; rows: number; cells: number[] }

export interface AnalysisResult {
  srcW: number;
  srcH: number;
  regions: Region[];
  saliencyGrid: SaliencyGrid;
  faceCount: number;
}

const ANALYSIS_MAX_SIDE = 320; // downscale for speed; results are normalized so resolution-independent

/** Draw a bitmap into a small 2D canvas and read its pixels (analysis copy). */
function toImageData(bitmap: ImageBitmap): { data: ImageData; w: number; h: number } | null {
  const scale = Math.min(1, ANALYSIS_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = (canvas as OffscreenCanvas).getContext('2d', { willReadFrequently: true }) as
    | OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, w, h);
  try { return { data: ctx.getImageData(0, 0, w, h), w, h }; } catch { return null; }
}

/** Sobel gradient magnitude per pixel from a luminance buffer. */
function gradientMagnitude(lum: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = (lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1]) - (lum[i - w - 1] + 2 * lum[i - 1] + lum[i + w - 1]);
      const gy = (lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1]) - (lum[i - w - 1] + 2 * lum[i - w] + lum[i - w + 1]);
      out[i] = Math.hypot(gx, gy);
    }
  }
  return out;
}

/** Aggregate a per-pixel field into a coarse cols x rows grid (summed, then normalized to [0,1]). */
function toGrid(field: Float32Array, w: number, h: number, cols: number, rows: number): number[] {
  const cells = new Array(cols * rows).fill(0);
  for (let y = 0; y < h; y++) {
    const gy = Math.min(rows - 1, Math.floor((y / h) * rows));
    for (let x = 0; x < w; x++) {
      const gx = Math.min(cols - 1, Math.floor((x / w) * cols));
      cells[gy * cols + gx] += field[y * w + x];
    }
  }
  let max = 0;
  for (const c of cells) if (c > max) max = c;
  if (max > 0) for (let i = 0; i < cells.length; i++) cells[i] /= max;
  return cells;
}

/** Extract up to `maxRegions` salient blobs from the grid via greedy peak + local box growth. */
function gridToRegions(cells: number[], cols: number, rows: number, maxRegions = 4): Region[] {
  const mean = cells.reduce((a, b) => a + b, 0) / cells.length;
  const std = Math.sqrt(cells.reduce((a, b) => a + (b - mean) * (b - mean), 0) / cells.length);
  const thresh = Math.min(0.9, mean + 0.6 * std);
  const used = new Array(cols * rows).fill(false);
  const regions: Region[] = [];

  for (let n = 0; n < maxRegions; n++) {
    // find the strongest unused cell above threshold
    let peak = -1; let peakVal = thresh;
    for (let i = 0; i < cells.length; i++) if (!used[i] && cells[i] > peakVal) { peakVal = cells[i]; peak = i; }
    if (peak < 0) break;
    // flood a connected blob of above-threshold neighbours
    const stack = [peak];
    let minX = cols, minY = rows, maxX = -1, maxY = -1, mass = 0;
    while (stack.length) {
      const i = stack.pop()!;
      if (used[i] || cells[i] < thresh) continue;
      used[i] = true; mass += cells[i];
      const cx = i % cols; const cy = (i / cols) | 0;
      minX = Math.min(minX, cx); minY = Math.min(minY, cy); maxX = Math.max(maxX, cx); maxY = Math.max(maxY, cy);
      if (cx > 0) stack.push(i - 1);
      if (cx < cols - 1) stack.push(i + 1);
      if (cy > 0) stack.push(i - cols);
      if (cy < rows - 1) stack.push(i + cols);
    }
    if (maxX < 0) break;
    regions.push({
      x: minX / cols, y: minY / rows,
      w: (maxX - minX + 1) / cols, h: (maxY - minY + 1) / rows,
      kind: 'saliency', weight: Math.min(1, mass / 4),
    });
  }
  return regions;
}

/** Best-effort face detection via the browser Shape Detection API (no model download). */
async function detectFaces(bitmap: ImageBitmap): Promise<Region[]> {
  const FD = (globalThis as unknown as { FaceDetector?: new (o?: unknown) => { detect(b: ImageBitmap): Promise<Array<{ boundingBox: DOMRectReadOnly }>> } }).FaceDetector;
  if (!FD) return [];
  try {
    const det = new FD({ fastMode: true, maxDetectedFaces: 12 });
    const faces = await det.detect(bitmap);
    return faces.map((f) => ({
      x: f.boundingBox.x / bitmap.width,
      y: f.boundingBox.y / bitmap.height,
      w: f.boundingBox.width / bitmap.width,
      h: f.boundingBox.height / bitmap.height,
      kind: 'face' as const,
      weight: 1,
    })).filter((r) => r.w > 0.01 && r.h > 0.01);
  } catch { return []; }
}

/** Analyze an image once into focal regions + a saliency grid for the preview overlay. */
export async function analyzeImage(bitmap: ImageBitmap): Promise<AnalysisResult> {
  const srcW = bitmap.width; const srcH = bitmap.height;
  const empty: AnalysisResult = { srcW, srcH, regions: [], saliencyGrid: { cols: 1, rows: 1, cells: [0] }, faceCount: 0 };

  const img = toImageData(bitmap);
  if (!img) return empty;
  const { data, w, h } = img;
  const px = data.data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  }

  const grad = gradientMagnitude(lum, w, h);
  const cols = Math.max(6, Math.round(24 * (w / Math.max(w, h))));
  const rows = Math.max(6, Math.round(24 * (h / Math.max(w, h))));
  const cells = toGrid(grad, w, h, cols, rows);
  const saliencyRegions = gridToRegions(cells, cols, rows);

  const faces = await detectFaces(bitmap);

  return {
    srcW, srcH,
    regions: [...faces, ...saliencyRegions],
    saliencyGrid: { cols, rows, cells },
    faceCount: faces.length,
  };
}
