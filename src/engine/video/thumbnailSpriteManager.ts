import { create } from 'zustand';
import { buildThumbnailSprite } from './thumbnailLane';
import { loadThumbnailSprite, saveThumbnailSprite, deleteThumbnailSprite } from './thumbnailSpriteStore';
import type { ThumbnailSpriteMeta } from './thumbnailSprite';

// PB6 - orchestrates thumbnail sprites for the timeline filmstrip: on a clip's import/reload it loads the
// OPFS-persisted atlas (instant) or builds one on the dedicated lane (thumbnailLane) and persists it,
// then keeps the decoded atlas ImageBitmap in memory for the consumer (TrackArea's VideoThumb) to draw a
// cell from - no per-frame playback-cursor decode. Builds are SERIALIZED (a tail promise) so at most one
// thumbnail decoder is ever open. Everything is FAIL-OPEN: if a sprite can't be made, VideoThumb keeps
// using the live per-frame decode fallback, so the filmstrip never regresses.

export interface LoadedSprite {
  bitmap: ImageBitmap;
  meta: ThumbnailSpriteMeta;
}

// In-memory atlas cache, LRU-bounded so a huge project can't pin unbounded ImageBitmap memory.
const MAX_SPRITES = 24;
const sprites = new Map<string, LoadedSprite>();
const building = new Set<string>();
let buildTail: Promise<void> = Promise.resolve();

// A per-asset "ready" version so a React consumer can subscribe and repaint exactly when its sprite lands
// (bumped on first ready and on any rebuild). Kept separate from the bitmap map, which isn't reactive.
interface ThumbSpriteState {
  ready: Record<string, number>;
}
export const useThumbnailSpriteStore = create<ThumbSpriteState>(() => ({ ready: {} }));

function markReady(assetId: string): void {
  useThumbnailSpriteStore.setState((s) => ({ ready: { ...s.ready, [assetId]: (s.ready[assetId] ?? 0) + 1 } }));
}

/** Synchronous accessor for the consumer: the decoded atlas for an asset, or null if not ready. */
export function getThumbnailSprite(assetId: string): LoadedSprite | null {
  const s = sprites.get(assetId);
  if (s) {
    // touch for LRU (re-insert so it's most-recent)
    sprites.delete(assetId);
    sprites.set(assetId, s);
  }
  return s ?? null;
}

function store(assetId: string, sprite: LoadedSprite): void {
  sprites.set(assetId, sprite);
  while (sprites.size > MAX_SPRITES) {
    const oldest = sprites.keys().next().value as string | undefined;
    if (oldest === undefined || oldest === assetId) break;
    try { sprites.get(oldest)?.bitmap.close(); } catch { /* ignore */ }
    sprites.delete(oldest);
  }
  markReady(assetId);
}

/** Ensure a clip has a thumbnail sprite ready: use the OPFS-persisted atlas if present, else build one on
 *  the dedicated lane and persist it. Idempotent + serialized + fail-open. Fire-and-forget. */
export function ensureThumbnailSprite(assetId: string, blob: Blob, durationSec: number): void {
  if (sprites.has(assetId) || building.has(assetId)) return;
  building.add(assetId);
  buildTail = buildTail
    .then(async () => {
      if (sprites.has(assetId)) return;
      // 1) Reload fast-path: a persisted atlas.
      const persisted = await loadThumbnailSprite(assetId);
      if (persisted) {
        try {
          const bitmap = await createImageBitmap(persisted.blob);
          store(assetId, { bitmap, meta: persisted.meta });
          return;
        } catch {
          /* corrupt persisted atlas - fall through to a rebuild */
        }
      }
      // 2) Build on the dedicated lane, then persist for next time.
      const built = await buildThumbnailSprite(blob, durationSec);
      if (!built) return; // fail-open: VideoThumb keeps the live-decode fallback
      try {
        const bitmap = await createImageBitmap(built.blob);
        store(assetId, { bitmap, meta: built.meta });
      } catch {
        return;
      }
      void saveThumbnailSprite(assetId, built.blob, built.meta);
    })
    .catch(() => { /* fail-open */ })
    .finally(() => { building.delete(assetId); });
}

/** Drop a sprite from memory + OPFS (on permanent asset deletion). Best-effort. */
export function releaseThumbnailSprite(assetId: string): void {
  const s = sprites.get(assetId);
  if (s) {
    try { s.bitmap.close(); } catch { /* ignore */ }
    sprites.delete(assetId);
  }
  void deleteThumbnailSprite(assetId);
}
