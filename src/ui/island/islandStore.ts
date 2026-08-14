import { create } from 'zustand';

/**
 * The Dynamic Island: the single top-center hub for transient progress + toasts
 * + errors. UI-only store (setTimeout is fine here — this never touches the
 * frame-pure engine). See docs/PREMIUM-UI-SYSTEM.md.
 */
export type IslandTone = 'accent' | 'success' | 'danger' | 'info';
export type IslandIcon = 'check' | 'alert' | 'loader' | 'download' | null;
export type IslandMode = 'idle' | 'progress' | 'toast' | 'error';

interface IslandState {
  mode: IslandMode;
  message: string;
  tone: IslandTone;
  /** 0..1 for a determinate ring, or null for indeterminate. */
  progress: number | null;
  icon: IslandIcon;
  /** Optional cancel handler shown as an X while in progress mode. */
  onCancel: (() => void) | null;
  /** Show a running task. Persists until setProgress completes or dismiss(). */
  showProgress: (message: string, progress?: number | null, icon?: IslandIcon, onCancel?: (() => void) | null) => void;
  /** Update a running task's value/label without restarting the entrance. */
  setProgress: (progress: number | null, message?: string) => void;
  /** Transient success/info toast that auto-collapses. */
  toast: (message: string, opts?: { tone?: IslandTone; icon?: IslandIcon; durationMs?: number }) => void;
  /** Sticky error until dismissed. */
  error: (message: string) => void;
  /** Collapse back to idle (absent). */
  dismiss: () => void;
}

let hideTimer: ReturnType<typeof setTimeout> | null = null;
function clearTimer() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
}

export const useIslandStore = create<IslandState>((set) => ({
  mode: 'idle',
  message: '',
  tone: 'accent',
  progress: null,
  icon: null,
  onCancel: null,
  showProgress: (message, progress = null, icon = 'loader', onCancel = null) => {
    clearTimer();
    set({ mode: 'progress', message, progress, icon, tone: 'accent', onCancel });
  },
  setProgress: (progress, message) =>
    set((s) => (s.mode === 'progress' ? { progress, message: message ?? s.message } : {})),
  toast: (message, opts = {}) => {
    clearTimer();
    set({ mode: 'toast', message, tone: opts.tone ?? 'success', icon: opts.icon ?? 'check', progress: null, onCancel: null });
    hideTimer = setTimeout(() => set({ mode: 'idle' }), opts.durationMs ?? 2600);
  },
  error: (message) => {
    clearTimer();
    set({ mode: 'error', message, tone: 'danger', icon: 'alert', progress: null, onCancel: null });
  },
  dismiss: () => { clearTimer(); set({ mode: 'idle', onCancel: null }); },
}));
