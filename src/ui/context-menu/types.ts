import type { ComponentType } from 'react';

export interface MenuItemDef {
  type: 'item';
  id: string;
  label: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  shortcut?: string;
  enabled?: boolean;
  action?: () => void;
  checked?: boolean;
}

export interface MenuSeparatorDef {
  type: 'separator';
}

export interface MenuSubmenuDef {
  type: 'submenu';
  id: string;
  label: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  enabled?: boolean;
  items: MenuEntry[];
}

export interface MenuGroupDef {
  type: 'group';
  label?: string;
  items: MenuEntry[];
}

export type MenuEntry = MenuItemDef | MenuSeparatorDef | MenuSubmenuDef | MenuGroupDef;

export interface ContextMenuState {
  x: number;
  y: number;
  items: MenuEntry[];
}
