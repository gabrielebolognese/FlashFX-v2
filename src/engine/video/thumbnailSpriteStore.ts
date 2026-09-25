import type { ThumbnailSpriteMeta } from './thumbnailSprite';

// PB6 - OPFS-backed persistence for timeline thumbnail SPRITE SHEETS, keyed by asset id, so a clip's
// filmstrip survives a reload instead of being re-decoded (the "thumbnail decode storm"). Mirrors
// proxyStore.ts verbatim in shape and discipline: FULLY GUARDED / FAIL-OPEN - if OPFS is unavailable or
// any op throws, every function resolves to a safe default (null / no-op) and the caller falls back to
// building the sprite (thumbnailLane) or to the live per-frame decode. Nothing here can break playback.
//
// Each asset stores TWO files: the packed atlas PNG and a small JSON sidecar with its ThumbnailSpriteMeta
// (grid geometry + interval), so the consumer can map a source time to the right cell without re-planning.

const DIR = 'flashfx-thumbnails';

async function thumbDir(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  try {
    const storage = navigator?.storage;
    if (!storage || typeof storage.getDirectory !== 'function') return null;
    const root = await storage.getDirectory();
    return await root.getDirectoryHandle(DIR, { create });
  } catch {
    return null;
  }
}

/** Stable OPFS base filename for an asset's sprite (asset ids are already reload-stable). */
function baseName(assetId: string): string {
  return `thumbs_${assetId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

export interface StoredSprite {
  blob: Blob;
  meta: ThumbnailSpriteMeta;
}

/** The persisted sprite (atlas blob + meta) for an asset, or null if none / OPFS unavailable / stale. */
export async function loadThumbnailSprite(assetId: string): Promise<StoredSprite | null> {
  try {
    const dir = await thumbDir(false);
    if (!dir) return null;
    const base = baseName(assetId);
    const pngHandle = await dir.getFileHandle(`${base}.png`);
    const metaHandle = await dir.getFileHandle(`${base}.json`);
    const blob = await pngHandle.getFile();
    if (blob.size === 0) return null;
    const metaText = await (await metaHandle.getFile()).text();
    const meta = JSON.parse(metaText) as ThumbnailSpriteMeta;
    if (!meta || typeof meta.count !== 'number' || meta.count < 1) return null;
    return { blob, meta };
  } catch {
    return null; // not found / unavailable / unparseable -> caller rebuilds
  }
}

/** Persist a sprite (atlas blob + meta) for an asset (best-effort; silently no-ops on any failure). */
export async function saveThumbnailSprite(assetId: string, blob: Blob, meta: ThumbnailSpriteMeta): Promise<void> {
  try {
    const dir = await thumbDir(true);
    if (!dir) return;
    const base = baseName(assetId);
    const pngHandle = await dir.getFileHandle(`${base}.png`, { create: true });
    const png = await pngHandle.createWritable();
    await png.write(blob);
    await png.close();
    const metaHandle = await dir.getFileHandle(`${base}.json`, { create: true });
    const metaW = await metaHandle.createWritable();
    await metaW.write(JSON.stringify(meta));
    await metaW.close();
  } catch {
    /* best-effort */
  }
}

/** Remove an asset's persisted sprite (on permanent asset deletion). Best-effort. */
export async function deleteThumbnailSprite(assetId: string): Promise<void> {
  try {
    const dir = await thumbDir(false);
    if (!dir) return;
    const base = baseName(assetId);
    await dir.removeEntry(`${base}.png`).catch(() => {});
    await dir.removeEntry(`${base}.json`).catch(() => {});
  } catch {
    /* ignore */
  }
}
