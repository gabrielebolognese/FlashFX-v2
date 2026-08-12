import { create } from 'zustand';

// A chronological log of background work (model downloads, caption generation, and future long
// operations). Producers push a line and, for anything with progress, update it in place. The Tasks
// side panel renders this; the small floating indicators can open the panel to reveal the detail.

export type TaskStatus = 'running' | 'done' | 'error' | 'info';

export interface TaskLogItem {
  id: string;
  title: string;
  detail?: string;
  /** 0..100 for a live progress bar, or null/undefined for no bar. */
  progress?: number | null;
  status: TaskStatus;
  time: number;
}

interface TasksState {
  items: TaskLogItem[];
  /** Append a log item; returns its id so producers can update it in place. */
  push: (item: { title: string; detail?: string; progress?: number | null; status?: TaskStatus }) => string;
  update: (id: string, partial: Partial<Omit<TaskLogItem, 'id' | 'time'>>) => void;
  clear: () => void;
}

let counter = 0;
const MAX_ITEMS = 200; // keep the log bounded

export const useTasksStore = create<TasksState>((set) => ({
  items: [],
  push: (item) => {
    const id = `t${++counter}_${Math.random().toString(36).slice(2, 7)}`;
    const entry: TaskLogItem = {
      id,
      title: item.title,
      detail: item.detail,
      progress: item.progress ?? null,
      status: item.status ?? 'info',
      time: Date.now(),
    };
    set((s) => ({ items: [...s.items, entry].slice(-MAX_ITEMS) }));
    return id;
  },
  update: (id, partial) => set((s) => ({
    items: s.items.map((it) => (it.id === id ? { ...it, ...partial } : it)),
  })),
  clear: () => set({ items: [] }),
}));
