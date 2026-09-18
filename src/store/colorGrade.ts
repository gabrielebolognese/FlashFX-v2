import { create } from 'zustand';

// Color Grade modal launcher. Holds the target image asset; the preset / LUT / intensity state lives
// in the modal.

interface ColorGradeState {
  open: boolean;
  assetId: string | null;
  show: (assetId: string) => void;
  close: () => void;
}

export const useColorGradeStore = create<ColorGradeState>((set) => ({
  open: false,
  assetId: null,
  show: (assetId) => set({ open: true, assetId }),
  close: () => set({ open: false, assetId: null }),
}));
