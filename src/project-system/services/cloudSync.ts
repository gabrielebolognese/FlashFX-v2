import { create } from 'zustand';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../auth/store';
import { getAllMetadata, getMetadata, putMetadata, getScene, putScene } from '../storage/db';
import { deleteProject } from './projects';
import { videoAssetStore } from '../../engine/video/videoAssetStore';
import { planSync, type SyncItem } from './cloudSyncPlan';
import type { ProjectMetadata } from '../types';

// Client I/O for cloud project sync (Phase 2). Scene JSON + a metadata blob live in the
// `cloud_projects` table; media assets live in the private `project-assets` Storage bucket
// (path {user_id}/{projectId}/{assetId}). Everything is best-effort and FAILURE-ISOLATED — a cloud
// error is caught and surfaced only as sync status; the local IndexedDB stays the source of truth
// and a save/delete never fails because of the cloud. Conflict resolution is the tested planSync
// (last-write-wins). All of this is inert until the migration is applied + the user is signed in.

const BUCKET = 'project-assets';
const TOMBSTONE_KEY = 'ffx-cloud-tombstones';

// ── sync status (for the dashboard indicator) ──
export type CloudSyncStatus = 'idle' | 'syncing' | 'synced' | 'error';
interface CloudSyncState {
  status: CloudSyncStatus;
  lastSyncedAt: number | null;
  setStatus: (s: CloudSyncStatus) => void;
  markSynced: () => void;
}
export const useCloudSyncStore = create<CloudSyncState>((set) => ({
  status: 'idle',
  lastSyncedAt: null,
  setStatus: (status) => set({ status }),
  markSynced: () => set({ status: 'synced', lastSyncedAt: Date.now() }),
}));

function uid(): string | null {
  return useAuthStore.getState().user?.id ?? null;
}

/** True when cloud sync can run: Supabase configured AND signed in. */
export function cloudAvailable(): boolean {
  return !!supabase && useAuthStore.getState().status === 'signed-in' && !!uid();
}

// ── local tombstone log: a delete propagates and is never resurrected even if it happened offline ──
type Tombstones = Record<string, number>;
function readTombstones(): Tombstones {
  try { return JSON.parse(localStorage.getItem(TOMBSTONE_KEY) || '{}') as Tombstones; } catch { return {}; }
}
function writeTombstones(t: Tombstones): void {
  try { localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(t)); } catch { /* storage full/blocked — ignore */ }
}
export function recordLocalDelete(id: string): void {
  const t = readTombstones();
  t[id] = Date.now();
  writeTombstones(t);
}
function clearTombstone(id: string): void {
  const t = readTombstones();
  if (id in t) { delete t[id]; writeTombstones(t); }
}

interface CloudAssetMeta { fileName: string; mimeType: string; rotation: number; sampleTimestamps: number[] | null }
interface CloudMetaBlob { metadata?: ProjectMetadata; assets?: Record<string, CloudAssetMeta> }

async function listCloud(): Promise<SyncItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('cloud_projects').select('id, updated_at, deleted');
  if (error || !data) return [];
  return (data as { id: string; updated_at: string; deleted: boolean }[]).map((r) => ({
    id: r.id, updatedAt: Date.parse(r.updated_at), deleted: !!r.deleted,
  }));
}

async function pushAssets(userId: string, projectId: string): Promise<Record<string, CloudAssetMeta>> {
  const map: Record<string, CloudAssetMeta> = {};
  if (!supabase) return map;
  const metas = await videoAssetStore.listProjectAssets(projectId);
  for (const m of metas) {
    const blob = await videoAssetStore.getAsset(projectId, m.assetId);
    if (!blob) continue;
    const full = await videoAssetStore.getAssetMeta(projectId, m.assetId);
    await supabase.storage.from(BUCKET).upload(`${userId}/${projectId}/${m.assetId}`, blob, { upsert: true, contentType: m.mimeType });
    map[m.assetId] = {
      fileName: m.fileName,
      mimeType: m.mimeType,
      rotation: m.rotation,
      sampleTimestamps: full?.sampleTimestamps ? Array.from(full.sampleTimestamps) : null,
    };
  }
  return map;
}

async function pullAssets(userId: string, projectId: string, assets: Record<string, CloudAssetMeta>): Promise<void> {
  if (!supabase) return;
  for (const [assetId, a] of Object.entries(assets)) {
    const { data, error } = await supabase.storage.from(BUCKET).download(`${userId}/${projectId}/${assetId}`);
    if (error || !data) continue;
    const ts = a.sampleTimestamps ? new Float64Array(a.sampleTimestamps) : null;
    await videoAssetStore.saveAsset(projectId, assetId, data, a.fileName, a.rotation, ts);
  }
}

/** Upsert a project (scene + media + metadata) to the cloud. Safe to call fire-and-forget. */
export async function pushProject(id: string): Promise<void> {
  if (!supabase) return;
  const userId = uid();
  if (!userId) return;
  const meta = await getMetadata(id);
  const scene = await getScene(id);
  if (!meta || !scene) return;
  const assets = await pushAssets(userId, id);
  await supabase.from('cloud_projects').upsert({
    id,
    user_id: userId,
    name: meta.name,
    scene: JSON.parse(scene.data),
    meta: { metadata: meta, assets } satisfies CloudMetaBlob,
    deleted: false,
    updated_at: new Date(meta.modifiedAt).toISOString(),
  });
  clearTombstone(id);
}

/** Mark a project deleted in the cloud so the delete propagates to other devices. */
export async function pushTombstone(id: string): Promise<void> {
  if (!supabase) return;
  if (!uid()) return;
  await supabase.from('cloud_projects').update({ deleted: true, updated_at: new Date().toISOString() }).eq('id', id);
}

async function pullProject(id: string): Promise<void> {
  if (!supabase) return;
  const userId = uid();
  if (!userId) return;
  const { data, error } = await supabase.from('cloud_projects').select('id, name, scene, meta, updated_at').eq('id', id).single();
  if (error || !data) return;
  const row = data as { scene: unknown; meta: CloudMetaBlob | null };
  const metadata = row.meta?.metadata ?? (await getMetadata(id));
  if (metadata) await putMetadata({ ...metadata, id });
  await putScene({ id, data: JSON.stringify(row.scene) });
  if (row.meta?.assets) await pullAssets(userId, id, row.meta.assets);
}

/** Reconcile local ⇄ cloud and execute the plan. Best-effort; individual items fail in isolation. */
export async function syncAll(): Promise<void> {
  if (!cloudAvailable()) return;
  const localMeta = await getAllMetadata();
  const tombstones = readTombstones();
  const local: SyncItem[] = [
    ...localMeta.map((m) => ({ id: m.id, updatedAt: m.modifiedAt })),
    ...Object.entries(tombstones)
      .filter(([id]) => !localMeta.some((m) => m.id === id))
      .map(([id, t]) => ({ id, updatedAt: t, deleted: true })),
  ];
  const cloud = await listCloud();
  const plan = planSync(local, cloud);

  for (const id of plan.toPush) await pushProject(id).catch(() => {});
  for (const id of plan.toPushTombstone) await pushTombstone(id).catch(() => {});
  for (const id of plan.toPull) await pullProject(id).catch(() => {});
  for (const id of plan.toDeleteLocal) { await deleteProject(id).catch(() => {}); clearTombstone(id); }

  // Prune local tombstones the cloud already reflects as deleted.
  for (const id of Object.keys(tombstones)) {
    if (cloud.find((c) => c.id === id)?.deleted) clearTombstone(id);
  }
}
