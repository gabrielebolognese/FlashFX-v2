export interface VideoAsset {
  id: string;
  fileName: string;
  duration: number;
  width: number;
  height: number;
  codec: string;
  containerType: string;
  thumbnailUrl: string;
}

export interface VideoTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export interface VideoClip {
  id: string;
  assetId: string;
  startTime: number;
  endTime: number;
  offset: number;
  trackId: string;
  name: string;
  transform: VideoTransform;
  opacity: number;
  muted: boolean;
}

export interface VideoTrack {
  id: string;
  name: string;
  clipIds: string[];
  muted: boolean;
  zOrder: number;
}

export interface VideoState {
  assets: Record<string, VideoAsset>;
  clips: Record<string, VideoClip>;
  tracks: Record<string, VideoTrack>;
  trackOrder: string[];
}

export type VideoAction =
  | { type: 'ADD_ASSET'; asset: VideoAsset }
  | { type: 'ADD_TRACK'; track: VideoTrack }
  | { type: 'ADD_CLIP'; clip: VideoClip }
  | { type: 'UPDATE_CLIP'; clipId: string; updates: Partial<VideoClip> }
  | { type: 'REMOVE_CLIP'; clipId: string }
  | { type: 'UPDATE_TRACK'; trackId: string; updates: Partial<VideoTrack> }
  | { type: 'REMOVE_TRACK'; trackId: string }
  | { type: 'REMOVE_ASSET'; assetId: string };

export type WorkerToMainMessage =
  | { type: 'FRAME'; clipId: string; frame: VideoFrame; timestamp: number }
  | { type: 'DECODE_COMPLETE'; clipId: string }
  | { type: 'ERROR'; clipId: string; message: string; fatal: boolean }
  | { type: 'READY'; clipId: string };

export type MainToWorkerMessage =
  | { type: 'INIT'; clipId: string; assetId: string; file: File; targetTime: number; bufferAheadSeconds: number }
  | { type: 'SEEK'; clipId: string; targetTime: number; bufferAheadSeconds: number }
  | { type: 'FLUSH'; clipId: string }
  | { type: 'FLUSH_ALL' }
  | { type: 'CLOSE'; clipId: string };

export interface FilmstripThumbnail {
  time: number;
  imageUrl: string;
}

export interface DroppedFrameMetrics {
  clipId: string;
  droppedCount: number;
  totalRendered: number;
}
