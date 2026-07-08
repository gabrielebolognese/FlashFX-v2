import { create } from 'zustand';

interface MaskState {
  selectedMaskId: string | null;
  hoveredMaskId: string | null;
  setSelectedMaskId: (id: string | null) => void;
  setHoveredMaskId: (id: string | null) => void;
}

export const useMaskStore = create<MaskState>((set) => ({
  selectedMaskId: null,
  hoveredMaskId: null,
  setSelectedMaskId: (id) => set({ selectedMaskId: id }),
  setHoveredMaskId: (id) => set({ hoveredMaskId: id }),
}));
