import { create } from 'zustand';
import type { SettingsValues } from './types';
import { SETTINGS_TABS } from './tabs';

const STORAGE_KEY = 'ffx-settings';

function loadValues(): SettingsValues {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  return {};
}

function saveValues(values: SettingsValues) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(values)); } catch { /* noop */ }
}

interface SettingsState {
  open: boolean;
  activeTab: string;
  values: SettingsValues;
  showResetConfirm: boolean;
  openSettings: (tab?: string) => void;
  closeSettings: () => void;
  setActiveTab: (tab: string) => void;
  setValue: (key: string, value: unknown) => void;
  saveNow: () => void;
  resetToDefaults: () => void;
  confirmReset: () => void;
  cancelReset: () => void;
}

export function getSettingValue<T = unknown>(key: string): T | undefined {
  return useSettingsStore.getState().values[key] as T | undefined;
}

export function getSettingDefaults(): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const tab of SETTINGS_TABS) {
    for (const section of tab.sections) {
      for (const control of section.controls) {
        defaults[control.id] = control.defaultValue;
      }
    }
  }
  return defaults;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  open: false,
  activeTab: 'general',
  values: loadValues(),
  showResetConfirm: false,
  openSettings: (tab) =>
    set((s) => ({ open: true, activeTab: tab ?? s.activeTab })),
  closeSettings: () => set({ open: false }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setValue: (key, value) =>
    set((s) => {
      const next = { ...s.values, [key]: value };
      saveValues(next);
      return { values: next };
    }),
  saveNow: () => {
    saveValues(get().values);
  },
  resetToDefaults: () => set({ showResetConfirm: true }),
  confirmReset: () => {
    saveValues({});
    set({ values: {}, showResetConfirm: false });
  },
  cancelReset: () => set({ showResetConfirm: false }),
}));
