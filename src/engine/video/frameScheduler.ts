import { videoDecoderPool } from './videoDecoderPool';

const DEFAULT_BUFFER_SIZE = 60;
const LOOKAHEAD_NORMAL = 30;
const LOOKAHEAD_FAST = 60;
const MEMORY_BUDGET_BYTES = 512 * 1024 * 1024; // 512 MB
const PROXY_SETTLE_DELAY_MS = 300;
const PROXY_THRESHOLD_WIDTH = 1920;
const PROXY_THRESHOLD_HEIGHT = 1080;

interface AssetRegistration {
  assetId: string;
  layerId: string;
  frameRate: number;
  totalFrames: number;
  sourceWidth: number;
  sourceHeight: number;
}

interface FrameEntryData {
  frame: VideoFrame | ImageBitmap;
  byteSize: number;
}

type BufferEntry = FrameEntryData | 'in-flight';

class FrameScheduler {
  private buffers = new Map<string, Map<number, BufferEntry>>();
  private registrations: AssetRegistration[] = [];
  private currentFrame = 0;
  private compositionFrameRate = 30;
  private playbackRate = 0;
  private isScrubbing = false;
  private maxBufferSize = DEFAULT_BUFFER_SIZE;
  private totalMemoryUsage = 0;
  private proxyActive = new Map<string, boolean>();
  private proxySettleTimer: ReturnType<typeof setTimeout> | null = null;
  private tabHidden = false;

  onFrameReady: (() => void) | null = null;

  setCompositionFrameRate(fps: number): void {
    this.compositionFrameRate = fps;
  }

  setPlaybackState(currentFrame: number, playbackRate: number, isScrubbing: boolean): void {
    const scrubbingStarted = isScrubbing && !this.isScrubbing;
    const scrubbingEnded = !isScrubbing && this.isScrubbing;

    this.currentFrame = currentFrame;
    this.playbackRate = playbackRate;
    this.isScrubbing = isScrubbing;

    if (scrubbingStarted) {
      this.cancelAllInFlight();
      this.activateProxyForLargeAssets();
      if (this.proxySettleTimer) {
        clearTimeout(this.proxySettleTimer);
        this.proxySettleTimer = null;
      }
    }

    if (scrubbingEnded) {
      this.proxySettleTimer = setTimeout(() => {
        this.deactivateProxy();
        this.proxySettleTimer = null;
      }, PROXY_SETTLE_DELAY_MS);
    }

    this.prefetch();
  }

  registerAsset(assetId: string, layerId: string, frameRate: number, totalFrames: number): void {
    const existing = this.registrations.find(
      (r) => r.assetId === assetId && r.layerId === layerId
    );
    const meta = videoDecoderPool.getMetadata(assetId);
    const sourceWidth = meta?.width ?? 0;
    const sourceHeight = meta?.height ?? 0;

    if (existing) {
      existing.frameRate = frameRate;
      existing.totalFrames = totalFrames;
      existing.sourceWidth = sourceWidth;
      existing.sourceHeight = sourceHeight;
      return;
    }

    this.registrations.push({ assetId, layerId, frameRate, totalFrames, sourceWidth, sourceHeight });

    if (!this.buffers.has(assetId)) {
      this.buffers.set(assetId, new Map());
    }
  }

  unregisterAsset(assetId: string): void {
    this.registrations = this.registrations.filter((r) => r.assetId !== assetId);
    const buffer = this.buffers.get(assetId);
    if (buffer) {
      for (const entry of buffer.values()) {
        if (entry !== 'in-flight') {
          this.totalMemoryUsage -= entry.byteSize;
          entry.frame.close();
        }
      }
      buffer.clear();
      this.buffers.delete(assetId);
    }
    this.proxyActive.delete(assetId);
  }

  getFrame(assetId: string, frameIndex: number): VideoFrame | ImageBitmap | null {
    const buffer = this.buffers.get(assetId);
    if (!buffer) return null;
    const entry = buffer.get(frameIndex);
    if (!entry || entry === 'in-flight') return null;
    return entry.frame;
  }

  getMemoryStats(): { usedBytes: number; budgetBytes: number } {
    return { usedBytes: this.totalMemoryUsage, budgetBytes: MEMORY_BUDGET_BYTES };
  }

  /** Inject a pre-decoded frame into the buffer (used by export pipeline). */
  injectFrame(assetId: string, frameIndex: number, frame: VideoFrame | ImageBitmap): void {
    let buffer = this.buffers.get(assetId);
    if (!buffer) {
      buffer = new Map();
      this.buffers.set(assetId, buffer);
    }
    const existing = buffer.get(frameIndex);
    if (existing && existing !== 'in-flight') {
      this.totalMemoryUsage -= existing.byteSize;
      existing.frame.close();
    }
    const byteSize = this.estimateFrameSize(frame);
    buffer.set(frameIndex, { frame, byteSize });
    this.totalMemoryUsage += byteSize;
  }

  private activateProxyForLargeAssets(): void {
    const seen = new Set<string>();
    for (const reg of this.registrations) {
      if (seen.has(reg.assetId)) continue;
      seen.add(reg.assetId);
      if (reg.sourceWidth > PROXY_THRESHOLD_WIDTH || reg.sourceHeight > PROXY_THRESHOLD_HEIGHT) {
        if (!this.proxyActive.get(reg.assetId)) {
          this.proxyActive.set(reg.assetId, true);
          videoDecoderPool.setProxyMode(reg.assetId, 0.5);
        }
      }
    }
  }

