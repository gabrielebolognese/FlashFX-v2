export type ControlType =
  | 'toggle'
  | 'slider'
  | 'dropdown'
  | 'number'
  | 'color'
  | 'text'
  | 'keybinding';

export interface SettingControlDef {
  id: string;
  label: string;
  description?: string;
  type: ControlType;
  disabled?: boolean;
  disabledReason?: string;
  defaultValue: unknown;
  options?: { label: string; value: string | number }[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export interface SettingSection {
  id: string;
  title: string;
  description?: string;
  controls: SettingControlDef[];
}

export interface SettingTab {
  id: string;
  label: string;
  icon: string;
  sections: SettingSection[];
}

export type SettingsValues = Record<string, unknown>;
