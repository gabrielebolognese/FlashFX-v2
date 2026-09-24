import { create } from 'zustand';
import { currentPlan, type ProFeature } from './plans';

// Global opener for the Pro UpgradeModal. The modal is mounted once at the app root (UpgradeModalHost);
// any gated action calls requirePro('ai'|'expressions'|'3d'|'premium-pack') - if the user isn't Pro it
// pops the upgrade modal (with copy tailored to the feature) and returns false so the caller bails.

interface UpgradePromptState {
  open: boolean;
  feature: ProFeature | null;
  show: (feature?: ProFeature) => void;
  close: () => void;
}

export const useUpgradePrompt = create<UpgradePromptState>((set) => ({
  open: false,
  feature: null,
  show: (feature) => set({ open: true, feature: feature ?? null }),
  close: () => set({ open: false, feature: null }),
}));

/** Gate a Pro-only action: returns true if allowed, otherwise opens the upgrade prompt and returns
 *  false. Use as `if (!requirePro('ai')) return;` at a user-initiated UI action. */
export function requirePro(feature?: ProFeature): boolean {
  if (currentPlan() === 'pro') return true;
  useUpgradePrompt.getState().show(feature);
  return false;
}
