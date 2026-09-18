import { create } from 'zustand';

// Face Blur modal launcher. Mirrors useSmartCropStore: a flag holding which media-pool asset the tool
// operates on. Detection + selection + treatment state lives in the modal (detection runs once).

interface FaceBlurState {
  open: boolean;
  assetId: string | null;
  show: (assetId: string) => void;
  close: () => void;
}

export const useFaceBlurStore = create<FaceBlurState>((set) => ({
  open: false,
  assetId: null,
  show: (assetId) => set({ open: true, assetId }),
  close: () => set({ open: false, assetId: null }),
}));
