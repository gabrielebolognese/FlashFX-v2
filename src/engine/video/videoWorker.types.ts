export interface VideoMetadata {
  frameCount: number;
  frameRate: number;
  width: number;
  height: number;
  duration: number;
  codec: string;
  rotation: number;
}

// Messages sent TO the worker
export interface InitMessage {
  type: 'INIT';
  requestId: string;
  assetId: string;
  source: File | string;
}

export interface DecodeFrameMessage {
  type: 'DECODE_FRAME';
  requestId: string;
  assetId: string;
  frameIndex: number;
}

export interface CancelMessage {
  type: 'CANCEL';
  requestId: string;
  assetId: string;
  frameIndex: number;
}

export interface DestroyMessage {
  type: 'DESTROY';
  requestId: string;
  assetId: string;
}

export interface SetProxyMessage {
  type: 'SET_PROXY';
  assetId: string;
  proxyScale: number;
}

export type WorkerInboundMessage =
  | InitMessage
  | DecodeFrameMessage
  | CancelMessage
  | DestroyMessage
  | SetProxyMessage;

// Messages sent FROM the worker
export interface InitDoneMessage {
  type: 'INIT_DONE';
  requestId: string;
  assetId: string;
  metadata: VideoMetadata;
  keyframes: number[];
}

export interface FrameReadyMessage {
  type: 'FRAME_READY';
  requestId: string;
  assetId: string;
  frameIndex: number;
  frame: VideoFrame | ImageBitmap;
}

export interface ErrorMessage {
  type: 'ERROR';
  requestId: string;
  assetId: string;
  message: string;
}

export interface CancelledMessage {
  type: 'CANCELLED';
  requestId: string;
  assetId: string;
  frameIndex: number;
}

export type WorkerOutboundMessage =
  | InitDoneMessage
  | FrameReadyMessage
  | ErrorMessage
  | CancelledMessage;
