import { create } from 'zustand';

// Audio React modal launcher. Holds the TARGET layer (the one to animate); the audio source, driven
// property, and mapping live in the modal.

interface AudioReactState {
  open: boolean;
  layerId: string | null;
  show: (layerId: string) => void;
  close: () => void;
}

export const useAudioReactStore = create<AudioReactState>((set) => ({
  open: false,
  layerId: null,
  show: (layerId) => set({ open: true, layerId }),
  close: () => set({ open: false, layerId: null }),
}));
