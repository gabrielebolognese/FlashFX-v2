import { create } from 'zustand';

// Cutout + Shadow modal launcher. Holds the target image asset; the cutout (via Background Removal)
// + shadow state live in the modal (the cutout is extracted once per open).

interface CutoutShadowState {
  open: boolean;
  assetId: string | null;
  show: (assetId: string) => void;
  close: () => void;
}

export const useCutoutShadowStore = create<CutoutShadowState>((set) => ({
  open: false,
  assetId: null,
  show: (assetId) => set({ open: true, assetId }),
  close: () => set({ open: false, assetId: null }),
}));
