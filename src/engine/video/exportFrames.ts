// B68: pure planning for the exporter's (and render_frame's) EXCLUSIVE video-frame source.
//
// The export used to inject its decoded frames into the shared preview frameScheduler. That singleton
// also runs playback prefetch (its own decoders, keyed by the SAME layer ids the export renderer
// reports), caps open frames per asset by closing the ones farthest from the PREVIEW playhead, and
// kept up to 512 MB of export frames alive. On comps with several clips this piled up a hundred-plus
// open decoder frames and hundreds of short-lived decoders (one per getSample call per clip per frame)
// until the browser's decoder failed ("Decoding error.") and the export aborted. The export now owns
// its frames: it holds exactly the frames the current composition frame needs, decodes each asset with
// ONE forward cursor (each source frame decoded once), and never touches the preview scheduler.
//
// Leaf module (no imports) so scripts/verify-export-frames.mjs bundles it in node.

/** A source frame of one video asset. */
export interface ExportFrameReq {
  assetId: string;
  frame: number;
}

/** What the renderer reads video frames from (the preview scheduler, or an export source). */
export interface VideoFrameLookup {
  getFrame(assetId: string, frameIndex: number): VideoFrame | ImageBitmap | null;
}

/** A decode session owned by one export / render_frame run (videoDecoderPool.openExportReader). */
export interface ExportVideoReader {
  decode(assetId: string, frameIndex: number): Promise<VideoFrame>;
  close(): Promise<void>;
}

export const exportFrameKey =(assetId: string, frame: number): string => `${assetId}#${frame}`;

/**
 * Given the keys of the frames held now and the frames the next composition frame needs: which held
 * frames to close (not needed any more) and which needed frames to decode (not held yet, deduped, in
 * request order). A frame needed again (a held clip, a slowed clip on the same source frame) is kept.
 */
export function planExportFrames(held: Iterable<string>, needed: readonly ExportFrameReq[]): { close: string[]; decode: ExportFrameReq[] } {
  const want = new Map<string, ExportFrameReq>();
  for (const r of needed) {
    const k = exportFrameKey(r.assetId, r.frame);
    if (!want.has(k)) want.set(k, r);
  }
  const heldSet = new Set(held);
  const close: string[] = [];
  for (const k of heldSet) if (!want.has(k)) close.push(k);
  const decode: ExportFrameReq[] = [];
  for (const [k, r] of want) if (!heldSet.has(k)) decode.push(r);
  return { close, decode };
}

/** How far ahead (source frames) a cursor walks forward before a seek (reopen at the key frame) is cheaper. */
export const EXPORT_FORWARD_WINDOW = 120;
/** Forward cursors per asset (two layers on one clip at different offsets each keep their own). */
export const EXPORT_CURSORS_PER_ASSET = 3;

/** The state of one forward decode cursor the planner reads. */
export interface ExportCursorState {
  /** Source index of the sample it holds (-1 = not opened yet). */
  index: number;
  /** Source index of the sample it already pulled but has not shown yet (it lies past a request), or null. */
  peekIndex: number | null;
}

export type ExportCursorStep = 'reuse' | 'advance' | 'reopen';

/**
 * How a forward cursor reaches source frame `target`. The frame shown for `target` is the last sample
 * whose index is <= target (the sample covering that time, like a single-shot getSample):
 *  - reuse: the held sample already covers it (same index, or the next sample lies beyond the target);
 *  - advance: decode forward (at most `window` frames);
 *  - reopen: unopened, backwards, or too far ahead (seek to the key frame at the target).
 */
export function exportCursorStep(c: ExportCursorState, target: number, window: number = EXPORT_FORWARD_WINDOW): ExportCursorStep {
  if (c.index < 0) return 'reopen';
  if (target === c.index) return 'reuse';
  if (target < c.index) return 'reopen';
  if (c.peekIndex !== null && c.peekIndex > target) return 'reuse';
  return target - c.index <= window ? 'advance' : 'reopen';
}

/**
 * Pick the cursor (index into `cursors`) that should serve `target`: one that can reuse its sample,
 * else the nearest one behind the target within the window, else -1 (open a new cursor or recycle the
 * least recently used one).
 */
export function pickExportCursor(cursors: readonly ExportCursorState[], target: number, window: number = EXPORT_FORWARD_WINDOW): number {
  let best = -1;
  for (let i = 0; i < cursors.length; i++) {
    const step = exportCursorStep(cursors[i], target, window);
    if (step === 'reuse') return i;
    if (step === 'advance' && (best < 0 || cursors[i].index > cursors[best].index)) best = i;
  }
  return best;
}
