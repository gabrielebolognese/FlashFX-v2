import type { LucideIcon } from 'lucide-react';

export interface MenuItemDef {
  type: 'item';
  id: string;
  label: string;
  icon?: LucideIcon;
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
  icon?: LucideIcon;
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
