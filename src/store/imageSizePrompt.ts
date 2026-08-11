import { create } from 'zustand';

// A non-modal prompt shown when a freshly-added image is much larger than the canvas: it offers to
// fit the image to the canvas or keep it at its imported size. Purely UI state — the Viewport renders
// <ImageSizePrompt/> from it; the editor sets it after adding an oversized image.
export interface ImageSizePromptData {
  layerId: string;
  /** True pixel dimensions of the imported file (may exceed the GPU-capped source size). */
  imageWidth: number;
  imageHeight: number;
  canvasWidth: number;
  canvasHeight: number;
}

interface ImageSizePromptState {
  prompt: ImageSizePromptData | null;
  show: (p: ImageSizePromptData) => void;
  dismiss: () => void;
}

export const useImageSizePromptStore = create<ImageSizePromptState>((set) => ({
  prompt: null,
  show: (prompt) => set({ prompt }),
  dismiss: () => set({ prompt: null }),
}));
