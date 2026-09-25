import { Input, BlobSource, ALL_FORMATS, VideoSampleSink, type VideoSample } from 'mediabunny';
import {
  planThumbnailSprite,
  timestampsForSprite,
  atlasSize,
  cellRect,
  type ThumbnailSpriteMeta,
} from './thumbnailSprite';

// PB6 - the DEDICATED thumbnail decode lane. It opens its OWN mediabunny Input + VideoSampleSink from the
// source blob and walks the file forward ONCE, packing evenly-spaced frames into a single atlas canvas.
// It never touches mediabunnyController's AssetCtl.cursors / frameCache / cursor-budget, so building a
// filmstrip can't steal the playback decode cursor (the "thumbnail decode storm" this batch removes).
//
// BROWSER-GATED + FAIL-OPEN: this runs a real WebCodecs decode via mediabunny (unverifiable in CI - tsc
// checks the API usage, the decode itself needs a browser). ANY failure (no OffscreenCanvas, undecodable
// codec, decode/draw error) returns null, and the caller falls back to the live per-frame decode path.
// It holds exactly ONE extra hardware VideoDecoder for the duration of one build; the iterator is
// returned in finally so the decoder closes promptly, and builds are serialized by the manager so at
// most one thumbnail decoder is ever open - staying clear of the browser's ~16-decoder ceiling.

const EPS = 1e-4; // timestamp slop when matching a sample to a planned target time

/** Draw one decoded sample into an atlas cell, object-fit: cover. The transient VideoFrame is closed
 *  immediately (drawImage is synchronous), so it holds a decoder slot only for the draw. Guarded. */
function drawSampleToCell(
  ctx: OffscreenCanvasRenderingContext2D,
  sample: VideoSample,
  rect: { x: number; y: number; w: number; h: number },
): void {
  let frame: VideoFrame | null = null;
  try {
    frame = sample.toVideoFrame();
    const fw = frame.displayWidth || frame.codedWidth;
    const fh = frame.displayHeight || frame.codedHeight;
    if (!fw || !fh) return;
    const scale = Math.max(rect.w / fw, rect.h / fh); // cover
    const dw = fw * scale;
    const dh = fh * scale;
    ctx.drawImage(frame, rect.x + (rect.w - dw) / 2, rect.y + (rect.h - dh) / 2, dw, dh);
  } catch {
    /* skip this cell - it stays blank */
  } finally {
    try { frame?.close(); } catch { /* ignore */ }
  }
}

/** Build a packed thumbnail sprite for a video blob on the dedicated lane. Returns the atlas PNG + its
 *  meta, or null on any failure (caller falls back). */
export async function buildThumbnailSprite(
  blob: Blob,
  durationSec: number,
): Promise<{ blob: Blob; meta: ThumbnailSpriteMeta } | null> {
  if (typeof OffscreenCanvas === 'undefined') return null; // no offscreen 2D -> fall back to live decode

  const meta = planThumbnailSprite(durationSec);
  const { width, height } = atlasSize(meta);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  let input: Input | null = null;
  let it: AsyncGenerator<VideoSample, void, unknown> | null = null;
  try {
    input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return null;

    const firstTs = await track.getFirstTimestamp();
    // Planned times are offsets from source start; the track's real first timestamp is the origin.
    const targets = timestampsForSprite(meta).map((t) => firstTs + t);

    const sink = new VideoSampleSink(track, { optimizeForLatency: true });
    it = sink.samples(firstTs);

    let ti = 0;
    while (ti < targets.length) {
      const { value, done } = await it.next();
      if (done) break; // EOF - remaining cells stay blank (short/odd clip)
      const sample = value;
      // One forward walk: a sample fills every still-unfilled target at or before its timestamp (handles
      // an interval shorter than the frame spacing, where one sample covers several cells).
      while (ti < targets.length && sample.timestamp >= targets[ti] - EPS) {
        drawSampleToCell(ctx, sample, cellRect(ti, meta));
        ti++;
      }
      try { sample.close(); } catch { /* ignore */ }
    }

    const out = await canvas.convertToBlob({ type: 'image/png' });
    return { blob: out, meta };
  } catch {
    return null; // fail-open
  } finally {
    try { await it?.return(undefined); } catch { /* closes the decoder */ }
  }
}
