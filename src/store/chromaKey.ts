import { create } from 'zustand';

// Chroma Key modal launcher. Holds the target image asset; the key colour + tolerance/softness/
// despill/choke/feather state live in the modal.

interface ChromaKeyState {
  open: boolean;
  assetId: string | null;
  show: (assetId: string) => void;
  close: () => void;
}

export const useChromaKeyStore = create<ChromaKeyState>((set) => ({
  open: false,
  assetId: null,
  show: (assetId) => set({ open: true, assetId }),
  close: () => set({ open: false, assetId: null }),
}));
