import { create } from 'zustand';

export type PanelId = 'layers' | 'canvas' | 'properties' | 'timeline';

export type EditorWorkspace = 'design' | 'edit' | 'animate' | 'review';

export type VideoFormat = 'long' | 'short';

/** Overall UI density. 'starter' = a minimal canvas + inspector view for newcomers (the default);
 *  'pro' = the full editor (media pool, timeline, tools). */
export type UiMode = 'starter' | 'pro';

const WORKSPACE_KEY = 'ffx-workspace';
const UI_MODE_KEY = 'ffx-ui-mode';

function loadUiMode(): UiMode {
  try {
    const v = localStorage.getItem(UI_MODE_KEY);
    if (v === 'starter' || v === 'pro') return v;
  } catch { /* noop */ }
  return 'starter';
}

function saveUiMode(m: UiMode) {
  try { localStorage.setItem(UI_MODE_KEY, m); } catch { /* noop */ }
}

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
  /** Minimal 'starter' view vs the full 'pro' editor. Default 'starter'. */
  uiMode: UiMode;
  /** VS Code-style AI chat side panel; when open it takes the right 20% and compresses the layout. */
  aiChatOpen: boolean;
  /** Tasks side panel: a live log of background work (model downloads, caption generation, …). */
  tasksOpen: boolean;
  setEditorWorkspace: (w: EditorWorkspace) => void;
  setVideoFormat: (f: VideoFormat) => void;
  setUiMode: (m: UiMode) => void;
  toggleUiMode: () => void;
  toggleAiChat: () => void;
  toggleTasks: () => void;
  openTasks: () => void;
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
  uiMode: loadUiMode(),
  aiChatOpen: false,
  tasksOpen: false,

  setEditorWorkspace: (w) => set(() => {
    saveWorkspace(w);
    return { editorWorkspace: w };
  }),

  setVideoFormat: (f) => set(() => ({ videoFormat: f })),
  setUiMode: (m) => set(() => { saveUiMode(m); return { uiMode: m }; }),
  toggleUiMode: () => set((s) => { const m: UiMode = s.uiMode === 'starter' ? 'pro' : 'starter'; saveUiMode(m); return { uiMode: m }; }),
  toggleAiChat: () => set((s) => ({ aiChatOpen: !s.aiChatOpen })),
  toggleTasks: () => set((s) => ({ tasksOpen: !s.tasksOpen })),
  openTasks: () => set({ tasksOpen: true }),

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
