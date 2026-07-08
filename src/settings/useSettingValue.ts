import { useSettingsStore } from './store';
import { SETTINGS_TABS } from './tabs';

const DEFAULTS_CACHE: Record<string, unknown> = {};

function ensureDefaultsCache() {
  if (Object.keys(DEFAULTS_CACHE).length > 0) return;
  for (const tab of SETTINGS_TABS) {
    for (const section of tab.sections) {
      for (const control of section.controls) {
        DEFAULTS_CACHE[control.id] = control.defaultValue;
      }
    }
  }
}

export function useSettingValue<T>(key: string): T {
  ensureDefaultsCache();
  const value = useSettingsStore((s) => s.values[key]);
  return (value ?? DEFAULTS_CACHE[key]) as T;
}

export function useSettings<T extends Record<string, unknown>>(keys: string[]): T {
  ensureDefaultsCache();
  const values = useSettingsStore((s) => {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      result[key] = s.values[key] ?? DEFAULTS_CACHE[key];
    }
    return result;
  });
  return values as T;
}
