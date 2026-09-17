import { create } from 'zustand';
import type { LayerEffect } from '../core/types';
import { cloneEffectStack, sanitizeEffectStack } from '../core/effects/effectStack';
import { uid } from '../core/factory';

// App-global effect presets (B11a): a named, saved effect stack the user can apply to any layer.
// Persisted to localStorage so they're reusable across projects (AE-style effect presets). The stored
// stacks are sanitized on load so a corrupt/tampered entry can never crash the editor.

export interface EffectPreset {
  id: string;
  name: string;
  effects: LayerEffect[];
}

const STORAGE_KEY = 'ffx-effect-presets';

function load(): EffectPreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && typeof p.name === 'string')
      .map((p) => ({
        id: typeof p.id === 'string' ? p.id : uid(),
        name: p.name as string,
        effects: sanitizeEffectStack(p.effects),
      }))
      .filter((p) => p.effects.length > 0);
  } catch {
    return [];
  }
}

function persist(presets: EffectPreset[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(presets)); } catch { /* storage unavailable */ }
}

interface EffectPresetState {
  presets: EffectPreset[];
  /** Save an effect stack (deep-cloned) under a name; returns the new preset id (or '' if empty). */
  savePreset: (name: string, effects: LayerEffect[]) => string;
  deletePreset: (id: string) => void;
  renamePreset: (id: string, name: string) => void;
}

export const useEffectPresetStore = create<EffectPresetState>((set, get) => ({
  presets: load(),
  savePreset: (name, effects) => {
    const clean = cloneEffectStack(effects);
    if (clean.length === 0) return '';
    const preset: EffectPreset = { id: uid(), name: name.trim() || `Preset ${get().presets.length + 1}`, effects: clean };
    const presets = [...get().presets, preset];
    persist(presets);
    set({ presets });
    return preset.id;
  },
  deletePreset: (id) => {
    const presets = get().presets.filter((p) => p.id !== id);
    persist(presets);
    set({ presets });
  },
  renamePreset: (id, name) => {
    const presets = get().presets.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p));
    persist(presets);
    set({ presets });
  },
}));
