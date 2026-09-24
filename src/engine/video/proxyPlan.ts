// Pure proxy-planning policy (PB4a): given a source video's metadata, decide whether to build a
// low-res, short-GOP PROXY for smooth scrubbing, and with what target dimensions + keyframe interval.
// No I/O, no decode - just the decision, so it's unit-testable (scripts/verify-proxy-plan.mjs). The
// actual background transcode (WebCodecs encode -> muxed proxy file) + OPFS persistence + decode routing
// are PB4b (browser). Frame rate + frame count are intentionally preserved by the proxy so a proxy frame
// maps 1:1 to the original by source index (keeps the whole resolve/schedule/render path unchanged).

export interface ProxyPlan {
  /** Target proxy width in pixels (even, aspect-preserving). */
  width: number;
  /** Target proxy height in pixels (even, aspect-preserving). */
  height: number;
  /** Keyframe interval (GOP) for the proxy. 1 = all-intra, so every seek is ~1 decode. */
  keyframeInterval: number;
}

export interface ProxySourceMeta {
  width: number;
  height: number;
  frameRate: number;
  durationFrames: number;
}

// Longest proxy edge, in pixels. 1280 keeps proxies cheap to decode/upload while staying watchable for
// preview; the layer still renders at the source size (the quad is sized from source metadata), so the
// proxy only lowers preview resolution, never geometry.
const MAX_PROXY_EDGE = 1280;
// Footage longer than this is likely long-GOP export material where seeking is the pain, so it gets an
// all-intra proxy even if it's not high-res.
const LONG_DURATION_SEC = 60;

/** Round down to an even number >= 2 (H.264 needs even dimensions). */
function even(n: number): number {
  return Math.max(2, Math.floor(n / 2) * 2);
}

/**
 * Returns the proxy plan for a source, or null when a proxy isn't worth it (the source is already cheap
 * to scrub: at or below 1080p AND short). A proxy is planned when the source is high-res (> 1080p, heavy
 * per-frame upload/convert) OR long (> 60s, likely long-GOP so seeks are slow). The target downscales so
 * the long edge is <= MAX_PROXY_EDGE (aspect preserved, even dims) and is all-intra (keyframeInterval 1)
 * for instant seeks.
 */
export function planProxy(meta: ProxySourceMeta): ProxyPlan | null {
  const { width, height, frameRate, durationFrames } = meta;
  if (!(width > 0) || !(height > 0)) return null;

  const durationSec = frameRate > 0 ? durationFrames / frameRate : 0;
  const highRes = width > 1920 || height > 1080;
  const long = durationSec > LONG_DURATION_SEC;
  if (!highRes && !long) return null; // already cheap to scrub - no proxy

  const longEdge = Math.max(width, height);
  const scale = longEdge > MAX_PROXY_EDGE ? MAX_PROXY_EDGE / longEdge : 1;
  return {
    width: even(width * scale),
    height: even(height * scale),
    keyframeInterval: 1,
  };
}
