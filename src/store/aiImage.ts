import { create } from 'zustand';

// Which in-browser AI image operation the modal should run.
export type AiImageOp = 'remove-bg' | 'upscale';

interface AiImageState {
  assetId: string | null;
  operation: AiImageOp;
  open: (assetId: string, operation: AiImageOp) => void;
  close: () => void;
}

// Drives the shared AiImageModal (opened from the media-asset context menu).
export const useAiImageStore = create<AiImageState>((set) => ({
  assetId: null,
  operation: 'remove-bg',
  open: (assetId, operation) => set({ assetId, operation }),
  close: () => set({ assetId: null }),
}));
