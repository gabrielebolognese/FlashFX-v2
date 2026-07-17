// Part of the editor settings panel — see OthersSettings for the complete tab list.
// Persists: default starting tab, default background config, default sequence settings.

import { LayoutMode } from '../hooks/useLayoutMode';
import { BackgroundConfig, createDefaultBackground } from '../types/background';

export interface SequenceDefaults {
  enabled: boolean;
  autoCreate: boolean;
  duration: number;
  frameRate: number;
  backgroundColor: string;
}

export interface OthersSettings {
  startingTab: LayoutMode;
  background: {
    enabled: boolean;
    config: BackgroundConfig;
  };
  sequence: SequenceDefaults;
}

const FACTORY_DEFAULTS: OthersSettings = {
  startingTab: 'design',
  background: {
    enabled: false,
    config: createDefaultBackground(),
  },
  sequence: {
    enabled: false,
    autoCreate: true,
    duration: 5,
    frameRate: 30,
    backgroundColor: '#000000',
  },
};

const STORAGE_KEY = 'flashfx_others_settings';

class OthersSettingsService {
  private settings: OthersSettings;

  constructor() {
    this.settings = this.load();
  }

  private load(): OthersSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<OthersSettings>;
        return {
          startingTab: parsed.startingTab ?? FACTORY_DEFAULTS.startingTab,
          background: {
            enabled: parsed.background?.enabled ?? false,
            config: parsed.background?.config ?? createDefaultBackground(),
          },
          sequence: {
            ...FACTORY_DEFAULTS.sequence,
            ...(parsed.sequence ?? {}),
          },
        };
      }
    } catch {
      // ignore
    }
    return { ...FACTORY_DEFAULTS, background: { ...FACTORY_DEFAULTS.background }, sequence: { ...FACTORY_DEFAULTS.sequence } };
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // ignore
    }
  }

  get(): OthersSettings {
    return { ...this.settings, background: { ...this.settings.background }, sequence: { ...this.settings.sequence } };
  }

  getStartingTab(): LayoutMode {
    return this.settings.startingTab;
  }

  setStartingTab(tab: LayoutMode): void {
    this.settings.startingTab = tab;
    this.save();
  }

  getBackground(): { enabled: boolean; config: BackgroundConfig } {
    return { ...this.settings.background };
  }

  setBackground(bg: { enabled: boolean; config: BackgroundConfig }): void {
    this.settings.background = bg;
    this.save();
  }

  getSequence(): SequenceDefaults {
    return { ...this.settings.sequence };
  }

  setSequence(seq: Partial<SequenceDefaults>): void {
    this.settings.sequence = { ...this.settings.sequence, ...seq };
    this.save();
  }

  resetAll(): void {
    this.settings = {
      ...FACTORY_DEFAULTS,
      background: { ...FACTORY_DEFAULTS.background, config: createDefaultBackground() },
      sequence: { ...FACTORY_DEFAULTS.sequence },
    };
    this.save();
  }
}

export const othersSettingsService = new OthersSettingsService();
