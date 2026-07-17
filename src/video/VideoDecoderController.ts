/**
 * VideoDecoderController — manages the DemuxWorker lifecycle from the main thread.
 * Owns one Web Worker shared across all clips. Routes decoded frames to each
 * clip's FrameBufferManager. Handles seek, flush, and close operations.
 */

import { FrameBufferManager } from './FrameBufferManager';
import { videoAssetManager } from './VideoAssetManager';
import type { MainToWorkerMessage, WorkerToMainMessage } from './types';

export interface DecoderMetrics {
  activeClipIds: string[];
  totalDroppedFrameRate: number;
}

export class VideoDecoderController {
  private worker: Worker;
  private buffers = new Map<string, FrameBufferManager>();
  private activeClipIds = new Set<string>();
  private onError?: (clipId: string, message: string) => void;

  constructor(onError?: (clipId: string, message: string) => void) {
    this.onError = onError;
    this.worker = new Worker(
      new URL('./workers/DemuxWorker.ts', import.meta.url),
      { type: 'module' }
    );
    this.worker.onmessage = this.handleWorkerMessage;
    this.worker.onerror = (e) => {
      console.error('[VideoDecoderController] Worker error:', e);
    };
  }

  private handleWorkerMessage = (e: MessageEvent<WorkerToMainMessage>) => {
    const msg = e.data;

    switch (msg.type) {
      case 'FRAME': {
        const buffer = this.buffers.get(msg.clipId);
        if (buffer) {
          buffer.addFrame(msg.frame, msg.timestamp);
        } else {
          msg.frame.close();
        }
        break;
      }

      case 'ERROR': {
        console.warn(`[VideoDecoderController] Clip ${msg.clipId}: ${msg.message}`);
        if (msg.fatal) {
          this.onError?.(msg.clipId, msg.message);
        }
        break;
      }

      case 'DECODE_COMPLETE':
      case 'READY':
        break;
    }
  };

  private send(msg: MainToWorkerMessage): void {
    this.worker.postMessage(msg);
  }

  /**
   * Start decoding a clip at the given time. Creates a FrameBufferManager
   * for the clip if one doesn't exist.
   */
  initClip(clipId: string, assetId: string, targetTime: number, bufferAheadSeconds = 0.5): void {
    const file = videoAssetManager.getFile(assetId);
    if (!file) {
      console.warn(`[VideoDecoderController] No file found for asset ${assetId}`);
      return;
    }

    if (!this.buffers.has(clipId)) {
      this.buffers.set(clipId, new FrameBufferManager());
    }

    this.activeClipIds.add(clipId);

    this.send({
      type: 'INIT',
      clipId,
      assetId,
      file,
      targetTime,
      bufferAheadSeconds,
    });
  }

  /**
   * Seek a clip to a new time. Flushes the existing buffer and
   * requests new frames from the worker.
   */
  seekClip(clipId: string, targetTime: number, bufferAheadSeconds = 0.5): void {
    const buffer = this.buffers.get(clipId);
    if (buffer) {
      buffer.flush();
    }

    this.send({ type: 'SEEK', clipId, targetTime, bufferAheadSeconds });
  }

  /**
   * Flush all buffers and reset worker decoders. Used on timeline seek.
   */
  seekAll(targetTimeByClipId: Map<string, number>, bufferAheadSeconds = 0.5): void {
    for (const [clipId, buffer] of this.buffers) {
      buffer.flush();
      const targetTime = targetTimeByClipId.get(clipId) ?? 0;
      this.send({ type: 'SEEK', clipId, targetTime, bufferAheadSeconds });
    }
  }

  /**
   * Pause — sends FLUSH_ALL to stop in-progress decoding.
   */
  pauseAll(): void {
    this.send({ type: 'FLUSH_ALL' });
  }

  /**
   * Get the FrameBufferManager for a clip (may be null if not initialized).
   */
  getBuffer(clipId: string): FrameBufferManager | undefined {
    return this.buffers.get(clipId);
  }

  /**
   * Remove a clip entirely. Closes its buffer and removes from worker.
   */
  removeClip(clipId: string): void {
    const buffer = this.buffers.get(clipId);
    if (buffer) {
      buffer.destroy();
      this.buffers.delete(clipId);
    }
    this.activeClipIds.delete(clipId);
    this.send({ type: 'CLOSE', clipId });
  }

  /**
   * Ensures clips not in the active set are removed and new clips are initialized.
   */
  syncActiveClips(
    activeClips: Array<{ clipId: string; assetId: string; localTime: number }>,
    bufferAheadSeconds = 0.5
  ): void {
    const newClipIds = new Set(activeClips.map((c) => c.clipId));

    for (const clipId of this.activeClipIds) {
      if (!newClipIds.has(clipId)) {
        this.removeClip(clipId);
      }
    }

    for (const { clipId, assetId, localTime } of activeClips) {
      if (!this.activeClipIds.has(clipId)) {
        this.initClip(clipId, assetId, localTime, bufferAheadSeconds);
      } else {
        const buffer = this.buffers.get(clipId);
        if (buffer?.needsMoreFrames(localTime)) {
          this.send({ type: 'SEEK', clipId, targetTime: localTime, bufferAheadSeconds });
        }
      }
    }
  }

  getMetrics(): DecoderMetrics {
    let total = 0;
    let count = 0;
    for (const buffer of this.buffers.values()) {
      total += buffer.droppedFrameRate;
      count++;
    }
    return {
      activeClipIds: Array.from(this.activeClipIds),
      totalDroppedFrameRate: count > 0 ? total / count : 0,
    };
  }

  destroy(): void {
    for (const buffer of this.buffers.values()) {
      buffer.destroy();
    }
    this.buffers.clear();
    this.activeClipIds.clear();
    this.worker.terminate();
  }
}
