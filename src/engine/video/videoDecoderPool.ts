import type {
  WorkerInboundMessage,
  WorkerOutboundMessage,
  VideoMetadata,
} from './videoWorker.types';

interface InFlightRequest {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
}

interface WorkerState {
  worker: Worker;
  source: File | string;
  assetId: string;
  metadata: VideoMetadata | null;
  keyframes: number[];
  inFlight: Map<string, InFlightRequest>;
  healthy: boolean;
  consecutiveErrors: number;
}

const MAX_CONSECUTIVE_ERRORS = 3;

let requestIdCounter = 0;
function nextRequestId(): string {
  return `r${++requestIdCounter}`;
}

class VideoDecoderPool {
  private workers = new Map<string, WorkerState>();

  /** Initialize a worker for a video asset. Returns metadata once the moov is parsed. */
  async initAsset(assetId: string, source: File | string): Promise<VideoMetadata> {
    const existing = this.workers.get(assetId);
    if (existing?.healthy && existing.metadata) {
      return existing.metadata;
    }

    if (existing) {
      existing.worker.terminate();
      this.workers.delete(assetId);
    }

    const worker = new Worker(
      new URL('./videoWorker.ts', import.meta.url),
      { type: 'module' }
    );

    const state: WorkerState = {
      worker,
      source,
      assetId,
      metadata: null,
      keyframes: [],
      inFlight: new Map(),
      healthy: true,
      consecutiveErrors: 0,
    };

    worker.onmessage = (e: MessageEvent<WorkerOutboundMessage>) => {
      this.handleMessage(assetId, e.data);
    };

    worker.onerror = () => {
      this.handleWorkerCrash(assetId);
    };

    this.workers.set(assetId, state);

    return new Promise<VideoMetadata>((resolve, reject) => {
      const requestId = nextRequestId();
      state.inFlight.set(requestId, { resolve, reject });

      const msg: WorkerInboundMessage = {
        type: 'INIT',
        requestId,
        assetId,
        source,
      };
      worker.postMessage(msg);
    });
  }

  /** Decode a single frame. Returns a transferable VideoFrame. */
  decodeFrame(assetId: string, frameIndex: number): Promise<VideoFrame> {
    const state = this.workers.get(assetId);
    if (!state) {
      return Promise.reject(new Error(`No worker for asset ${assetId}`));
    }

    return new Promise<VideoFrame>((resolve, reject) => {
      const requestId = nextRequestId();
      state.inFlight.set(requestId, { resolve, reject });

      const msg: WorkerInboundMessage = {
        type: 'DECODE_FRAME',
        requestId,
        assetId,
        frameIndex,
      };
      state.worker.postMessage(msg);
    });
  }

  /** Decode a frame at full resolution for export (bypasses proxy mode). */
  async decodeFrameForExport(assetId: string, frameIndex: number): Promise<VideoFrame> {
    const state = this.workers.get(assetId);
    if (!state) {
      return Promise.reject(new Error(`No worker for asset ${assetId}`));
    }

    this.setProxyMode(assetId, 1);

    return new Promise<VideoFrame>((resolve, reject) => {
      const requestId = nextRequestId();
      state.inFlight.set(requestId, { resolve, reject });

      const msg: WorkerInboundMessage = {
        type: 'DECODE_FRAME',
        requestId,
        assetId,
        frameIndex,
      };
      state.worker.postMessage(msg);
    });
  }

  /** Cancel an in-flight decode request. */
  cancelFrame(assetId: string, frameIndex: number): void {
    const state = this.workers.get(assetId);
    if (!state) return;

    const requestId = nextRequestId();
    const msg: WorkerInboundMessage = {
      type: 'CANCEL',
      requestId,
      assetId,
      frameIndex,
    };
    state.worker.postMessage(msg);
  }

