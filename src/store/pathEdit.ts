import { create } from 'zustand';

export type HandleSide = 'in' | 'out';

export interface SelectedHandle {
  vertexIndex: number;
  side: HandleSide;
}

interface PathEditState {
  // The layer currently being point-edited (Direct Selection). Null when none.
  editingLayerId: string | null;
  selectedVertices: number[];
  selectedHandle: SelectedHandle | null;
  hoveredVertex: number | null;

  setEditingLayer: (layerId: string | null) => void;
  selectVertices: (indices: number[]) => void;
  toggleVertex: (index: number) => void;
  selectHandle: (handle: SelectedHandle | null) => void;
  setHoveredVertex: (index: number | null) => void;
  clearSelection: () => void;
}

export const usePathEditStore = create<PathEditState>((set, get) => ({
  editingLayerId: null,
  selectedVertices: [],
  selectedHandle: null,
  hoveredVertex: null,

  setEditingLayer: (layerId) => {
    if (get().editingLayerId === layerId) return;
    set({ editingLayerId: layerId, selectedVertices: [], selectedHandle: null, hoveredVertex: null });
  },
  selectVertices: (indices) => set({ selectedVertices: indices, selectedHandle: null }),
  toggleVertex: (index) => {
    const cur = get().selectedVertices;
    const next = cur.includes(index) ? cur.filter((i) => i !== index) : [...cur, index];
    set({ selectedVertices: next, selectedHandle: null });
  },
  selectHandle: (handle) => set({ selectedHandle: handle }),
  setHoveredVertex: (index) => set({ hoveredVertex: index }),
  clearSelection: () => set({ selectedVertices: [], selectedHandle: null, hoveredVertex: null }),
}));
