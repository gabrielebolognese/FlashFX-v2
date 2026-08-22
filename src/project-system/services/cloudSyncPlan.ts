// Pure last-write-wins sync planner. Given the local project list and the cloud project list (each
// item = id + a logical last-modified time + a deleted tombstone flag), it decides what to push,
// pull, or delete on each side. No I/O, no Supabase, no React — so it is fully unit-testable and the
// conflict rules are provable (see scripts/verify-cloudsync.mjs). The actual transfer (scene JSON +
// media blobs) is a separate layer that consumes this plan.

export interface SyncItem {
  id: string;
  /** Logical last-modified time, ms epoch. Local = ProjectMetadata.modifiedAt; cloud = updated_at. */
  updatedAt: number;
  /** Tombstone: the project was deleted (kept around so the delete propagates). */
  deleted?: boolean;
}

export interface SyncPlan {
  /** Local is newer (or local-only): upsert local → cloud. */
  toPush: string[];
  /** Cloud is newer (or cloud-only): download cloud → local. */
  toPull: string[];
  /** Cloud tombstone is newer: remove the local copy. */
  toDeleteLocal: string[];
  /** Local delete is newer: write a tombstone to cloud. */
  toPushTombstone: string[];
}

/**
 * Reconcile two project lists by last-write-wins on `updatedAt`. Equal timestamps are treated as
 * already in sync (no-op) to avoid needless churn. Tombstones are ordinary items whose `deleted`
 * flag decides delete-vs-transfer once the winner is known.
 */
export function planSync(local: SyncItem[], cloud: SyncItem[]): SyncPlan {
  const plan: SyncPlan = { toPush: [], toPull: [], toDeleteLocal: [], toPushTombstone: [] };
  const l = new Map(local.map((x) => [x.id, x]));
  const c = new Map(cloud.map((x) => [x.id, x]));

  for (const id of new Set([...l.keys(), ...c.keys()])) {
    const a = l.get(id);
    const b = c.get(id);

    if (a && !b) {
      // Local only. Push it, unless it is a local tombstone that never reached the cloud (nothing to do).
      if (!a.deleted) plan.toPush.push(id);
      continue;
    }
    if (!a && b) {
      // Cloud only. Pull it, unless it is a cloud tombstone (nothing local to remove).
      if (!b.deleted) plan.toPull.push(id);
      continue;
    }
    if (a && b) {
      if (a.updatedAt > b.updatedAt) {
        if (a.deleted) plan.toPushTombstone.push(id);
        else plan.toPush.push(id);
      } else if (b.updatedAt > a.updatedAt) {
        if (b.deleted) plan.toDeleteLocal.push(id);
        else plan.toPull.push(id);
      }
      // equal → in sync, no-op
    }
  }

  // Deterministic ordering (stable output for tests + predictable transfer order).
  plan.toPush.sort();
  plan.toPull.sort();
  plan.toDeleteLocal.sort();
  plan.toPushTombstone.sort();
  return plan;
}