  /** Tear down the worker for an asset. */
  async destroyAsset(assetId: string): Promise<void> {
    const state = this.workers.get(assetId);
    if (!state) return;

    for (const [, req] of state.inFlight) {
      req.reject(new Error('Asset destroyed'));
    }
    state.inFlight.clear();

    const requestId = nextRequestId();
    const msg: WorkerInboundMessage = {
      type: 'DESTROY',
      requestId,
      assetId,
    };
    state.worker.postMessage(msg);

    await new Promise((r) => setTimeout(r, 100));
    state.worker.terminate();
    this.workers.delete(assetId);
  }

  /** Get cached metadata synchronously, or null if not initialized. */
  getMetadata(assetId: string): VideoMetadata | null {
    return this.workers.get(assetId)?.metadata ?? null;
  }

  /** Get keyframe indices for an asset. */
  getKeyframes(assetId: string): number[] {
    return this.workers.get(assetId)?.keyframes ?? [];
  }

  /** Set proxy decode scale for an asset. 1 = full, 0.5 = half. */
  setProxyMode(assetId: string, scale: number): void {
    const state = this.workers.get(assetId);
    if (!state) return;
    state.worker.postMessage({ type: 'SET_PROXY', assetId, proxyScale: scale });
  }

  private handleMessage(assetId: string, msg: WorkerOutboundMessage): void {
    const state = this.workers.get(assetId);
    if (!state) return;

    switch (msg.type) {
      case 'INIT_DONE': {
        state.metadata = msg.metadata;
        state.keyframes = msg.keyframes;
        state.consecutiveErrors = 0;
        const req = state.inFlight.get(msg.requestId);
        if (req) {
          state.inFlight.delete(msg.requestId);
          req.resolve(msg.metadata);
        }
        break;
      }

      case 'FRAME_READY': {
        state.consecutiveErrors = 0;
        const req = state.inFlight.get(msg.requestId);
        if (req) {
          state.inFlight.delete(msg.requestId);
          req.resolve(msg.frame);
        } else {
          msg.frame.close();
        }
        break;
      }

      case 'ERROR': {
        state.consecutiveErrors++;
        const req = state.inFlight.get(msg.requestId);
        if (req) {
          state.inFlight.delete(msg.requestId);
          req.reject(new Error(msg.message));
        }
        if (state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          this.respawnWorker(assetId);
        }
        break;
      }

      case 'CANCELLED': {
        const req = state.inFlight.get(msg.requestId);
        if (req) {
          state.inFlight.delete(msg.requestId);
          req.reject(new Error('Decode cancelled'));
        }
        break;
      }
    }
  }

  private handleWorkerCrash(assetId: string): void {
    const state = this.workers.get(assetId);
    if (!state) return;
    state.healthy = false;
    for (const [, req] of state.inFlight) {
      req.reject(new Error('Worker crashed'));
    }
    state.inFlight.clear();
    this.respawnWorker(assetId);
  }

  private async respawnWorker(assetId: string): Promise<void> {
    const state = this.workers.get(assetId);
    if (!state) return;

    state.worker.terminate();
    state.healthy = false;

    const worker = new Worker(
      new URL('./videoWorker.ts', import.meta.url),
      { type: 'module' }
    );

    state.worker = worker;
    state.consecutiveErrors = 0;
    state.inFlight.clear();

    worker.onmessage = (e: MessageEvent<WorkerOutboundMessage>) => {
      this.handleMessage(assetId, e.data);
    };

    worker.onerror = () => {
      this.handleWorkerCrash(assetId);
    };

    try {
      const metadata = await new Promise<VideoMetadata>((resolve, reject) => {
        const requestId = nextRequestId();
        state.inFlight.set(requestId, { resolve, reject });

        const msg: WorkerInboundMessage = {
          type: 'INIT',
          requestId,
          assetId,
          source: state.source,
        };
        worker.postMessage(msg);
      });

      state.metadata = metadata;
      state.healthy = true;
      console.info(`[VideoDecoderPool] Respawned worker for asset ${assetId}`);
    } catch (err) {
      console.error(`[VideoDecoderPool] Failed to respawn worker for ${assetId}:`, err);
    }
  }
}

export const videoDecoderPool = new VideoDecoderPool();
