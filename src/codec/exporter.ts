import type { Composition } from '../core/types';
import { resolveFrame } from '../core/interpolation';
import { WebGPURenderer } from '../engine/renderer';
import { EXPORT_MOTION_BLUR_SAMPLES } from '../store/preview';
import { videoDecoderPool } from '../engine/video/videoDecoderPool';
import { frameScheduler } from '../engine/video/frameScheduler';
import { exportCompositionAudio, type EncodedAudio } from './audioMixer';
import {
  normalizeExportDimensions, validateExportTiming,
  frameTimestampUs, frameDurationUs, isExportKeyframe,
  collectExportVideoDecodes,
} from './exportMath';

export interface ExportSettings {
  width: number;
  height: number;
  frameRate: number;
  bitrate: number;
  codec: string;
  includeAudio: boolean;
}

export interface ExportProgress {
  phase: 'initializing' | 'rendering' | 'finalizing' | 'done' | 'error';
  currentFrame: number;
  totalFrames: number;
  percent: number;
  message: string;
}

export async function exportToMp4(
  composition: Composition,
  settings: Partial<ExportSettings> = {},
  onProgress?: (progress: ExportProgress) => void,
  signal?: AbortSignal,
  // Registry lookup so precomp layers resolve their sub-compositions during export.
  // Without it, resolveFrame gets no ResolveContext and every precomp renders blank.
  getComposition?: (id: string) => Composition | undefined,
): Promise<Blob> {
  // H.264 requires even dimensions; round down (and reject a blank/degenerate size). Pure + validated.
  const { width, height } = normalizeExportDimensions(
    settings.width ?? composition.settings.width,
    settings.height ?? composition.settings.height,
  );
  const frameRate = settings.frameRate ?? composition.settings.frameRate;
  const bitrate = settings.bitrate ?? 8_000_000;
  const codec = settings.codec ?? 'avc1.42001f';
  const totalFrames = composition.settings.durationFrames;

  // Pre-flight: fail fast and clearly on an empty/invalid composition rather than spinning up the
  // renderer + encoder only to produce a broken file.
  validateExportTiming(totalFrames, frameRate);

  // WebCodecs + codec preflight BEFORE any renderer/audio work, so an unsupported browser or an
  // unsupported H.264 profile (e.g. 4K High profile on some GPUs) fails fast with a clear message
  // instead of throwing raw errors mid-export.
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('Video export needs WebCodecs, which this browser does not support. Use a recent Chromium-based browser.');
  }
  const support = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate: frameRate });
  if (support.supported === false) {
    throw new Error(`This browser or GPU does not support the selected export quality (${codec} at ${width}x${height}). Try a lower quality or resolution.`);
  }

  onProgress?.({
    phase: 'initializing',
    currentFrame: 0,
    totalFrames,
    percent: 0,
    message: 'Setting up renderer...',
  });

  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');

  const renderer = new WebGPURenderer();
  const ok = await renderer.initializeOffscreen(width, height);
  if (!ok) {
    throw new Error('WebGPU not available for export');
  }
  // Export always renders motion blur at full quality so output matches the
  // full-quality preview (Preview = Export).
  renderer.setMotionBlurSamples(EXPORT_MOTION_BLUR_SAMPLES);

  const canvas = renderer.getOffscreenCanvas()!;

  // Mix + encode audio up front - the muxer needs the audio track configured at
  // construction. Failures are non-fatal: we fall back to a video-only export.
  let audio: EncodedAudio | null = null;
  let audioDropped = false; // audio was requested but couldn't be produced (surfaced to the user)
  if (settings.includeAudio ?? true) {
    onProgress?.({
      phase: 'initializing',
      currentFrame: 0,
      totalFrames,
      percent: 1,
      message: 'Mixing audio...',
    });
    try {
      audio = await exportCompositionAudio(composition, { frameRate, durationFrames: totalFrames }, signal);
    } catch (e) {
      if ((e as Error).message === 'Export cancelled') {
        renderer.destroy();
        throw e;
      }
      console.warn('[export] audio mixing/encoding failed; exporting video only:', e);
      audio = null;
      audioDropped = true;
    }
  }

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height },
    audio: audio ? { codec: 'aac', sampleRate: audio.sampleRate, numberOfChannels: audio.numberOfChannels } : undefined,
    fastStart: 'in-memory',
  });

  const encodedChunks: { chunk: EncodedVideoChunk; meta?: EncodedVideoChunkMetadata }[] = [];
  let encodeError: Error | null = null;

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      encodedChunks.push({ chunk, meta: meta ?? undefined });
    },
    error: (e) => {
      encodeError = e instanceof Error ? e : new Error(String(e));
    },
  });

  encoder.configure({
    codec,
    width,
    height,
    bitrate,
    framerate: frameRate,
  });

  // Everything from here can throw (decode/render/encode/GPU-loss); the finally guarantees the
  // offscreen GPU device + buffered VideoFrames are always released, so a failed export can't leak a
  // GPU device or frame memory (repeated failed exports used to accumulate both).
  // Drop any frames the shared scheduler buffered during preview BEFORE the loop. Preview scrubbing of
  // a >1080p asset leaves half-res PROXY frames buffered; the per-frame reuse guard below would then
  // composite those soft frames into the export. Clearing once here forces every export frame to be
  // decoded fresh at full resolution via decodeFrameForExport (which bypasses proxy). Injected export
  // frames still accumulate and are reused across comp frames that share a source index.
  frameScheduler.releaseBufferedFrames();

  try {
    for (let frame = 0; frame < totalFrames; frame++) {
      if (signal?.aborted) throw new Error('Export cancelled');
      if (encodeError) throw encodeError;

      const renderData = resolveFrame(composition, frame, { getComposition, depth: 0, visited: new Set() });

      // Pre-decode video frames at full resolution for this composition frame. A frame-blended /
      // optical-flow-retimed clip also needs its B frame (sourceFrameB): the renderer's flow-warp pass
      // reads it via frameScheduler.getFrame and silently falls back to the crisp A frame when it's
      // missing, so without decoding B here the export would drop the blend the preview shows.
      const videoDecodePromises: Promise<void>[] = [];
      for (const { assetId, frame: sourceFrame } of collectExportVideoDecodes(renderData.layers)) {
        if (frameScheduler.getFrame(assetId, sourceFrame)) continue;
        videoDecodePromises.push(
          videoDecoderPool.decodeFrameForExport(assetId, sourceFrame).then((decoded) => {
            frameScheduler.injectFrame(assetId, sourceFrame, decoded);
          })
        );
      }
      if (videoDecodePromises.length > 0) {
        await Promise.all(videoDecodePromises);
      }

      await renderer.renderFrameAsync(renderData, 'offscreen');

      const videoFrame = new VideoFrame(canvas, {
        timestamp: frameTimestampUs(frame, frameRate),
        duration: frameDurationUs(frameRate),
      });
      encoder.encode(videoFrame, { keyFrame: isExportKeyframe(frame, frameRate) });
      videoFrame.close();

      // Backpressure: let the encoder drain, but honour cancellation + encode errors while we wait
      // (otherwise a stalled encoder could hang here forever and Cancel wouldn't respond).
      if (encoder.encodeQueueSize > 5) {
        await new Promise<void>((resolve, reject) => {
          const check = () => {
            if (signal?.aborted) { reject(new Error('Export cancelled')); return; }
            if (encodeError) { reject(encodeError); return; }
            if (encoder.encodeQueueSize <= 2) resolve();
            else setTimeout(check, 1);
          };
          check();
        });
      }

      const percent = Math.round(((frame + 1) / totalFrames) * 95);
      onProgress?.({
        phase: 'rendering',
        currentFrame: frame + 1,
        totalFrames,
        percent,
        message: `Rendering frame ${frame + 1} / ${totalFrames}`,
      });
    }

    await encoder.flush();
    // An error can arrive via the async error callback during/after flush - re-check before muxing so
    // a corrupt tail chunk isn't shipped as a finished file.
    if (encodeError) throw encodeError;

    onProgress?.({
      phase: 'finalizing',
      currentFrame: totalFrames,
      totalFrames,
      percent: 97,
      message: 'Building MP4 file...',
    });

    // The encode must have produced exactly one chunk per frame. Zero = structurally-broken MP4;
    // a mismatch = a truncated video track (while the audio track is full-length) that would play
    // wrong. Both fail loudly rather than handing back a silently-broken file.
    if (encodedChunks.length === 0) {
      throw new Error('Export produced no video frames. Please try again.');
    }
    if (encodedChunks.length !== totalFrames) {
      throw new Error(`Export incomplete: encoded ${encodedChunks.length} of ${totalFrames} frames. Please try again.`);
    }

    for (const { chunk, meta } of encodedChunks) {
      muxer.addVideoChunk(chunk, meta);
    }
    if (audio) {
      for (const { chunk, meta } of audio.chunks) {
        muxer.addAudioChunk(chunk, meta);
      }
    }
    muxer.finalize();

    const blob = new Blob([target.buffer], { type: 'video/mp4' });

    // Final sanity check - a valid MP4 with even one frame is always well over 1KB (container boxes +
    // at least one encoded frame). Anything smaller is broken; don't hand it back as "done".
    if (blob.size < 1024) {
      throw new Error('Export produced an empty or invalid file. Please try again.');
    }

    onProgress?.({
      phase: 'done',
      currentFrame: totalFrames,
      totalFrames,
      percent: 100,
      message: audioDropped
        ? `Export complete (without audio) - ${formatFileSize(blob.size)}`
        : `Export complete - ${formatFileSize(blob.size)}`,
    });

    return blob;
  } finally {
    try { if (encoder.state !== 'closed') encoder.close(); } catch { /* already closed */ }
    renderer.destroy();
    frameScheduler.releaseBufferedFrames();
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function estimateDuration(frameRate: number, totalFrames: number): string {
  const seconds = totalFrames / frameRate;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}
