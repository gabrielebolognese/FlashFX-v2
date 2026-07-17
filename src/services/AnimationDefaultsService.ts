// Settings panel complete — all six tabs implemented.
// Provides per-animation timing defaults (duration, easing) and
// per-text-animator-layer defaults (duration, stagger, easing, direction).
// All values write immediately to localStorage and are read by FXShortcutsTab
// at apply-time so user customizations take effect without an app restart.

import { EasingType } from '../animation-engine/types';

export interface AnimationTimingDefaults {
  duration: number;
  easing: EasingType;
}

export interface TextAnimatorLayerDefaults {
  duration: number;
  stagger: number;
  easing: EasingType;
  direction: 'forward' | 'reverse' | 'center' | 'random';
}

// ── Factory defaults (sourced from FXShortcutsTab + makeLayer) ────────────────

export const ANIMATION_TIMING_FACTORY_DEFAULTS: Record<string, AnimationTimingDefaults> = {
  // Scale / Visibility
  'collapse':          { duration: 0.5, easing: 'ease-in-out' },
  'expand':            { duration: 0.5, easing: 'ease-in-out' },
  'pop-in':            { duration: 0.5, easing: 'ease-out-back' },
  'pop-out':           { duration: 0.5, easing: 'ease-in-back' },
  'pulse':             { duration: 0.5, easing: 'ease-in-out' },
  'breath':            { duration: 1.0, easing: 'ease-in-out' },
  // Position / Movement
  'slide-in-left':     { duration: 0.5, easing: 'ease-out' },
  'slide-in-right':    { duration: 0.5, easing: 'ease-out' },
  'slide-in-top':      { duration: 0.5, easing: 'ease-out' },
  'slide-in-bottom':   { duration: 0.5, easing: 'ease-out' },
  'slide-out-left':    { duration: 0.5, easing: 'ease-in' },
  'slide-out-right':   { duration: 0.5, easing: 'ease-in' },
  'slide-out-top':     { duration: 0.5, easing: 'ease-in' },
  'slide-out-bottom':  { duration: 0.5, easing: 'ease-in' },
  'nudge-left':        { duration: 0.3, easing: 'ease-in-out' },
  'nudge-right':       { duration: 0.3, easing: 'ease-in-out' },
  'nudge-up':          { duration: 0.3, easing: 'ease-in-out' },
  'nudge-down':        { duration: 0.3, easing: 'ease-in-out' },
  'snap-back':         { duration: 0.3, easing: 'ease-out-back' },
  // Opacity
  'fade-in':           { duration: 0.5, easing: 'ease-in-out' },
  'fade-out':          { duration: 0.5, easing: 'ease-in-out' },
  'flash':             { duration: 0.4, easing: 'linear' },
  'blink':             { duration: 0.6, easing: 'linear' },
  // Rotation
  'twist-in':          { duration: 0.5, easing: 'ease-out' },
  'twist-out':         { duration: 0.5, easing: 'ease-in' },
  'spin-in':           { duration: 0.6, easing: 'ease-out' },
  'spin-out':          { duration: 0.6, easing: 'ease-in' },
  'wobble':            { duration: 0.6, easing: 'ease-in-out' },
  // Overshoot / Energy
  'bounce-in':         { duration: 0.5, easing: 'ease-out-back' },
  'bounce-out':        { duration: 0.5, easing: 'ease-out-back' },
  'overshoot-scale':   { duration: 0.5, easing: 'ease-out-back' },
  'snap':              { duration: 0.3, easing: 'ease-out-elastic' },
  // Attention / Shake
  'point-left':        { duration: 0.4, easing: 'ease-in-out' },
  'point-right':       { duration: 0.4, easing: 'ease-in-out' },
  'point-up':          { duration: 0.4, easing: 'ease-in-out' },
  'point-down':        { duration: 0.4, easing: 'ease-in-out' },
  'shake-x':           { duration: 0.5, easing: 'linear' },
  'shake-y':           { duration: 0.5, easing: 'linear' },
  // Shape-Specific
  'grow-width':        { duration: 0.5, easing: 'ease-out' },
  'grow-height':       { duration: 0.5, easing: 'ease-out' },
  'center-expand':     { duration: 0.5, easing: 'ease-out' },
  'edge-expand':       { duration: 0.5, easing: 'ease-out' },
  // Camera / Global
  'zoom-focus':        { duration: 0.5, easing: 'ease-in-out' },
  'zoom-out':          { duration: 0.5, easing: 'ease-in-out' },
  // Timing Macros
  'fast-in':           { duration: 0.5, easing: 'ease-in-cubic' },
  'fast-out':          { duration: 0.5, easing: 'ease-out-cubic' },
  'smooth-in-out':     { duration: 0.5, easing: 'ease-in-out-cubic' },
  'aggressive-snap':   { duration: 0.5, easing: 'ease-out-back' },
  // Killer Buttons
  'appear':            { duration: 0.5, easing: 'ease-out' },
  'disappear':         { duration: 0.5, easing: 'ease-in' },
  'enter':             { duration: 0.5, easing: 'ease-out' },
  'exit':              { duration: 0.5, easing: 'ease-in' },
  'emphasize':         { duration: 0.5, easing: 'ease-out-back' },
};

