import { create } from 'zustand';

export interface Guideline {
  id: string;
  axis: 'vertical' | 'horizontal';
  position: number;
  visible: boolean;
  locked: boolean;
  color?: string;
}

export interface GridSettings {
  visible: boolean;
  columns: number;
  rows: number;
  color: string;
  opacity: number;
  subdivisions: number;
}

export interface GuidelineSettings {
  visible: boolean;
  guidelines: Guideline[];
}

interface GridStore {
  grid: GridSettings;
  guides: GuidelineSettings;

  setGridVisible: (visible: boolean) => void;
  setGridColumns: (columns: number) => void;
  setGridRows: (rows: number) => void;
  setGridColor: (color: string) => void;
  setGridOpacity: (opacity: number) => void;
  setGridSubdivisions: (subdivisions: number) => void;

  setGuidesVisible: (visible: boolean) => void;
  addGuideline: (axis: 'vertical' | 'horizontal', position: number) => void;
  removeGuideline: (id: string) => void;
  updateGuideline: (id: string, updates: Partial<Guideline>) => void;
  moveGuideline: (id: string, position: number) => void;
  toggleGuidelineVisibility: (id: string) => void;
  toggleGuidelineLocked: (id: string) => void;
  clearGuidelines: () => void;
}

let guideCtr = 0;
function guideId(): string {
  return `guide_${Date.now()}_${++guideCtr}`;
}

const STORAGE_KEY = 'ffx-grid';

function loadGridState(): { grid: GridSettings; guides: GuidelineSettings } {
  const defaults = {
    grid: {
      visible: false,
      columns: 12,
      rows: 12,
      color: '#38bdf8',
      opacity: 0.15,
      subdivisions: 1,
    },
    guides: {
      visible: true,
      guidelines: [],
    },
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      grid: { ...defaults.grid, ...parsed.grid },
      guides: { ...defaults.guides, ...parsed.guides },
    };
  } catch {
    return defaults;
  }
}

function saveGridState(grid: GridSettings, guides: GuidelineSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ grid, guides }));
  } catch {}
}

export const useGridStore = create<GridStore>((set) => {
  const initial = loadGridState();
  return {
    grid: initial.grid,
    guides: initial.guides,

    setGridVisible: (visible) => set((s) => {
      const grid = { ...s.grid, visible };
      saveGridState(grid, s.guides);
      return { grid };
    }),

    setGridColumns: (columns) => set((s) => {
      const grid = { ...s.grid, columns: Math.max(1, Math.min(100, columns)) };
      saveGridState(grid, s.guides);
      return { grid };
    }),

    setGridRows: (rows) => set((s) => {
      const grid = { ...s.grid, rows: Math.max(1, Math.min(100, rows)) };
      saveGridState(grid, s.guides);
      return { grid };
    }),

    setGridColor: (color) => set((s) => {
      const grid = { ...s.grid, color };
      saveGridState(grid, s.guides);
      return { grid };
    }),

    setGridOpacity: (opacity) => set((s) => {
      const grid = { ...s.grid, opacity: Math.max(0.02, Math.min(1, opacity)) };
      saveGridState(grid, s.guides);
      return { grid };
    }),

    setGridSubdivisions: (subdivisions) => set((s) => {
      const grid = { ...s.grid, subdivisions: Math.max(1, Math.min(10, subdivisions)) };
      saveGridState(grid, s.guides);
      return { grid };
    }),

    setGuidesVisible: (visible) => set((s) => {
      const guides = { ...s.guides, visible };
      saveGridState(s.grid, guides);
      return { guides };
    }),

    addGuideline: (axis, position) => set((s) => {
      const newGuide: Guideline = { id: guideId(), axis, position, visible: true, locked: false };
      const guides = { ...s.guides, guidelines: [...s.guides.guidelines, newGuide] };
      saveGridState(s.grid, guides);
      return { guides };
    }),

    removeGuideline: (id) => set((s) => {
      const guides = { ...s.guides, guidelines: s.guides.guidelines.filter((g) => g.id !== id) };
      saveGridState(s.grid, guides);
      return { guides };
    }),

    updateGuideline: (id, updates) => set((s) => {
      const guides = {
        ...s.guides,
        guidelines: s.guides.guidelines.map((g) => g.id === id ? { ...g, ...updates } : g),
      };
      saveGridState(s.grid, guides);
      return { guides };
    }),

    moveGuideline: (id, position) => set((s) => {
      const guides = {
        ...s.guides,
        guidelines: s.guides.guidelines.map((g) => g.id === id ? { ...g, position } : g),
      };
      saveGridState(s.grid, guides);
      return { guides };
    }),

    toggleGuidelineVisibility: (id) => set((s) => {
      const guides = {
        ...s.guides,
        guidelines: s.guides.guidelines.map((g) => g.id === id ? { ...g, visible: !g.visible } : g),
      };
      saveGridState(s.grid, guides);
      return { guides };
    }),

    toggleGuidelineLocked: (id) => set((s) => {
      const guides = {
        ...s.guides,
        guidelines: s.guides.guidelines.map((g) => g.id === id ? { ...g, locked: !g.locked } : g),
      };
      saveGridState(s.grid, guides);
      return { guides };
    }),

    clearGuidelines: () => set((s) => {
      const guides = { ...s.guides, guidelines: [] };
      saveGridState(s.grid, guides);
      return { guides };
    }),
  };
});

export function generateGridLines(
  canvasWidth: number,
  canvasHeight: number,
  columns: number,
  rows: number,
  subdivisions: number = 1
): { vertical: number[]; horizontal: number[] } {
  const vertical: number[] = [];
  const horizontal: number[] = [];

  const totalCols = columns * subdivisions;
  const totalRows = rows * subdivisions;

  const colWidth = canvasWidth / totalCols;
  const rowHeight = canvasHeight / totalRows;

  for (let i = 0; i <= totalCols; i++) {
    vertical.push(i * colWidth);
  }
  for (let i = 0; i <= totalRows; i++) {
    horizontal.push(i * rowHeight);
  }

  return { vertical, horizontal };
}
