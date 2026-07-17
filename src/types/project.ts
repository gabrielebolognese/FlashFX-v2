import { DesignElement } from './design';
import { BackgroundConfig } from './background';

// Animation interface (referenced in ProjectFile)
export interface Animation {
  id: string;
  name?: string;
  type: 'opacity' | 'transform' | 'scale' | 'rotate' | 'color';
  elementId: string;
  keyframes: Array<{
    time: number;
    value: any;
    easing?: string;
  }>;
  duration: number;
  delay?: number;
  loop?: boolean | number;
}

// Project JSON schema - exact TypeScript interfaces for validation
export interface ProjectFile {
  proj_id: string;               // stable project id
  name?: string;
  schemaVersion: number;         // increment on schema changes
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
  author?: {
    id: string;
    name?: string;
  };
  canvas: {
    width: number;
    height: number;
    fps?: number;                // frames per second for export
    background?: BackgroundConfig;  // background configuration with gradients
    unit?: 'px' | 'percent';
    grid?: {
      enabled: boolean;
      size: number;
      snap: boolean;
    };
  };
  elements: {
    byId: Record<string, DesignElement>; // Shape = DesignElement from existing codebase
    order: string[];             // IDs in z-order (first = bottom, last = top)
    groups?: Record<string, { id: string; name?: string; children: string[] }>;
  };
  animations?: {
    byId: Record<string, Animation>;
    order?: string[];
  };
  assets?: {
    images?: Record<string, { id: string; src: string; name?: string; width?: number; height?: number }>;
    audio?: Record<string, { id: string; src: string; duration?: number }>;
    fonts?: Record<string, { id: string; name: string; family: string }>;
  };
  settings?: {
    defaultEasing?: string;
    exportDefaults?: { format: 'webm' | 'mp4'; quality?: number };
    autosaveIntervalMs?: number;
    editor?: { gridSnap?: boolean; showRulers?: boolean };
  };
  metadata?: {
    tags?: string[];
    description?: string;
    thumbnail?: string | null; // small data-URI or asset id
    protected?: boolean;
    versionLabel?: string;
  };
  changeLog?: Array<{ id: string; ts: string; authorId?: string; summary: string; diff?: any }>;
  // optional collaborative sync info
  sync?: {
    remoteId?: string;
    lastSyncedAt?: string;
    revision?: number;
  };
}

export interface ProjectChangeLogEntry {
  id: string;
  ts: string;
  authorId?: string;
  summary: string;
  diff?: any;
}

export interface ProjectValidationError {
  path: string;
  message: string;
  value?: any;
}

export interface ProjectApplyResult {
  success: boolean;
  errors?: ProjectValidationError[];
  warnings?: string[];
  changesSummary?: string;
}