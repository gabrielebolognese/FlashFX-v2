import { create } from 'zustand';
import type { RenamePattern } from '../core/batchRename';

// M19 — Batch-rename modal state (mirrors the silenceStripper/captions modal pattern). Holds the
// draft pattern; the selection is read live from the editor store at commit time.

interface RenameModalState {
  isOpen: boolean;
  pattern: RenamePattern;
  open: () => void;
  close: () => void;
  setPattern: (p: Partial<RenamePattern>) => void;
}

const DEFAULT_PATTERN: RenamePattern = {
  template: '{name}',
  startNumber: 1,
  descending: false,
  find: '',
  replace: '',
  flags: 'g',
};

export const useRenameModalStore = create<RenameModalState>((set) => ({
  isOpen: false,
  pattern: { ...DEFAULT_PATTERN },
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  setPattern: (p) => set((s) => ({ pattern: { ...s.pattern, ...p } })),
}));
