/**
 * VideoScheduler — per-frame video coordination.
 *
 * Reads the current timeline time on every RAF tick, determines which clips
 * are active, retrieves frames from FrameBufferManagers, and passes them
 * to the GPUCompositor. Frame drops are acceptable — the loop never stalls.
 *
 * The AudioContext clock is the master clock. Video only reads time; it never
 * advances or modifies the clock.
 */

import type { VideoClip, VideoAsset, VideoTrack } from './types';
import type { VideoDecoderController } from './VideoDecoderController';
import type { GPUCompositor, RenderClipCommand } from './GPUCompositor';

export interface SchedulerVideoState {
  clips: Record<string, VideoClip>;
  assets: Record<string, VideoAsset>;
  tracks: Record<string, VideoTrack>;
  trackOrder: string[];
}

const BUFFER_AHEAD_SECONDS = 0.5;

export class VideoScheduler {
  private compositor: GPUCompositor;
  private decoderController: VideoDecoderController;
  private lastRenderedTime = -1;

  constructor(compositor: GPUCompositor, decoderController: VideoDecoderController) {
    this.compositor = compositor;
    this.decoderController = decoderController;
  }

  /**
   * Called on every RAF tick with the current master clock time.
   * Determines active clips, retrieves frames, and triggers GPU render.
   */
  renderFrame(globalTime: number, videoState: SchedulerVideoState): void {
    const { clips, assets, tracks, trackOrder } = videoState;

    // Collect all active clips sorted by track z-order (bottom first)
    const activeClips: Array<{ clip: VideoClip; asset: VideoAsset; localTime: number }> = [];

    for (const trackId of trackOrder) {
      const track = tracks[trackId];
      if (!track) continue;

      for (const clipId of track.clipIds) {
        const clip = clips[clipId];
        if (!clip) continue;
        if (clip.muted || track.muted) continue;
        if (globalTime < clip.startTime || globalTime > clip.endTime) continue;

        const asset = assets[clip.assetId];
        if (!asset) continue;

        const localTime = globalTime - clip.startTime + clip.offset;
        activeClips.push({ clip, asset, localTime });
      }
    }

    if (activeClips.length === 0) {
      this.compositor.clear();
      this.lastRenderedTime = globalTime;
      return;
    }

    // Sync decoder state with active clips
    this.decoderController.syncActiveClips(
      activeClips.map(({ clip, asset, localTime }) => ({
        clipId: clip.id,
        assetId: asset.id,
        localTime,
      })),
      BUFFER_AHEAD_SECONDS
    );

    // Build render commands — never stall if frames are missing
    const renderCommands: RenderClipCommand[] = [];

    for (const { clip, asset, localTime } of activeClips) {
      const buffer = this.decoderController.getBuffer(clip.id);
      if (!buffer) continue;

      const frame = buffer.getFrameAt(localTime);
      if (!frame) continue;

      renderCommands.push({
        frame,
        transform: clip.transform,
        opacity: clip.opacity,
        assetWidth: asset.width,
        assetHeight: asset.height,
      });
    }

    if (renderCommands.length > 0) {
      this.compositor.render(renderCommands);
    } else {
      this.compositor.clear();
    }

    this.lastRenderedTime = globalTime;
  }

  /**
   * Called on seek — flushes all buffers and re-initializes from the new time.
   */
  onSeek(globalTime: number, videoState: SchedulerVideoState): void {
    const { clips, assets, tracks, trackOrder } = videoState;

    const targetTimeByClipId = new Map<string, number>();

    for (const trackId of trackOrder) {
      const track = tracks[trackId];
      if (!track) continue;

      for (const clipId of track.clipIds) {
        const clip = clips[clipId];
        if (!clip) continue;

        const asset = assets[clip.assetId];
        if (!asset) continue;

        if (globalTime >= clip.startTime && globalTime <= clip.endTime) {
          const localTime = globalTime - clip.startTime + clip.offset;
          targetTimeByClipId.set(clipId, localTime);
        }
      }
    }

    this.decoderController.seekAll(targetTimeByClipId, BUFFER_AHEAD_SECONDS);
  }

  /**
   * Called on pause — stops decoder work to free up resources.
   */
  onPause(): void {
    this.decoderController.pauseAll();
  }

  get lastTime(): number {
    return this.lastRenderedTime;
  }
}
