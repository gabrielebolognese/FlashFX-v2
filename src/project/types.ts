import type { DesignElement, ImageFilters, ClipMask, TextAnimatorLayer } from '../types/design';
import type { AnimationState, ElementAnimation, PropertyTrack, Keyframe, TimelineMarker, Sequence } from '../animation-engine/types';
import type { ProjectCanvas } from '../types/projectFile';
import type { BackgroundConfig } from '../types/background';

export const FORMAT_VERSION = '1.1.0';
export const FILE_EXTENSION = '.ffxproj';

// ─── Asset Manifest ───────────────────────────────────────────────────────────

export interface AssetEntry {
  id: string;
  type: 'image' | 'audio' | 'video' | 'font';
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  subfolder: string;
  originalName?: string;
  width?: number;
  height?: number;
}

// ─── project.json ─────────────────────────────────────────────────────────────

export interface FfxprojManifest {
  formatVersion: string;
  appVersion: string;
  createdAt: string;
  lastModifiedAt: string;
  projectName: string;
  canvasWidth: number;
  canvasHeight: number;
  frameRate: number;
  totalDuration: number;
  backgroundColor: string;
  backgroundConfig?: BackgroundConfig;
  zoom?: number;
  pan?: { x: number; y: number };
  gridEnabled?: boolean;
  gridSnap?: boolean;
  gridSize?: number;
  assetManifest: AssetEntry[];
}

// ─── elements/elements.json ───────────────────────────────────────────────────

export interface ElementsFile {
  formatVersion: string;
  elementCount: number;
  elements: DesignElement[];
}

// ─── elements/keyframes.json ──────────────────────────────────────────────────

export interface SerializedKeyframe {
  id: string;
  time: number;
  value: number | string;
  easing: string;
  handleIn?: { x: number; y: number };
  handleOut?: { x: number; y: number };
}

export interface SerializedPropertyTrack {
  property: string;
  keyframes: SerializedKeyframe[];
  enabled: boolean;
}

export interface SerializedElementAnimation {
  elementId: string;
  tracks: SerializedPropertyTrack[];
  clipStart: number;
  clipDuration: number;
  locked: boolean;
  muted: boolean;
}

export interface KeyframesFile {
  formatVersion: string;
  keyframeCollections: Record<string, SerializedElementAnimation>;
}

// ─── timeline/timeline.json ───────────────────────────────────────────────────

export interface SerializedMarker {
  id: string;
  time: number;
  name: string;
  color: string;
}

export interface SerializedSequence {
  id: string;
  name: string;
  frameRate: number;
  duration: number;
  canvasId: string;
  createdAt: number;
  updatedAt: number;
}

export interface SerializedTimeline {
  formatVersion: string;
  totalDuration: number;
  frameRate: number;
  pixelsPerSecond: number;
  loop: boolean;
  snapToMarkers: boolean;
  markers: SerializedMarker[];
  sequences: SerializedSequence[];
  activeSequenceId: string | null;
}

// ─── timeline/keyframes.json ──────────────────────────────────────────────────

export interface TimelineKeyframesFile {
  formatVersion: string;
  globalKeyframes: Record<string, unknown>;
}

// ─── Export / Import options ──────────────────────────────────────────────────

export interface ExportOptions {
  projectName: string;
  elements: DesignElement[];
  canvas: ProjectCanvas;
  animationState: AnimationState;
  userId?: string;
  userName?: string;
  onProgress?: (pct: number, label: string) => void;
}

export interface ImportedProject {
  projectName: string;
  elements: DesignElement[];
  canvas: ProjectCanvas;
  animationState: AnimationState;
  warnings: string[];
}

export interface ImportResult {
  success: boolean;
  data?: ImportedProject;
  errors?: string[];
  warnings?: string[];
}

// ─── Autosave snapshot (localStorage — no binary assets) ─────────────────────

export interface AutosaveSnapshot {
  version: string;
  savedAt: string;
  projectName: string;
  canvas: ProjectCanvas;
  elements: DesignElement[];
  animationState: AnimationState;
}

export const AUTOSAVE_STORAGE_KEY = 'ffx-autosave-snapshot';
export const AUTOSAVE_VERSION = '1.0.0';