  private deactivateProxy(): void {
    for (const [assetId, active] of this.proxyActive) {
      if (active) {
        this.proxyActive.set(assetId, false);
        videoDecoderPool.setProxyMode(assetId, 1);
      }
    }
    this.prefetch();
  }

  setTabHidden(hidden: boolean): void {
    this.tabHidden = hidden;
    if (!hidden) {
      this.prefetch();
    }
  }

  private prefetch(): void {
    if (this.tabHidden) return;
    const uniqueAssets = new Set(this.registrations.map((r) => r.assetId));

    for (const assetId of uniqueAssets) {
      const buffer = this.buffers.get(assetId);
      if (!buffer) continue;

      const meta = videoDecoderPool.getMetadata(assetId);
      if (!meta) continue;

      const framesToRequest = this.computeFramesToRequest(assetId, meta.frameCount);

      for (const frameIndex of framesToRequest) {
        if (buffer.has(frameIndex)) continue;

        buffer.set(frameIndex, 'in-flight');
        videoDecoderPool.decodeFrame(assetId, frameIndex).then(
          (frame) => {
            const currentBuffer = this.buffers.get(assetId);
            if (!currentBuffer || currentBuffer.get(frameIndex) !== 'in-flight') {
              frame.close();
              return;
            }
            const byteSize = this.estimateFrameSize(frame);
            currentBuffer.set(frameIndex, { frame, byteSize });
            this.totalMemoryUsage += byteSize;
            this.enforceMemoryBudget();
            this.onFrameReady?.();
          },
          () => {
            const currentBuffer = this.buffers.get(assetId);
            if (currentBuffer?.get(frameIndex) === 'in-flight') {
              currentBuffer.delete(frameIndex);
            }
          }
        );
      }
    }
  }

  private computeFramesToRequest(assetId: string, totalFrames: number): number[] {
    const frames: number[] = [];
    const current = this.currentFrame;
    const reg = this.registrations.find((r) => r.assetId === assetId);
    const sourceRate = reg?.frameRate ?? 30;
    const compRate = this.compositionFrameRate;

    const toSourceFrame = (compFrame: number): number => {
      const timeSec = compFrame / compRate;
      return Math.max(0, Math.min(Math.floor(timeSec * sourceRate), totalFrames - 1));
    };

    if (this.isScrubbing) {
      const sf = toSourceFrame(current);
      if (sf >= 0 && sf < totalFrames) {
        frames.push(sf);
      }
      return frames;
    }

    const rate = this.playbackRate;
    const lookahead = Math.abs(rate) > 1.5 ? LOOKAHEAD_FAST : LOOKAHEAD_NORMAL;
    const direction = rate >= 0 ? 1 : -1;

    const seen = new Set<number>();
    const addFrame = (sf: number) => {
      if (sf >= 0 && sf < totalFrames && !seen.has(sf)) {
        seen.add(sf);
        frames.push(sf);
      }
    };

    addFrame(toSourceFrame(current));

    for (let i = 1; i <= lookahead; i++) {
      addFrame(toSourceFrame(current + i * direction));
    }

    return frames;
  }

  private estimateFrameSize(frame: VideoFrame | ImageBitmap): number {
    if (frame instanceof VideoFrame) {
      return frame.displayWidth * frame.displayHeight * 4;
    }
    return frame.width * frame.height * 4;
  }

  private enforceMemoryBudget(): void {
    if (this.totalMemoryUsage <= MEMORY_BUDGET_BYTES) return;

    const allEntries: { assetId: string; frameIndex: number; data: FrameEntryData; distance: number; ahead: boolean }[] = [];

    for (const [assetId, buffer] of this.buffers) {
      const reg = this.registrations.find((r) => r.assetId === assetId);
      const sourceRate = reg?.frameRate ?? 30;
      const compRate = this.compositionFrameRate;
      const currentSourceFrame = Math.floor((this.currentFrame / compRate) * sourceRate);

      for (const [idx, entry] of buffer) {
        if (entry === 'in-flight') continue;
        const distance = Math.abs(idx - currentSourceFrame);
        const ahead = idx >= currentSourceFrame;
        allEntries.push({ assetId, frameIndex: idx, data: entry, distance, ahead });
      }
    }

    allEntries.sort((a, b) => {
      if (a.distance !== b.distance) return b.distance - a.distance;
      if (a.ahead !== b.ahead) return a.ahead ? 1 : -1;
      return 0;
    });

    for (const entry of allEntries) {
      if (this.totalMemoryUsage <= MEMORY_BUDGET_BYTES) break;
      const buffer = this.buffers.get(entry.assetId);
      if (!buffer) continue;
      buffer.delete(entry.frameIndex);
      this.totalMemoryUsage -= entry.data.byteSize;
      entry.data.frame.close();
    }
  }

  private cancelAllInFlight(): void {
    for (const [assetId, buffer] of this.buffers) {
      for (const [frameIndex, entry] of buffer) {
        if (entry === 'in-flight') {
          videoDecoderPool.cancelFrame(assetId, frameIndex);
          buffer.delete(frameIndex);
        }
      }
    }
  }

  destroy(): void {
    if (this.proxySettleTimer) {
      clearTimeout(this.proxySettleTimer);
      this.proxySettleTimer = null;
    }
    for (const [, buffer] of this.buffers) {
      for (const entry of buffer.values()) {
        if (entry !== 'in-flight') {
          entry.frame.close();
        }
      }
      buffer.clear();
    }
    this.buffers.clear();
    this.registrations = [];
    this.totalMemoryUsage = 0;
    this.proxyActive.clear();
  }
}

export const frameScheduler = new FrameScheduler();

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    frameScheduler.setTabHidden(document.visibilityState === 'hidden');
  });
}
