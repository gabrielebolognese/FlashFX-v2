import { create } from 'zustand';

// Smart Crop modal launcher. Mirrors useAiImageStore: a tiny flag holding which media-pool asset the
// tool is operating on. All analysis + framing state lives in the modal (analysis runs once per open).

interface SmartCropState {
  open: boolean;
  assetId: string | null;
  show: (assetId: string) => void;
  close: () => void;
}

export const useSmartCropStore = create<SmartCropState>((set) => ({
  open: false,
  assetId: null,
  show: (assetId) => set({ open: true, assetId }),
  close: () => set({ open: false, assetId: null }),
}));