// Text animator layer defaults per preset (from makeLayer call in FXShortcutsTab)
export const TEXT_ANIMATOR_FACTORY_DEFAULTS: Record<string, TextAnimatorLayerDefaults[]> = {
  typewriter: [
    { duration: 0.08, stagger: 0.05, easing: 'linear', direction: 'forward' },
  ],
  'slide-up': [
    { duration: 0.3, stagger: 0.04, easing: 'ease-out', direction: 'forward' },
    { duration: 0.3, stagger: 0.04, easing: 'ease-out', direction: 'forward' },
  ],
  'line-reveal': [
    { duration: 0.4, stagger: 0.12, easing: 'ease-in-out', direction: 'forward' },
  ],
  'fade-in-words': [
    { duration: 0.35, stagger: 0.08, easing: 'ease-in-out', direction: 'forward' },
  ],
  'scale-in': [
    { duration: 0.25, stagger: 0.03, easing: 'ease-out', direction: 'center' },
    { duration: 0.25, stagger: 0.03, easing: 'ease-out', direction: 'center' },
  ],
  'blur-in': [
    { duration: 0.35, stagger: 0.06, easing: 'ease-out', direction: 'forward' },
    { duration: 0.35, stagger: 0.06, easing: 'ease-out', direction: 'forward' },
  ],
};

const STORAGE_KEY = 'flashfx_animation_defaults';

class AnimationDefaultsService {
  private timingOverrides: Record<string, Partial<AnimationTimingDefaults>>;
  private textOverrides: Record<string, Partial<TextAnimatorLayerDefaults>[]>;

  constructor() {
    const loaded = this.load();
    this.timingOverrides = loaded.timing ?? {};
    this.textOverrides   = loaded.text   ?? {};
  }

  private load(): {
    timing: Record<string, Partial<AnimationTimingDefaults>>;
    text: Record<string, Partial<TextAnimatorLayerDefaults>[]>;
  } {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { timing: {}, text: {} };
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        timing: this.timingOverrides,
        text:   this.textOverrides,
      }));
    } catch { /* ignore */ }
  }

  getTiming(animId: string): AnimationTimingDefaults {
    const factory = ANIMATION_TIMING_FACTORY_DEFAULTS[animId] ?? { duration: 0.5, easing: 'ease-in-out' as EasingType };
    return { ...factory, ...(this.timingOverrides[animId] ?? {}) };
  }

  setTiming(animId: string, updates: Partial<AnimationTimingDefaults>): void {
    this.timingOverrides[animId] = { ...(this.timingOverrides[animId] ?? {}), ...updates };
    this.save();
  }

  resetTiming(animId: string): void {
    delete this.timingOverrides[animId];
    this.save();
  }

  getTextLayer(presetId: string, layerIndex: number): TextAnimatorLayerDefaults {
    const factory = (TEXT_ANIMATOR_FACTORY_DEFAULTS[presetId] ?? [])[layerIndex]
      ?? { duration: 0.3, stagger: 0.05, easing: 'ease-out' as EasingType, direction: 'forward' as const };
    const overrideArr = this.textOverrides[presetId] ?? [];
    return { ...factory, ...(overrideArr[layerIndex] ?? {}) };
  }

  setTextLayer(presetId: string, layerIndex: number, updates: Partial<TextAnimatorLayerDefaults>): void {
    if (!this.textOverrides[presetId]) {
      const factory = TEXT_ANIMATOR_FACTORY_DEFAULTS[presetId] ?? [];
      this.textOverrides[presetId] = factory.map(() => ({}));
    }
    const arr = this.textOverrides[presetId];
    while (arr.length <= layerIndex) arr.push({});
    arr[layerIndex] = { ...arr[layerIndex], ...updates };
    this.save();
  }

  resetText(presetId: string): void {
    delete this.textOverrides[presetId];
    this.save();
  }

  resetAll(): void {
    this.timingOverrides = {};
    this.textOverrides   = {};
    this.save();
  }

  getAllTimingOverrides(): Record<string, Partial<AnimationTimingDefaults>> {
    return { ...this.timingOverrides };
  }

  getAllTextOverrides(): Record<string, Partial<TextAnimatorLayerDefaults>[]> {
    return { ...this.textOverrides };
  }
}

export const animationDefaultsService = new AnimationDefaultsService();
