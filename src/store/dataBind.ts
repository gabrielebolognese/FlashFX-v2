import { create } from 'zustand';

// B31-data - the Data Bind modal's open state. Minimal by design (mirrors store/audioReact.ts): it holds
// only which clip was right-clicked; the source text / column / mapping live in the modal's local state.

interface DataBindState {
  open: boolean;
  layerId: string | null;
  show: (layerId: string) => void;
  close: () => void;
}

export const useDataBindStore = create<DataBindState>((set) => ({
  open: false,
  layerId: null,
  show: (layerId) => set({ open: true, layerId }),
  close: () => set({ open: false, layerId: null }),
}));
