export interface VideoAssetInfo {
  assetId: string;
  url: string;
  width: number;
  height: number;
  duration: number;
  frameRate: number;
  codec: string;
}

export type QualityMode = 'draft' | 'balanced' | 'full';

export interface FrameRequest {
  assetId: string;
  sourceFrame: number;
  priority: 'immediate' | 'preload' | 'background';
}

export interface CachedVideoFrame {
  sourceFrame: number;
  bitmap: ImageBitmap;
  timestamp: number;
}

export interface DecodeWorkerMessage {
  type: 'init' | 'decode' | 'seek' | 'flush' | 'destroy' | 'configure';
  id: number;
  assetId?: string;
  url?: string;
  frame?: number;
  frames?: number[];
  config?: VideoDecoderConfig;
  scale?: number;
}

export interface DecodeWorkerResponse {
  type: 'ready' | 'frame' | 'keyframes' | 'error' | 'flushed' | 'metadata';
  id: number;
  assetId?: string;
  frame?: number;
  bitmap?: ImageBitmap;
  keyframes?: number[];
  error?: string;
  metadata?: {
    codec: string;
    width: number;
    height: number;
    duration: number;
    frameRate: number;
    frameCount: number;
  };
}

export interface SampleInfo {
  offset: number;
  size: number;
  duration: number;
  cts: number;
  dts: number;
  isSync: boolean;
  number: number;
}
