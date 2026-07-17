// Settings Tab 5 of 6 — Keyboard Shortcuts Registry
// Central service for all keyboard shortcut definitions, bindings, and presets.
// The hooks (useGlobalKeyboardShortcuts, useKeyboardShortcuts) remain the actual
// event dispatchers; this service stores what key combinations map to which command IDs.

export interface ShortcutBinding {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

export type ShortcutCommandType = 'application' | 'panel';

export interface ShortcutCommand {
  id: string;
  label: string;
  category: string;
  description?: string;
  type: ShortcutCommandType;
}

export interface ShortcutPreset {
  name: string;
  bindings: Record<string, ShortcutBinding | null>;
}

// All commands available in the app sourced from useGlobalKeyboardShortcuts audit
export const ALL_COMMANDS: ShortcutCommand[] = [
  // General
  { id: 'undo', label: 'Undo', category: 'General', type: 'application' },
  { id: 'redo', label: 'Redo', category: 'General', type: 'application' },
  { id: 'redo_alt', label: 'Redo (Alt)', category: 'General', type: 'application' },
  { id: 'select_all', label: 'Select All', category: 'General', type: 'application' },
  { id: 'deselect', label: 'Deselect / Close', category: 'General', type: 'application' },
  { id: 'export', label: 'Export', category: 'General', type: 'application' },

  // Shape Creation
  { id: 'create_rectangle', label: 'Rectangle', category: 'Shape Creation', description: 'Create a rectangle shape', type: 'application' },
  { id: 'create_circle', label: 'Circle', category: 'Shape Creation', description: 'Create a circle shape', type: 'application' },
  { id: 'create_text', label: 'Text', category: 'Shape Creation', description: 'Create a text element', type: 'application' },
  { id: 'create_line', label: 'Line', category: 'Shape Creation', description: 'Create a line', type: 'application' },
  { id: 'create_arrow', label: 'Arrow', category: 'Shape Creation', description: 'Create an arrow', type: 'application' },
  { id: 'create_button', label: 'Button', category: 'Shape Creation', description: 'Create a button element', type: 'application' },
  { id: 'upload_image', label: 'Upload Image', category: 'Shape Creation', description: 'Open image file picker', type: 'application' },

  // Elements
  { id: 'duplicate', label: 'Duplicate', category: 'Elements', type: 'application' },
  { id: 'delete', label: 'Delete Selected', category: 'Elements', type: 'application' },
  { id: 'group', label: 'Group', category: 'Elements', type: 'application' },
  { id: 'ungroup', label: 'Ungroup', category: 'Elements', type: 'application' },

  // Movement
  { id: 'nudge_up', label: 'Nudge Up (1px)', category: 'Movement', type: 'panel' },
  { id: 'nudge_down', label: 'Nudge Down (1px)', category: 'Movement', type: 'panel' },
  { id: 'nudge_left', label: 'Nudge Left (1px)', category: 'Movement', type: 'panel' },
  { id: 'nudge_right', label: 'Nudge Right (1px)', category: 'Movement', type: 'panel' },
  { id: 'nudge_up_10', label: 'Nudge Up (10px)', category: 'Movement', type: 'panel' },
  { id: 'nudge_down_10', label: 'Nudge Down (10px)', category: 'Movement', type: 'panel' },
  { id: 'nudge_left_10', label: 'Nudge Left (10px)', category: 'Movement', type: 'panel' },
  { id: 'nudge_right_10', label: 'Nudge Right (10px)', category: 'Movement', type: 'panel' },

  // Canvas
  { id: 'zoom_in', label: 'Zoom In', category: 'Canvas', type: 'application' },
  { id: 'zoom_out', label: 'Zoom Out', category: 'Canvas', type: 'application' },
  { id: 'zoom_reset', label: 'Reset Zoom', category: 'Canvas', type: 'application' },
  { id: 'zoom_in_small', label: 'Zoom In (5%)', category: 'Canvas', type: 'application' },
  { id: 'zoom_out_small', label: 'Zoom Out (5%)', category: 'Canvas', type: 'application' },
  { id: 'toggle_grid', label: 'Toggle Grid', category: 'Canvas', type: 'application' },
  { id: 'toggle_snap', label: 'Toggle Snapping', category: 'Canvas', type: 'application' },

  // Animation
  { id: 'play_pause', label: 'Play / Pause', category: 'Animation', type: 'panel' },
  { id: 'add_keyframe', label: 'Add Keyframe', category: 'Animation', type: 'panel' },

  // Timeline
  { id: 'toggle_timeline', label: 'Toggle Timeline', category: 'Timeline', type: 'panel' },
];

// Default bindings sourced exactly from useGlobalKeyboardShortcuts.ts audit
export const DEFAULT_BINDINGS: Record<string, ShortcutBinding | null> = {
  undo:              { key: 'z', ctrl: true,  shift: false, alt: false },
  redo:              { key: 'z', ctrl: true,  shift: true,  alt: false },
  redo_alt:          { key: 'y', ctrl: true,  shift: false, alt: false },
  select_all:        { key: 'a', ctrl: true,  shift: false, alt: false },
  deselect:          { key: 'Escape', ctrl: false, shift: false, alt: false },
  export:            { key: 'e', ctrl: true,  shift: false, alt: false },

  create_rectangle:  { key: 'r', ctrl: false, shift: false, alt: false },
  create_circle:     { key: 'o', ctrl: false, shift: false, alt: false },
  create_text:       { key: 't', ctrl: false, shift: false, alt: false },
  create_line:       { key: 'l', ctrl: false, shift: false, alt: false },
  create_arrow:      { key: 'a', ctrl: false, shift: false, alt: false },
  create_button:     { key: 'b', ctrl: false, shift: false, alt: false },
  upload_image:      { key: 'i', ctrl: false, shift: false, alt: false },

  duplicate:         { key: 'd', ctrl: true,  shift: false, alt: false },
  delete:            { key: 'Delete', ctrl: false, shift: false, alt: false },
  group:             { key: 'g', ctrl: true,  shift: false, alt: false },
  ungroup:           { key: 'g', ctrl: true,  shift: true,  alt: false },

  nudge_up:          { key: 'ArrowUp',    ctrl: false, shift: false, alt: false },
  nudge_down:        { key: 'ArrowDown',  ctrl: false, shift: false, alt: false },
  nudge_left:        { key: 'ArrowLeft',  ctrl: false, shift: false, alt: false },
  nudge_right:       { key: 'ArrowRight', ctrl: false, shift: false, alt: false },
  nudge_up_10:       { key: 'ArrowUp',    ctrl: false, shift: true,  alt: false },
  nudge_down_10:     { key: 'ArrowDown',  ctrl: false, shift: true,  alt: false },
  nudge_left_10:     { key: 'ArrowLeft',  ctrl: false, shift: true,  alt: false },
  nudge_right_10:    { key: 'ArrowRight', ctrl: false, shift: true,  alt: false },

  zoom_in:           { key: '=', ctrl: true,  shift: false, alt: false },
  zoom_out:          { key: '-', ctrl: true,  shift: false, alt: false },
  zoom_reset:        { key: '0', ctrl: true,  shift: false, alt: false },
  zoom_in_small:     { key: '=', ctrl: false, shift: false, alt: false },
  zoom_out_small:    { key: '-', ctrl: false, shift: false, alt: false },
  toggle_grid:       { key: 'g', ctrl: false, shift: false, alt: false },
  toggle_snap:       { key: ';', ctrl: true,  shift: false, alt: false },

  play_pause:        { key: ' ', ctrl: false, shift: false, alt: false },
  add_keyframe:      { key: 'k', ctrl: true,  shift: false, alt: false },

  toggle_timeline:   { key: 'l', ctrl: true,  shift: true,  alt: false },
};

const STORAGE_KEY = 'flashfx_keyboard_shortcuts';
const PRESETS_KEY = 'flashfx_keyboard_presets';

export function bindingKey(b: ShortcutBinding): string {
  const parts: string[] = [];
  if (b.ctrl)  parts.push('ctrl');
  if (b.alt)   parts.push('alt');
  if (b.shift) parts.push('shift');
  parts.push(b.key.toLowerCase());
  return parts.join('+');
}

export function formatBinding(b: ShortcutBinding | null): string {
  if (!b) return '';
  const parts: string[] = [];
  if (b.ctrl)  parts.push('Ctrl');
  if (b.alt)   parts.push('Alt');
  if (b.shift) parts.push('Shift');
  const keyLabel = KEY_DISPLAY_MAP[b.key] ?? (b.key.length === 1 ? b.key.toUpperCase() : b.key);
  parts.push(keyLabel);
  return parts.join('+');
}

const KEY_DISPLAY_MAP: Record<string, string> = {
  ' ': 'Space',
  'ArrowUp': '↑',
  'ArrowDown': '↓',
  'ArrowLeft': '←',
  'ArrowRight': '→',
  'Escape': 'Esc',
  'Delete': 'Del',
  'Backspace': 'Bksp',
  'Enter': 'Enter',
  'Tab': 'Tab',
  '=': '=',
  '-': '-',
  ';': ';',
};

class ShortcutRegistryService {
  private bindings: Record<string, ShortcutBinding | null>;
  private presets: ShortcutPreset[];

