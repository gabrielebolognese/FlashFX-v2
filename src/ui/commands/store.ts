import { create } from 'zustand';

// Open state + most-recently-used command ids for the Ctrl/Cmd+K palette. Recents
// persist in localStorage so the palette opens with your last actions on an empty
// query (the standard palette behavior).

const RECENTS_KEY = 'ffx.commandPalette.recents';
const MAX_RECENTS = 6;

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

interface CommandPaletteState {
  open: boolean;
  recents: string[]; // command ids, most-recent first
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  recordUse: (id: string) => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set, get) => ({
  open: false,
  recents: loadRecents(),
  openPalette: () => set({ open: true }),
  closePalette: () => set({ open: false }),
  togglePalette: () => set((s) => ({ open: !s.open })),
  recordUse: (id) => {
    const next = [id, ...get().recents.filter((r) => r !== id)].slice(0, MAX_RECENTS);
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    set({ recents: next });
  },
}));
