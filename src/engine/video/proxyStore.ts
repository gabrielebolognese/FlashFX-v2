// OPFS-backed persistence for low-res video proxies (PB4c), keyed by asset id, so a proxy survives a
// reload instead of being re-transcoded. FULLY GUARDED / FAIL-OPEN: if OPFS is unavailable or any op
// throws, every function resolves to a safe default (null / no-op) and the caller falls back to
// rebuilding the proxy (PB4b) or using the original video. Nothing here can break playback.

const DIR = 'flashfx-proxies';

async function proxyDir(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  try {
    const storage = navigator?.storage;
    if (!storage || typeof storage.getDirectory !== 'function') return null;
    const root = await storage.getDirectory();
    return await root.getDirectoryHandle(DIR, { create });
  } catch {
    return null;
  }
}

/** Stable OPFS filename for an asset's proxy (asset ids are already reload-stable). */
function proxyFileName(assetId: string): string {
  return `proxy_${assetId.replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`;
}

/** The persisted proxy blob for an asset, or null if none / OPFS unavailable (caller rebuilds). */
export async function loadProxy(assetId: string): Promise<Blob | null> {
  try {
    const dir = await proxyDir(false);
    if (!dir) return null;
    const handle = await dir.getFileHandle(proxyFileName(assetId));
    const file = await handle.getFile();
    return file.size > 0 ? file : null;
  } catch {
    return null; // not found / unavailable
  }
}

/** Persist a proxy blob for an asset (best-effort; silently no-ops on any failure). */
export async function saveProxy(assetId: string, blob: Blob): Promise<void> {
  try {
    const dir = await proxyDir(true);
    if (!dir) return;
    const handle = await dir.getFileHandle(proxyFileName(assetId), { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  } catch {
    /* best-effort */
  }
}

/** Remove an asset's persisted proxy (on permanent asset deletion). Best-effort. */
export async function deleteProxy(assetId: string): Promise<void> {
  try {
    const dir = await proxyDir(false);
    if (dir) await dir.removeEntry(proxyFileName(assetId));
  } catch {
    /* ignore */
  }
}
