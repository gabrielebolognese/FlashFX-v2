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
