import { create } from 'zustand';
import type { PathVertex } from '../core/types';

interface MaskState {
  selectedMaskId: string | null;
  hoveredMaskId: string | null;
  /** Selected vertex of the selected path mask (B10d-mask): Delete removes it, the Inspector edits its
   *  feather. Reset whenever the selected mask changes. */
  selectedVertex: number | null;
  /** Layer the mask pen is drawing a new path mask on (null = not drawing). */
  penLayerId: string | null;
  /** The in-progress pen outline: composition space, handles relative to their anchors. */
  penDraft: PathVertex[];
  setSelectedMaskId: (id: string | null) => void;
  setHoveredMaskId: (id: string | null) => void;
  setSelectedVertex: (index: number | null) => void;
  startMaskPen: (layerId: string) => void;
  setPenDraft: (draft: PathVertex[]) => void;
  stopMaskPen: () => void;
}

export const useMaskStore = create<MaskState>((set) => ({
  selectedMaskId: null,
  hoveredMaskId: null,
  selectedVertex: null,
  penLayerId: null,
  penDraft: [],
  setSelectedMaskId: (id) => set({ selectedMaskId: id, selectedVertex: null }),
  setHoveredMaskId: (id) => set({ hoveredMaskId: id }),
  setSelectedVertex: (index) => set({ selectedVertex: index }),
  startMaskPen: (layerId) => set({ penLayerId: layerId, penDraft: [], selectedVertex: null }),
  setPenDraft: (draft) => set({ penDraft: draft }),
  stopMaskPen: () => set({ penLayerId: null, penDraft: [] }),
}));
