// PB6 - pure planning + layout + lookup math for timeline thumbnail SPRITE SHEETS. A sprite is one
// packed atlas image holding N evenly-spaced thumbnails of a clip; the timeline filmstrip draws a
// sub-rect of it instead of decoding a frame per cell through the playback cursor. This module has NO
// decode / DOM / OPFS dependency - it's the deterministic geometry, so it's unit-tested
// (scripts/verify-thumbnail-sprite.mjs) and shared by the builder (thumbnailLane) and the consumer
// (TrackArea's VideoThumb). All times are SECONDS FROM SOURCE START (the builder adds the track's real
// first timestamp; the consumer derives seconds from its 0-based source frame), so the plan and the
// lookup agree without either knowing the track's absolute timebase.

export const THUMB_SPRITE_VERSION = 1;

// One atlas cell. 16:9, small - a filmstrip thumb is tiny on screen, so this keeps the atlas well under
// the max texture/canvas dimension even for a long clip.
export const THUMB_CELL_W = 160;
export const THUMB_CELL_H = 90;

// One thumbnail per this many source seconds (the target density), and a hard cap on total cells. A clip
// longer than MAX_THUMBS * interval widens the interval so the atlas stays bounded (count == MAX_THUMBS).
export const THUMB_INTERVAL_SEC = 1;
export const MAX_THUMBS = 200;

// The atlas never exceeds this in either dimension (safe for a 2D canvas and a future GPU texture).
export const MAX_ATLAS_DIM = 4096;

export interface ThumbnailSpriteMeta {
  version: number;
  /** px per cell in the atlas. */
  cellW: number;
  cellH: number;
  /** atlas grid. */
  cols: number;
  rows: number;
  /** number of real thumbnails packed (<= cols*rows). */
  count: number;
  /** seconds between sampled source timestamps. */
  intervalSec: number;
  /** source time (seconds from source start) of cell 0. Always 0 in the plan. */
  firstTs: number;
  /** clip duration used to plan (seconds). */
  durationSec: number;
}

/** Decide the sprite geometry for a clip of `durationSec`. Deterministic and pure. */
export function planThumbnailSprite(durationSec: number): ThumbnailSpriteMeta {
  const dur = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;

  let intervalSec = THUMB_INTERVAL_SEC;
  // ceil so the last partial second still gets a cell; at least 1 cell even for a still/zero-length clip.
  let count = Math.max(1, Math.ceil(dur / intervalSec));
  if (count > MAX_THUMBS) {
    count = MAX_THUMBS;
    intervalSec = dur / MAX_THUMBS; // widen so N cells span the whole clip
  }

  // Grid: fill rows up to the atlas width cap, then wrap.
  const maxCols = Math.max(1, Math.floor(MAX_ATLAS_DIM / THUMB_CELL_W));
  const cols = Math.min(count, maxCols);
  const rows = Math.ceil(count / cols);

  return {
    version: THUMB_SPRITE_VERSION,
    cellW: THUMB_CELL_W,
    cellH: THUMB_CELL_H,
    cols,
    rows,
    count,
    intervalSec,
    firstTs: 0,
    durationSec: dur,
  };
}

/** The source timestamps (seconds from source start) to sample, one per cell, in cell order. */
export function timestampsForSprite(meta: ThumbnailSpriteMeta): number[] {
  const out: number[] = new Array(meta.count);
  for (let i = 0; i < meta.count; i++) out[i] = meta.firstTs + i * meta.intervalSec;
  return out;
}

/** Pixel size of the packed atlas. */
export function atlasSize(meta: ThumbnailSpriteMeta): { width: number; height: number } {
  return { width: meta.cols * meta.cellW, height: meta.rows * meta.cellH };
}

/** Pixel rect of cell `index` within the atlas (row-major). Clamped to a valid cell. */
export function cellRect(index: number, meta: ThumbnailSpriteMeta): { x: number; y: number; w: number; h: number } {
  const i = Math.max(0, Math.min(index, meta.count - 1));
  const col = i % meta.cols;
  const row = Math.floor(i / meta.cols);
  return { x: col * meta.cellW, y: row * meta.cellH, w: meta.cellW, h: meta.cellH };
}

/** The nearest cell index for a given source time (seconds from source start), clamped to [0,count). */
export function cellIndexForTime(sec: number, meta: ThumbnailSpriteMeta): number {
  if (meta.intervalSec <= 0) return 0;
  const raw = Math.round((sec - meta.firstTs) / meta.intervalSec);
  return Math.max(0, Math.min(raw, meta.count - 1));
}
