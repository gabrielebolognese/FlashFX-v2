import type { Composition } from '../core/types';
import { resolveFrame } from '../core/interpolation';
import { WebGPURenderer } from '../engine/renderer';
import { EXPORT_MOTION_BLUR_SAMPLES } from '../store/preview';
import { videoDecoderPool } from '../engine/video/videoDecoderPool';
import { frameScheduler } from '../engine/video/frameScheduler';
import { exportCompositionAudio, type EncodedAudio } from './audioMixer';

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
  signal?: AbortSignal
): Promise<Blob> {
  const width = settings.width ?? composition.settings.width;
  const height = settings.height ?? composition.settings.height;
  const frameRate = settings.frameRate ?? composition.settings.frameRate;
  const bitrate = settings.bitrate ?? 8_000_000;
  const codec = settings.codec ?? 'avc1.42001f';
  const totalFrames = composition.settings.durationFrames;

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

  // Mix + encode audio up front — the muxer needs the audio track configured at
  // construction. Failures are non-fatal: we fall back to a video-only export.
  let audio: EncodedAudio | null = null;
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


  for (let frame = 0; frame < totalFrames; frame++) {
    if (signal?.aborted) {
      encoder.close();
      renderer.destroy();
      throw new Error('Export cancelled');
    }
    if (encodeError) {
      encoder.close();
      renderer.destroy();
      throw encodeError;
    }

    const renderData = resolveFrame(composition, frame);

    // Pre-decode video frames at full resolution for this composition frame
    const videoDecodePromises: Promise<void>[] = [];
    for (const layer of renderData.layers) {
      if (layer.layerType === 'video' && layer.video) {
        const { assetId, sourceFrame } = layer.video;
        const existing = frameScheduler.getFrame(assetId, sourceFrame);
        if (!existing) {
          videoDecodePromises.push(
            videoDecoderPool.decodeFrameForExport(assetId, sourceFrame).then((decoded) => {
              frameScheduler.injectFrame(assetId, sourceFrame, decoded);
            })
          );
        }
      }
    }
    if (videoDecodePromises.length > 0) {
      await Promise.all(videoDecodePromises);
    }

    await renderer.renderFrameAsync(renderData, 'offscreen');

    const timestamp = Math.round((frame * 1_000_000) / frameRate);
    const duration = Math.round(1_000_000 / frameRate);

    const videoFrame = new VideoFrame(canvas, { timestamp, duration });
    const keyFrame = frame % (frameRate * 2) === 0;
    encoder.encode(videoFrame, { keyFrame });
    videoFrame.close();

    if (encoder.encodeQueueSize > 5) {
      await new Promise<void>((resolve) => {
        const check = () => {
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

  try {
    await encoder.flush();
  } catch (e) {
    renderer.destroy();
    throw e;
  }
  encoder.close();

  onProgress?.({
    phase: 'finalizing',
    currentFrame: totalFrames,
    totalFrames,
    percent: 97,
    message: 'Building MP4 file...',
  });

  for (const { chunk, meta } of encodedChunks) {
    muxer.addVideoChunk(chunk, meta);
  }

  if (audio) {
    for (const { chunk, meta } of audio.chunks) {
      muxer.addAudioChunk(chunk, meta);
    }
  }

  muxer.finalize();
  renderer.destroy();

  const blob = new Blob([target.buffer], { type: 'video/mp4' });

  onProgress?.({
    phase: 'done',
    currentFrame: totalFrames,
    totalFrames,
    percent: 100,
    message: `Export complete - ${formatFileSize(blob.size)}`,
  });

  return blob;
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
