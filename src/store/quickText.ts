import { create } from 'zustand';

/** Anchored, non-modal "fast text" panel: opened by Shift-placing with the text tool. Holds the
 *  freshly-created layer id and where to float the panel (screen coords). */
interface QuickTextTarget {
  layerId: string;
  x: number;
  y: number;
}

interface QuickTextState {
  target: QuickTextTarget | null;
  open: (layerId: string, x: number, y: number) => void;
  close: () => void;
}

export const useQuickTextStore = create<QuickTextState>((set) => ({
  target: null,
  open: (layerId, x, y) => set({ target: { layerId, x, y } }),
  close: () => set({ target: null }),
}));
