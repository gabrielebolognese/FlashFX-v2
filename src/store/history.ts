import { create } from 'zustand';

export interface Command {
  label: string;
  execute: () => void;
  undo: () => void;
}

interface HistoryState {
  undoStack: Command[];
  redoStack: Command[];
  maxHistory: number;
  isUndoing: boolean;
  isBatching: boolean;

  execute: (cmd: Command) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  setBatching: (v: boolean) => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  maxHistory: 500,
  isUndoing: false,
  isBatching: false,

  execute: (cmd) => {
    cmd.execute();
    if (get().isBatching) return;
    const { undoStack, maxHistory } = get();
    const newStack = [...undoStack, cmd];
    if (newStack.length > maxHistory) {
      newStack.shift();
    }
    set({ undoStack: newStack, redoStack: [] });
  },

  undo: () => {
    const { undoStack, redoStack } = get();
    if (undoStack.length === 0) return;
    const cmd = undoStack[undoStack.length - 1];
    set({ isUndoing: true });
    cmd.undo();
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, cmd],
      isUndoing: false,
    });
  },

  redo: () => {
    const { undoStack, redoStack } = get();
    if (redoStack.length === 0) return;
    const cmd = redoStack[redoStack.length - 1];
    set({ isUndoing: true });
    cmd.execute();
    set({
      undoStack: [...undoStack, cmd],
      redoStack: redoStack.slice(0, -1),
      isUndoing: false,
    });
  },

  clear: () => set({ undoStack: [], redoStack: [] }),
  setBatching: (v) => set({ isBatching: v }),
}));
