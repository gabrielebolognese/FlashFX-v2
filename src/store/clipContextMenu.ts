import { create } from 'zustand';

interface ClipContextMenuState {
  open: boolean;
  x: number;
  y: number;
  layerId: string | null;
  show: (x: number, y: number, layerId: string) => void;
  hide: () => void;
}

export const useClipContextMenu = create<ClipContextMenuState>((set) => ({
  open: false,
  x: 0,
  y: 0,
  layerId: null,
  show: (x, y, layerId) => set({ open: true, x, y, layerId }),
  hide: () => set({ open: false, layerId: null }),
}));
