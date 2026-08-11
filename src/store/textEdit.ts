import { create } from 'zustand';

/**
 * On-canvas text editing state. When `editingLayerId` is set, the `TextEditOverlay`
 * shows a live textarea over that text layer and the renderer hides the layer's own
 * text (so the two don't double up). `justCreated` marks a text that was made by the
 * text tool this session — if it's committed still empty, the layer is discarded
 * (Figma-style: dragging out a text box and typing nothing leaves no layer behind).
 */
interface TextEditState {
  editingLayerId: string | null;
  justCreated: boolean;
  startEditing: (layerId: string, justCreated?: boolean) => void;
  stopEditing: () => void;
}

export const useTextEditStore = create<TextEditState>((set) => ({
  editingLayerId: null,
  justCreated: false,
  startEditing: (layerId, justCreated = false) => set({ editingLayerId: layerId, justCreated }),
  stopEditing: () => set({ editingLayerId: null, justCreated: false }),
}));
