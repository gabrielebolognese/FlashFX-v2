import { mediaAssetManager } from './assetManager';

// Canva-style import: bring footage into the MEDIA POOL (as assets) WITHOUT placing anything on the
// timeline. Placing many videos at once used to auto-create a clip per file, and each import fired an
// un-throttled full-file audio decode + decoder-worker spawn + blob writes — importing a batch of
// videos crashed the app. Here we (a) never touch the composition, and (b) cap how many files decode
// at once so a big drag doesn't launch N heavy imports in parallel. The user drags assets from the
// pool onto the timeline/canvas when they actually want them (addVideoFromAsset / addImageFromAsset).

const MAX_CONCURRENT_IMPORTS = 3;

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico', 'heic']);
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'mpg', 'mpeg', 'ogv']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'oga', 'aac', 'flac', 'm4a', 'opus', 'weba']);

function classify(file: File): 'image' | 'video' | 'audio' | null {
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (IMAGE_EXT.has(ext)) return 'image';
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';
  return null;
}

export interface PoolImportResult {
  imported: number;
  failed: number;
  skipped: number;
}

/**
 * Import files into the media pool with bounded concurrency. Never places on the timeline.
 * Resolves once every file has finished importing; the pool refreshes itself via the asset
 * manager's subscribe mechanism as each asset lands.
 */
export async function importFilesToPool(
  files: FileList | File[],
  projectId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<PoolImportResult> {
  const list = Array.from(files);
  const total = list.length;
  let imported = 0;
  let failed = 0;
  let skipped = 0;
  let done = 0;
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < list.length) {
      const file = list[cursor++];
      const kind = classify(file);
      try {
        if (kind === 'image') { await mediaAssetManager.importImage(file, projectId); imported++; }
        else if (kind === 'video') { await mediaAssetManager.importVideo(file, projectId); imported++; }
        else if (kind === 'audio') { await mediaAssetManager.importAudio(file, projectId); imported++; }
        else { skipped++; }
      } catch (err) {
        failed++;
        console.error('Import failed:', file.name, err);
      } finally {
        onProgress?.(++done, total);
      }
    }
  };

  const lanes = Math.min(MAX_CONCURRENT_IMPORTS, Math.max(1, list.length));
  await Promise.all(Array.from({ length: lanes }, () => worker()));
  return { imported, failed, skipped };
}
