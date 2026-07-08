import { create } from 'zustand';

export type RecoveryEventType =
  | 'device_lost'
  | 'render_error'
  | 'memory_pressure'
  | 'auto_trim'
  | 'auto_recovery'
  | 'reset_editor'
  | 'init_failed'
  | 'init_recovered';

export type RecoverySeverity = 'info' | 'warning' | 'error';

export interface RecoveryEvent {
  id: string;
  type: RecoveryEventType;
  severity: RecoverySeverity;
  message: string;
  at: number;
}

export type RecoveryStatus = 'healthy' | 'recovering' | 'failed';

export interface RecoveryStats {
  totalTextures: number;
  decoders: number;
  cachedFrames: number;
  jsHeapMB: number | null;
}

const MAX_LOG = 100;

interface RecoveryState {
  status: RecoveryStatus;
  initFailed: boolean;
  showResetDialog: boolean;
  rendererEpoch: number;
  lastError: string | null;
  stats: RecoveryStats;
  events: RecoveryEvent[];

  setStatus: (status: RecoveryStatus) => void;
  setInitFailed: (failed: boolean) => void;
  openResetDialog: () => void;
  closeResetDialog: () => void;
  bumpRendererEpoch: () => void;
  setStats: (stats: RecoveryStats) => void;
  setLastError: (msg: string | null) => void;
  pushEvent: (event: RecoveryEvent) => void;
}

export const useRecoveryStore = create<RecoveryState>((set) => ({
  status: 'healthy',
  initFailed: false,
  showResetDialog: false,
  rendererEpoch: 0,
  lastError: null,
  stats: { totalTextures: 0, decoders: 0, cachedFrames: 0, jsHeapMB: null },
  events: [],

  setStatus: (status) => set({ status }),
  setInitFailed: (initFailed) => set({ initFailed }),
  openResetDialog: () => set({ showResetDialog: true }),
  closeResetDialog: () => set({ showResetDialog: false }),
  bumpRendererEpoch: () => set((s) => ({ rendererEpoch: s.rendererEpoch + 1 })),
  setStats: (stats) => set({ stats }),
  setLastError: (lastError) => set({ lastError }),
  pushEvent: (event) =>
    set((s) => ({ events: [event, ...s.events].slice(0, MAX_LOG) })),
}));
