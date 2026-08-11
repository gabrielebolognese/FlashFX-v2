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
  // Respawn backoff: how many times this worker has been recreated in the current
  // crash streak, and when the last respawn happened. A worker that keeps crashing
  // (corrupt file, or the browser's hardware-decoder ceiling) must NOT respawn
  // forever — that infinite `new Worker()` loop is a tab-killing OOM.
  respawns: number;
  lastRespawnAt: number;
  permanentlyFailed: boolean;
  // Current scrub decode scale (1 = full, 0.5 = proxy). Tracked so export can
  // force full-res for a decode and then restore the scrub proxy afterward.
  proxyScale: number;
}

const MAX_CONSECUTIVE_ERRORS = 3;
// A worker may respawn at most this many times within RESPAWN_RESET_MS before the
// asset is permanently disabled (decodes reject fast → black frame, never a loop).
// A quiet period longer than RESPAWN_RESET_MS resets the streak (genuine recovery).
const MAX_RESPAWNS = 5;
const RESPAWN_RESET_MS = 10_000;

let requestIdCounter = 0;
function nextRequestId(): string {
  return `r${++requestIdCounter}`;
}

class VideoDecoderPool {
  // Insertion order doubles as an LRU: `touchLRU` moves an asset to the end, so
  // `keys().next()` is always the least-recently-used.
  private workers = new Map<string, WorkerState>();
  // Sources are retained even after a worker is LRU-evicted, so a later decode
  // request can transparently re-init the decoder on demand.
  private sources = new Map<string, File | string>();
  // Bound the number of live hardware VideoDecoders. Browsers refuse new decoders
  // past a limit (~16 across WebCodecs + media elements) → decode errors → black
  // frames. Keep the N most-recently-used; evict the rest (re-init on demand). Held
  // below the limit with headroom for the per-asset audio <video> elements (which
  // hold a decoder only while actually playing).
  private static readonly MAX_ACTIVE_WORKERS = 8;

  /** Move an asset to the most-recently-used end of the LRU. */
  private touchLRU(assetId: string): void {
    const state = this.workers.get(assetId);
    if (state) {
      this.workers.delete(assetId);
      this.workers.set(assetId, state);
    }
  }

  /** Terminate + drop a worker (LRU eviction) but KEEP its source for re-init. */
  private evictWorker(assetId: string): void {
    const state = this.workers.get(assetId);
    if (!state) return;
    for (const [, req] of state.inFlight) req.reject(new Error('Decoder evicted (LRU)'));
    state.inFlight.clear();
    state.worker.terminate();
    this.workers.delete(assetId);
  }

  /** Initialize a worker for a video asset. Returns metadata once the moov is parsed. */
  async initAsset(assetId: string, source: File | string): Promise<VideoMetadata> {
    this.sources.set(assetId, source);
    const existing = this.workers.get(assetId);
    if (existing?.healthy && existing.metadata) {
      this.touchLRU(assetId);
      return existing.metadata;
    }

    if (existing) {
      existing.worker.terminate();
      this.workers.delete(assetId);
    }

    // Evict least-recently-used decoders to stay under the cap before spawning a new one.
    if (!this.workers.has(assetId)) {
      while (this.workers.size >= VideoDecoderPool.MAX_ACTIVE_WORKERS) {
        const lruId = this.workers.keys().next().value as string | undefined;
        if (!lruId || lruId === assetId) break;
        this.evictWorker(lruId);
      }
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
      respawns: 0,
      lastRespawnAt: 0,
      permanentlyFailed: false,
      proxyScale: 1,
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
  async decodeFrame(assetId: string, frameIndex: number): Promise<VideoFrame> {
    const state = await this.ensureWorker(assetId);
    if (!state) {
      return Promise.reject(new Error(`No worker for asset ${assetId}`));
    }
    this.touchLRU(assetId);

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

  /** Re-init a worker from its retained source if it was LRU-evicted; null if unknown. */
  private async ensureWorker(assetId: string): Promise<WorkerState | null> {
    const existing = this.workers.get(assetId);
    if (existing) return existing.permanentlyFailed ? null : existing; // don't hand back a dead worker
    const source = this.sources.get(assetId);
    if (!source) return null;
    await this.initAsset(assetId, source);
    return this.workers.get(assetId) ?? null;
  }

  /** Decode a frame at full resolution for export (bypasses proxy mode). */
  async decodeFrameForExport(assetId: string, frameIndex: number): Promise<VideoFrame> {
    const state = await this.ensureWorker(assetId);
    if (!state) {
      return Promise.reject(new Error(`No worker for asset ${assetId}`));
    }
    this.touchLRU(assetId);

    // Force full res for this decode without clobbering the asset's scrub proxy
    // state; restore it afterward so scrubbing doesn't stay full-res for the rest
    // of the session once an export has run. (No-op when proxy is already off.)
    const prevScale = state.proxyScale;
    if (prevScale !== 1) {
      state.worker.postMessage({ type: 'SET_PROXY', assetId, proxyScale: 1 });
    }

    const done = new Promise<VideoFrame>((resolve, reject) => {
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

    try {
      return await done;
    } finally {
      if (prevScale !== 1) {
        state.worker.postMessage({ type: 'SET_PROXY', assetId, proxyScale: prevScale });
      }
    }
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
    this.sources.delete(assetId); // also clears an LRU-evicted asset with no live worker
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
    state.proxyScale = scale;
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
    if (state.permanentlyFailed) return; // never respawn a known-bad asset — that's the loop
    this.respawnWorker(assetId);
  }

  private async respawnWorker(assetId: string): Promise<void> {
    const state = this.workers.get(assetId);
    if (!state || state.permanentlyFailed) return;

    // Backoff / cap: reset the streak after a quiet period, otherwise count this respawn and give up
    // once we exceed MAX_RESPAWNS so a crash-on-init/decode asset can't spin `new Worker()` forever.
    const now = Date.now();
    if (now - state.lastRespawnAt > RESPAWN_RESET_MS) state.respawns = 0;
    state.respawns++;
    state.lastRespawnAt = now;
    if (state.respawns > MAX_RESPAWNS) {
      state.permanentlyFailed = true;
      state.healthy = false;
      state.worker.terminate();
      for (const req of state.inFlight.values()) {
        req.reject(new Error('Video decoder disabled after repeated crashes.'));
      }
      state.inFlight.clear();
      console.error(`[VideoDecoderPool] Asset ${assetId} disabled after ${MAX_RESPAWNS} respawns (likely unsupported/corrupt or decoder ceiling).`);
      return;
    }

    state.worker.terminate();
    state.healthy = false;

    const worker = new Worker(
      new URL('./videoWorker.ts', import.meta.url),
      { type: 'module' }
    );

    state.worker = worker;
    state.consecutiveErrors = 0;
    // Reject requests that were in flight on the dead worker so their awaiters
    // fail fast (and can retry) instead of hanging forever — the cause of
    // permanent black frames after an error burst.
    for (const req of state.inFlight.values()) {
      req.reject(new Error('Decoder worker respawned; request cancelled.'));
    }
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
