import { create } from 'zustand';

// Color Match modal launcher. Holds the TARGET asset the tool operates on. Reference selection +
// analysis + transform state live in the modal (analyses are cached there, per the design brief).

interface ColorMatchState {
  open: boolean;
  targetId: string | null;
  show: (targetId: string) => void;
  close: () => void;
}

export const useColorMatchStore = create<ColorMatchState>((set) => ({
  open: false,
  targetId: null,
  show: (targetId) => set({ open: true, targetId }),
  close: () => set({ open: false, targetId: null }),
}));
