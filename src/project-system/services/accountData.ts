import { listProjects, deleteProject } from './projects';
import { brandColorsDb, brandAssetsDb, savedAssetsDb } from '../storage/libraryDb';
import { videoAssetStore, type StorageStats } from '../../engine/video/videoAssetStore';

// Bulk account-data operations for the Account Settings panel. All local (IndexedDB) — there is no
// cloud copy yet, so these clear what lives on this device. Permanent and not recoverable.

/** Permanently delete every project (each project's scene, preview, and its media assets). */
export async function deleteAllProjects(): Promise<number> {
  const projects = await listProjects();
  for (const p of projects) await deleteProject(p.id);
  return projects.length;
}

/** Clear the reusable media library — brand colors, brand assets, and saved assets. Per-project
 *  media is owned by its project and removed with it (deleteAllProjects), so this targets the
 *  library the Brands/Saved tabs read. */
export async function deleteAllAssets(): Promise<void> {
  const clearStore = async (store: { all: () => Promise<{ id: string }[]>; delete: (id: string) => Promise<void> }) => {
    const rows = await store.all();
    for (const r of rows) await store.delete(r.id);
  };
  await clearStore(brandColorsDb);
  await clearStore(brandAssetsDb);
  await clearStore(savedAssetsDb);
}

/** Local (on-device) media storage usage — used until cloud storage is wired. */
export async function getLocalStorageStats(): Promise<StorageStats> {
  return videoAssetStore.getStorageStats();
}
