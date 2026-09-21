import { create } from 'zustand';

// Retouch modal launcher. Holds the target image asset; the denoise / skin-smooth / detail / radius /
// faces-only state lives in the modal.

interface RetouchState {
  open: boolean;
  assetId: string | null;
  show: (assetId: string) => void;
  close: () => void;
}

export const useRetouchStore = create<RetouchState>((set) => ({
  open: false,
  assetId: null,
  show: (assetId) => set({ open: true, assetId }),
  close: () => set({ open: false, assetId: null }),
}));
