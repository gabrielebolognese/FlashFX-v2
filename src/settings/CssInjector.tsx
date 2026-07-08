import { useEffect } from 'react';
import { useSettingsStore } from './store';

const COLOR_BINDINGS: Record<string, string> = {
  'colors.surface0': '--surface-0',
  'colors.surface1': '--surface-1',
  'colors.surface2': '--surface-2',
  'colors.surface3': '--surface-3',
  'colors.surface4': '--surface-4',
  'colors.surface5': '--surface-5',
  'colors.edgeSubtle': '--edge-subtle',
  'colors.edgeDefault': '--edge',
  'colors.edgeStrong': '--edge-strong',
  'colors.textPrimary': '--text-primary',
  'colors.textSecondary': '--text-secondary',
  'colors.textTertiary': '--text-tertiary',
  'colors.textMuted': '--text-muted',
  'appearance.accentColor': '--accent',
};

const LAYOUT_BINDINGS: Record<string, string> = {
  'typography.baseSize': '--font-size-base',
  'typography.headerSize': '--font-size-header',
  'typography.smallSize': '--font-size-small',
};

function applySettings(values: Record<string, unknown>) {
  const root = document.documentElement;

  for (const [key, cssVar] of Object.entries(COLOR_BINDINGS)) {
    const val = values[key];
    if (typeof val === 'string' && /^#[0-9a-fA-F]{6}$/.test(val)) {
      root.style.setProperty(cssVar, val);
    }
  }

  for (const [key, cssVar] of Object.entries(LAYOUT_BINDINGS)) {
    const val = values[key];
    if (typeof val === 'number') {
      root.style.setProperty(cssVar, `${val}px`);
    }
  }

  const accent = values['appearance.accentColor'];
  if (typeof accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(accent)) {
    const r = parseInt(accent.slice(1, 3), 16);
    const g = parseInt(accent.slice(3, 5), 16);
    const b = parseInt(accent.slice(5, 7), 16);
    root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  }
}

function resetCssVars() {
  const root = document.documentElement;
  for (const cssVar of Object.values(COLOR_BINDINGS)) {
    root.style.removeProperty(cssVar);
  }
  for (const cssVar of Object.values(LAYOUT_BINDINGS)) {
    root.style.removeProperty(cssVar);
  }
  root.style.removeProperty('--accent-rgb');
}

export function SettingsCssInjector() {
  const values = useSettingsStore((s) => s.values);

  useEffect(() => {
    if (Object.keys(values).length === 0) {
      resetCssVars();
    } else {
      applySettings(values);
    }
  }, [values]);

  return null;
}
