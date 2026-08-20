import { create } from 'zustand';

export type LegalDoc = 'privacy' | 'terms';

interface LegalState {
  doc: LegalDoc | null;
  open: (doc: LegalDoc) => void;
  close: () => void;
}

export const useLegalStore = create<LegalState>((set) => ({
  doc: null,
  open: (doc) => set({ doc }),
  close: () => set({ doc: null }),
}));
