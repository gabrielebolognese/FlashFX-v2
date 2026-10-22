// Pure size-estimate math for the MP4 exporter, split out so the (easy-to-get-wrong) VBR-honesty logic
// is unit-testable without WebGPU/WebCodecs. See scripts/verify-export-estimate.mjs.
//
// Why this exists: H.264 here is VBR - the chosen bitrate is a TARGET CEILING, not a guarantee. Simple
// vector content (shapes/text) encodes far below the ceiling; full-frame video/photographic content
// approaches it. The old estimate was `bitrate * duration` (pure CBR), so a 38s shapes project that
// really exports at ~4 MB was advertised as ~47 MB. This estimates the LIKELY size from the content and
// also exposes the ceiling, and the exporter refines the number from real encoded bytes mid-export.

/** Audio AAC target bitrate (bits/sec). Mirrors AUDIO_BITRATE in audioMixer.ts (kept local so this
 *  module stays pure and browser-free). */
export const EXPORT_AUDIO_BITRATE = 192_000;

/** Coarse content class, decided by the caller from the composition's layers. */
export type ExportContentClass = 'video' | 'photo' | 'mixed' | 'vector';

export interface ExportEstimateInputs {
  /** Video target ceiling, bits/sec (the quality preset's bitrate). */
  bitrate: number;
  /** Real output duration in seconds. */
  durationSec: number;
  includeAudio: boolean;
  content: ExportContentClass;
  /** Total layer count - busier scenes trend toward the ceiling within their class. */
  layerCount: number;
}

/**
 * Fraction of the target bitrate a VBR H.264 encode of this content class is LIKELY to actually use.
 * Heuristic (there is no way to know exactly without encoding), deliberately a touch high (erring high is
 * safer than promising a smaller file than we deliver), and only the PRE-export hint - the exporter
 * overrides it with a measured projection from real bytes once frames are flowing.
 */
export function contentComplexityFactor(content: ExportContentClass, layerCount: number): number {
  const base =
    content === 'video' ? 0.85 : // full-frame moving footage: high entropy, near the ceiling
    content === 'photo' ? 0.55 : // photographic stills
    content === 'mixed' ? 0.5 :  // precomp/cloner/unknown nesting
    0.10;                        // vector: shapes/text/solids compress very hard
  // Busier scenes (more layers) trend higher within their class.
  const bump = Math.min(0.2, 0.01 * Math.max(0, layerCount - 3));
  return Math.min(1, Math.max(0.05, base + bump));
}

/** Audio bytes for the whole output (AAC is ~CBR, so no content factor). */
function audioBytes(i: ExportEstimateInputs): number {
  return i.includeAudio ? (EXPORT_AUDIO_BITRATE * i.durationSec) / 8 : 0;
}

/** Hard upper bound: the encoder does not SUSTAIN above the target ceiling (CBR worst case) + audio. */
export function estimateCeilingBytes(i: ExportEstimateInputs): number {
  return (i.bitrate * i.durationSec) / 8 + audioBytes(i);
}

/** LIKELY output size for this content: the ceiling video term scaled by the content factor, + audio. */
export function estimateLikelyBytes(i: ExportEstimateInputs): number {
  const videoCeil = (i.bitrate * i.durationSec) / 8;
  return videoCeil * contentComplexityFactor(i.content, i.layerCount) + audioBytes(i);
}

export interface ExportSizeEstimate {
  likelyBytes: number;
  ceilingBytes: number;
}

export function estimateExportSize(i: ExportEstimateInputs): ExportSizeEstimate {
  return { likelyBytes: estimateLikelyBytes(i), ceilingBytes: estimateCeilingBytes(i) };
}

/** Minimal shape of a layer the content classifier reads (keeps this pure/testable). */
interface ClassifiableLayer { type: string }

/**
 * Decide the content class from a composition's layers. Video dominates size, so any video layer wins;
 * precomp/cloner can nest anything, so they read as 'mixed'; photographic stills next; otherwise the
 * scene is vector (shapes/text/solids) and compresses hard.
 */
export function classifyExportContent(layers: ClassifiableLayer[]): ExportContentClass {
  let hasVideo = false;
  let hasPhoto = false;
  let hasNested = false;
  for (const l of layers) {
    if (l.type === 'video') hasVideo = true;
    else if (l.type === 'image') hasPhoto = true;
    else if (l.type === 'precomp' || l.type === 'cloner') hasNested = true;
  }
  if (hasVideo) return 'video';
  if (hasNested) return 'mixed';
  if (hasPhoto) return 'photo';
  return 'vector';
}

/**
 * Mid-export projection from REAL encoded bytes: extrapolate the bytes seen so far across all frames,
 * then add audio. This is the honest, calibrated number that overrides the pre-export heuristic. Returns
 * null until at least one frame has been measured.
 */
export function projectExportSizeBytes(
  encodedVideoBytesSoFar: number,
  framesEncoded: number,
  totalFrames: number,
  audioBytesTotal: number,
): number | null {
  if (framesEncoded <= 0 || totalFrames <= 0) return null;
  const perFrame = encodedVideoBytesSoFar / framesEncoded;
  return perFrame * totalFrames + audioBytesTotal;
}
