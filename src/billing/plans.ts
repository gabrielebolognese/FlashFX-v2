import { create } from 'zustand';

// Account plans + quota limits. Pure, dependency-free numbers so they're trivial to tune and to unit
// test (see scripts/verify-plans.mjs). Enforcement lives in the cloud-sync layer; billing (later)
// flips an account's plan. Until billing exists, everyone is 'free'.
//
// COST NOTE: `free.cloudMediaBytes` is PER ACCOUNT. On Supabase's 1 GB Free tier a couple of free
// users with media fill the whole backend — this assumes you're on Supabase Pro before free media
// sync sees traffic, and `FREE_MEDIA_SYNC_ENABLED` is the kill-switch to shut it off if cost spikes.

export type Plan = 'free' | 'pro';

const MB = 1024 * 1024;
const GB = 1024 * MB;

export interface PlanLimits {
  /** Max cloud-backed projects (scene JSON). Infinity = unlimited. */
  cloudProjects: number;
  /** Max TOTAL cloud media bytes (Storage) for the account. */
  cloudMediaBytes: number;
  /** Max size of a single asset uploaded to the cloud. */
  maxAssetBytes: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { cloudProjects: Infinity, cloudMediaBytes: 500 * MB, maxAssetBytes: 200 * MB },
  pro: { cloudProjects: Infinity, cloudMediaBytes: 20 * GB, maxAssetBytes: 1 * GB },
};

// Global kill-switch: set false to disable ALL free-tier media upload (scene sync still works),
// e.g. if Storage/egress cost spikes. Pro is unaffected.
export const FREE_MEDIA_SYNC_ENABLED = true;

export function planLimits(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan];
}

/** Whether this plan may upload media to the cloud at all (respects the free kill-switch). */
export function mediaSyncAllowed(plan: Plan): boolean {
  return plan === 'pro' || (plan === 'free' && FREE_MEDIA_SYNC_ENABLED && PLAN_LIMITS.free.cloudMediaBytes > 0);
}

/** Can `addBytes` more media be stored given `usedBytes` already used? Pure. */
export function fitsMediaQuota(usedBytes: number, addBytes: number, plan: Plan): boolean {
  return usedBytes + addBytes <= PLAN_LIMITS[plan].cloudMediaBytes;
}

/** Is a single asset within the per-asset size cap? Pure. */
export function assetWithinLimit(sizeBytes: number, plan: Plan): boolean {
  return sizeBytes <= PLAN_LIMITS[plan].maxAssetBytes;
}

// ── current plan (billing will drive this later; 'free' for now) ──
interface PlanState {
  plan: Plan;
  setPlan: (p: Plan) => void;
}
export const usePlanStore = create<PlanState>((set) => ({
  plan: 'free',
  setPlan: (plan) => set({ plan }),
}));

export function currentPlan(): Plan {
  return usePlanStore.getState().plan;
}
