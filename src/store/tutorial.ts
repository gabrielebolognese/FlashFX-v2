import { create } from 'zustand';

// Which panel tutorial is currently open (by id), plus open/close. A single non-modal Tutorial panel
// reads this and renders the matching TutorialDef. Kept tiny and global so any panel's "Tutorial: How
// to use X" button can open it without prop-drilling.
interface TutorialState {
  openId: string | null;
  open: (id: string) => void;
  close: () => void;
}

export const useTutorialStore = create<TutorialState>((set) => ({
  openId: null,
  open: (id) => set({ openId: id }),
  close: () => set({ openId: null }),
}));
