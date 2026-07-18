import { videoDecoderPool } from './videoDecoderPool';

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

/**
 * The exact source-frame requirement for one video layer at the current
 * playhead, reported by the renderer after it resolves the layer. This is the
 * SINGLE source of truth for comp-frame → source-frame mapping
 * (core/interpolation.ts:resolveVideoLayer): the scheduler consumes the value
 * rather than recomputing it, so inPoint / startOffset / playbackRate can never
 * diverge between what the renderer draws and what the scheduler prefetches.
 */
interface VideoRequirement {
  assetId: string;
  /** Source frame the renderer needs NOW (already trimmed + rate-scaled + clamped). */
  sourceFrame: number;
  /** The layer's video playbackRate; scales the prefetch lookahead velocity. */
  playbackRate: number;
}

class FrameScheduler {
  private buffers = new Map<string, Map<number, BufferEntry>>();
  private registrations: AssetRegistration[] = [];
  /** Per-layer source-frame requirements, keyed by layerId (see VideoRequirement). */
  private requirements = new Map<string, VideoRequirement>();
  private currentFrame = 0;
  private compositionFrameRate = 30;
  private playbackRate = 0;
  private isScrubbing = false;
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

  /**
   * Report the exact source frame a video layer needs at the current playhead.
   * Called by the renderer once per video layer per frame, right after it
   * resolves the layer. The scheduler uses this as the prefetch anchor so its
   * lookahead tracks the same trim/offset/rate the renderer actually draws.
   */
  reportVideoRequirement(layerId: string, assetId: string, sourceFrame: number, playbackRate: number): void {
    this.requirements.set(layerId, { assetId, sourceFrame, playbackRate });

    // If the frame the renderer just asked for isn't buffered or already being
    // decoded, kick a prefetch now. Otherwise a video whose playhead doesn't move
    // (just added, or seeked while paused) would never request its frame and show
    // black until the next playhead change. prefetch() dedupes against the buffer,
    // so this is a no-op once the frame is in flight.
    const entry = this.buffers.get(assetId)?.get(sourceFrame);
    if (!entry) this.prefetch();
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
    for (const [layerId, req] of this.requirements) {
      if (req.assetId === assetId) this.requirements.delete(layerId);
    }
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
    const compRate = this.compositionFrameRate;
    const reg = this.registrations.find((r) => r.assetId === assetId);
    const sourceRate = reg?.frameRate ?? 30;

    // Prefer the renderer-reported requirements for this asset (exact source
    // frames, honoring each layer's inPoint/startOffset/playbackRate). Fall back
    // to the naive comp→source mapping only until the first render reports one
    // (e.g. the frame right after load), which assumes inPoint/startOffset 0.
    const reqs = [...this.requirements.values()].filter((r) => r.assetId === assetId);
    const anchors: { sourceFrame: number; advancePerCompFrame: number }[] =
      reqs.length > 0
        ? reqs.map((r) => ({
            sourceFrame: r.sourceFrame,
            // d(sourceFrame)/d(compFrame) = sourceRate * playbackRate / compRate.
            advancePerCompFrame: (sourceRate * r.playbackRate) / compRate,
          }))
        : [{
            sourceFrame: Math.floor((this.currentFrame / compRate) * sourceRate),
            advancePerCompFrame: sourceRate / compRate,
          }];

    const seen = new Set<number>();
    const addFrame = (sf: number) => {
      const clamped = Math.max(0, Math.min(sf, totalFrames - 1));
      if (clamped >= 0 && clamped < totalFrames && !seen.has(clamped)) {
        seen.add(clamped);
        frames.push(clamped);
      }
    };

    if (this.isScrubbing) {
      // Only the exact current source frame(s) matter while scrubbing.
      for (const a of anchors) addFrame(a.sourceFrame);
      return frames;
    }

    const rate = this.playbackRate;
    const lookahead = Math.abs(rate) > 1.5 ? LOOKAHEAD_FAST : LOOKAHEAD_NORMAL;
    const direction = rate >= 0 ? 1 : -1;

    // Interleave anchors so each layer's current frame is requested before any
    // layer's deep lookahead (prioritizes what's on screen now).
    for (let i = 0; i <= lookahead; i++) {
      for (const a of anchors) {
        addFrame(Math.round(a.sourceFrame + i * direction * a.advancePerCompFrame));
      }
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
      // Anchor eviction distance on the renderer-reported source frames so we
      // never evict what's on screen. A frame's distance is to the NEAREST
      // active layer's source frame; fall back to the naive mapping pre-report.
      const anchorFrames = [...this.requirements.values()]
        .filter((r) => r.assetId === assetId)
        .map((r) => r.sourceFrame);
      if (anchorFrames.length === 0) {
        anchorFrames.push(Math.floor((this.currentFrame / compRate) * sourceRate));
      }

      for (const [idx, entry] of buffer) {
        if (entry === 'in-flight') continue;
        let distance = Infinity;
        let ahead = true;
        for (const a of anchorFrames) {
          const d = Math.abs(idx - a);
          if (d < distance) { distance = d; ahead = idx >= a; }
        }
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
