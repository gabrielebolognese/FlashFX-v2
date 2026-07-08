import { create } from 'zustand';

export type PanelId = 'layers' | 'canvas' | 'properties' | 'timeline';

export type EditorWorkspace = 'design' | 'edit' | 'animate' | 'review';

export type VideoFormat = 'long' | 'short';

const WORKSPACE_KEY = 'ffx-workspace';

function loadWorkspace(): EditorWorkspace {
  try {
    const v = localStorage.getItem(WORKSPACE_KEY);
    if (v === 'design' || v === 'edit' || v === 'animate' || v === 'review') return v;
  } catch { /* noop */ }
  return 'animate';
}

function saveWorkspace(w: EditorWorkspace) {
  try { localStorage.setItem(WORKSPACE_KEY, w); } catch { /* noop */ }
}

export interface PanelConfig {
  visible: boolean;
  collapsed: boolean;
  size: number;
  minSize: number;
  maxSize: number;
}

interface PanelStore {
  panels: Record<PanelId, PanelConfig>;
  editorWorkspace: EditorWorkspace;
  videoFormat: VideoFormat;
  setEditorWorkspace: (w: EditorWorkspace) => void;
  setVideoFormat: (f: VideoFormat) => void;
  setSize: (id: PanelId, size: number) => void;
  setVisible: (id: PanelId, visible: boolean) => void;
  toggleCollapsed: (id: PanelId) => void;
  toggleVisible: (id: PanelId) => void;
}

const DEFAULTS: Record<PanelId, PanelConfig> = {
  layers: { visible: true, collapsed: false, size: 200, minSize: 140, maxSize: 360 },
  canvas: { visible: true, collapsed: false, size: 0, minSize: 300, maxSize: Infinity },
  properties: { visible: true, collapsed: false, size: 240, minSize: 180, maxSize: 380 },
  timeline: { visible: true, collapsed: false, size: 220, minSize: 80, maxSize: 500 },
};

function load(): Record<PanelId, PanelConfig> {
  try {
    const raw = localStorage.getItem('ffx-panels');
    if (!raw) return { ...DEFAULTS };
    const saved = JSON.parse(raw);
    const result = { ...DEFAULTS };
    for (const k of Object.keys(result) as PanelId[]) {
      if (saved[k]) {
        result[k] = { ...result[k], visible: saved[k].visible ?? result[k].visible, collapsed: saved[k].collapsed ?? result[k].collapsed, size: saved[k].size ?? result[k].size };
      }
    }
    result.canvas.visible = true;
    return result;
  } catch { return { ...DEFAULTS }; }
}

function save(panels: Record<PanelId, PanelConfig>) {
  try {
    const data: Record<string, { visible: boolean; collapsed: boolean; size: number }> = {};
    for (const k of Object.keys(panels) as PanelId[]) {
      data[k] = { visible: panels[k].visible, collapsed: panels[k].collapsed, size: panels[k].size };
    }
    localStorage.setItem('ffx-panels', JSON.stringify(data));
  } catch { /* noop */ }
}

export const usePanelStore = create<PanelStore>((set) => ({
  panels: load(),
  editorWorkspace: loadWorkspace(),
  videoFormat: 'long',

  setEditorWorkspace: (w) => set(() => {
    saveWorkspace(w);
    return { editorWorkspace: w };
  }),

  setVideoFormat: (f) => set(() => ({ videoFormat: f })),

  setSize: (id, size) => set((s) => {
    const p = s.panels[id];
    const clamped = Math.max(p.minSize, Math.min(p.maxSize, size));
    const next = { ...s.panels, [id]: { ...p, size: clamped } };
    save(next);
    return { panels: next };
  }),

  setVisible: (id, visible) => set((s) => {
    if (id === 'canvas') return s;
    const next = { ...s.panels, [id]: { ...s.panels[id], visible } };
    save(next);
    return { panels: next };
  }),

  toggleCollapsed: (id) => set((s) => {
    const p = s.panels[id];
    const next = { ...s.panels, [id]: { ...p, collapsed: !p.collapsed } };
    save(next);
    return { panels: next };
  }),

  toggleVisible: (id) => set((s) => {
    if (id === 'canvas') return s;
    const p = s.panels[id];
    const next = { ...s.panels, [id]: { ...p, visible: !p.visible } };
    save(next);
    return { panels: next };
  }),
}));
