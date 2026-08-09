export type Orientation = 'landscape' | 'portrait' | 'square';
export type VideoFormat = 'long' | 'short';

export interface ProjectMetadata {
  id: string;
  name: string;
  width: number;
  height: number;
  orientation: Orientation;
  videoFormat: VideoFormat;
  frameRate: number;
  durationFrames: number;
  createdAt: number;
  modifiedAt: number;
  version: number;
  /** Starred by the user. A starred project gets a longer trash-retention window. */
  starred?: boolean;
  /** When the project was moved to Trash (ms epoch). Absent/null = not trashed. */
  trashedAt?: number | null;
}

// ── Trash retention ──
// A trashed project is fully erased after this many days; starred projects get longer, so a
// favourite you deleted by accident is recoverable for a month.
export const TRASH_RETENTION_DAYS = 7;
export const TRASH_RETENTION_DAYS_STARRED = 30;
const DAY_MS = 86_400_000;

export function trashRetentionDays(m: Pick<ProjectMetadata, 'starred'>): number {
  return m.starred ? TRASH_RETENTION_DAYS_STARRED : TRASH_RETENTION_DAYS;
}
/** Absolute purge time (ms epoch), or null when the project isn't in the trash. */
export function trashPurgeAt(m: Pick<ProjectMetadata, 'starred' | 'trashedAt'>): number | null {
  return m.trashedAt ? m.trashedAt + trashRetentionDays(m) * DAY_MS : null;
}
export function isTrashExpired(m: Pick<ProjectMetadata, 'starred' | 'trashedAt'>, now: number): boolean {
  const at = trashPurgeAt(m);
  return at !== null && now >= at;
}
/** Whole days left before permanent erase (≥0), for the Trash UI. */
export function trashDaysRemaining(m: Pick<ProjectMetadata, 'starred' | 'trashedAt'>, now: number): number {
  const at = trashPurgeAt(m);
  return at === null ? 0 : Math.max(0, Math.ceil((at - now) / DAY_MS));
}

export interface ProjectScene {
  id: string;
  data: string; // JSON serialized composition
}

export interface ProjectPreview {
  id: string;
  blob: Blob | null;
}

export interface ProjectAsset {
  id: string;
  projectId: string;
  name: string;
  type: 'image' | 'video' | 'audio';
  blob: Blob;
  mimeType: string;
  createdAt: number;
}

export interface VideoAssetMetadata {
  assetId: string;
  width: number;
  height: number;
  duration: number;
  frameRate: number;
  hasAudio: boolean;
  codec: string;
  fileSize: number;
}

export interface AudioAssetMetadata {
  assetId: string;
  duration: number;
  sampleRate: number;
  channels: number;
  fileSize: number;
}

export interface WaveformData {
  peaks: Float32Array;
  samplesPerPeak: number;
  channels: number;
  duration: number;
}

export interface ProjectCard {
  metadata: ProjectMetadata;
  previewUrl: string | null;
}

export interface CreateProjectOptions {
  name: string;
  width: number;
  height: number;
  frameRate?: number;
  durationFrames?: number;
  videoFormat?: VideoFormat;
}

export function deriveOrientation(width: number, height: number): Orientation {
  if (width > height) return 'landscape';
  if (height > width) return 'portrait';
  return 'square';
}
