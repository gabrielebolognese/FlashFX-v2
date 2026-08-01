// Pure, client-side shot/scene-cut detection primitives.
//
// A hard cut between shots shows up as a large jump in the frame's color
// distribution. We summarize each sampled frame as a small concatenated RGB
// histogram and flag a cut wherever consecutive histograms differ by more than a
// threshold (total-variation distance). No ML, no FFT — deterministic and
// dependency-free so it's provable by scripts/verify-scenes. The browser side
// (engine/video/sceneDetect.ts) decodes frames and feeds pixels in here.

/**
 * Concatenated per-channel RGB histogram, normalized so the whole vector sums to
 * 1 (making total-variation distance land in [0, 1]). Input is RGBA bytes.
 */
export function computeColorHistogram(rgba: Uint8ClampedArray | Uint8Array, binsPerChannel = 8): Float32Array {
  const hist = new Float32Array(binsPerChannel * 3);
  const pxCount = Math.floor(rgba.length / 4);
  const scale = binsPerChannel / 256;
  for (let i = 0; i < rgba.length; i += 4) {
    const rb = Math.min(binsPerChannel - 1, Math.floor(rgba[i] * scale));
    const gb = Math.min(binsPerChannel - 1, Math.floor(rgba[i + 1] * scale));
    const bb = Math.min(binsPerChannel - 1, Math.floor(rgba[i + 2] * scale));
    hist[rb]++;
    hist[binsPerChannel + gb]++;
    hist[2 * binsPerChannel + bb]++;
  }
  const total = pxCount * 3;
  if (total > 0) for (let b = 0; b < hist.length; b++) hist[b] /= total;
  return hist;
}

/** Total-variation distance between two normalized histograms → [0, 1]. */
export function histogramDistance(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i]);
  return sum / 2;
}

/**
 * Indices (into the histogram list) where the distance from the previous frame
 * meets/exceeds `threshold` — i.e. the sampled frames that begin a new shot.
 */
export function detectCutIndices(histograms: Float32Array[], threshold = 0.4): number[] {
  const cuts: number[] = [];
  for (let i = 1; i < histograms.length; i++) {
    if (histogramDistance(histograms[i - 1], histograms[i]) >= threshold) cuts.push(i);
  }
  return cuts;
}