  constructor() {
    this.bindings = this.loadBindings();
    this.presets = this.loadPresets();
  }

  private loadBindings(): Record<string, ShortcutBinding | null> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, ShortcutBinding | null>;
        return { ...DEFAULT_BINDINGS, ...parsed };
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_BINDINGS };
  }

  private saveBindings(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bindings));
    } catch {
      // ignore
    }
  }

  private loadPresets(): ShortcutPreset[] {
    try {
      const raw = localStorage.getItem(PRESETS_KEY);
      if (raw) return JSON.parse(raw) as ShortcutPreset[];
    } catch {
      // ignore
    }
    return [];
  }

  private savePresets(): void {
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(this.presets));
    } catch {
      // ignore
    }
  }

  getBinding(commandId: string): ShortcutBinding | null {
    return this.bindings[commandId] ?? null;
  }

  getAllBindings(): Record<string, ShortcutBinding | null> {
    return { ...this.bindings };
  }

  setBinding(commandId: string, binding: ShortcutBinding | null): void {
    this.bindings[commandId] = binding;
    this.saveBindings();
  }

  clearBinding(commandId: string): void {
    this.bindings[commandId] = null;
    this.saveBindings();
  }

  resetToDefaults(): void {
    this.bindings = { ...DEFAULT_BINDINGS };
    this.saveBindings();
  }

  findConflict(binding: ShortcutBinding, excludeCommandId?: string): string | null {
    const bk = bindingKey(binding);
    for (const [cmdId, b] of Object.entries(this.bindings)) {
      if (cmdId === excludeCommandId) continue;
      if (b && bindingKey(b) === bk) return cmdId;
    }
    return null;
  }

  getPresets(): ShortcutPreset[] {
    return [
      { name: 'Default', bindings: { ...DEFAULT_BINDINGS } },
      ...this.presets,
    ];
  }

  savePreset(name: string): void {
    const existing = this.presets.findIndex(p => p.name === name);
    const preset: ShortcutPreset = { name, bindings: { ...this.bindings } };
    if (existing >= 0) {
      this.presets[existing] = preset;
    } else {
      this.presets.push(preset);
    }
    this.savePresets();
  }

  deletePreset(name: string): void {
    this.presets = this.presets.filter(p => p.name !== name);
    this.savePresets();
  }

  loadPreset(name: string): void {
    if (name === 'Default') {
      this.resetToDefaults();
      return;
    }
    const preset = this.presets.find(p => p.name === name);
    if (preset) {
      this.bindings = { ...DEFAULT_BINDINGS, ...preset.bindings };
      this.saveBindings();
    }
  }

  copyToClipboard(): void {
    const lines: string[] = ['FlashFX Keyboard Shortcuts\n'];
    const categories = [...new Set(ALL_COMMANDS.map(c => c.category))];
    for (const cat of categories) {
      lines.push(`\n${cat}`);
      lines.push('─'.repeat(40));
      const cmds = ALL_COMMANDS.filter(c => c.category === cat);
      for (const cmd of cmds) {
        const b = this.bindings[cmd.id];
        const key = b ? formatBinding(b) : '(unassigned)';
        lines.push(`  ${cmd.label.padEnd(30)} ${key}`);
      }
    }
    navigator.clipboard?.writeText(lines.join('\n')).catch(() => {
      // silently fail if clipboard not available
    });
  }

  formatBinding(b: ShortcutBinding | null): string {
    return formatBinding(b);
  }
}

export const shortcutRegistry = new ShortcutRegistryService();
