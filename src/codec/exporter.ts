import type { Composition } from '../core/types';
import { resolveFrame } from '../core/interpolation';
import { WebGPURenderer } from '../engine/renderer';
import { EXPORT_MOTION_BLUR_SAMPLES } from '../store/preview';
import { videoDecoderPool } from '../engine/video/videoDecoderPool';
import { frameScheduler } from '../engine/video/frameScheduler';
import { mediaAssetManager } from '../engine/media/assetManager';
import { exportCompositionAudio, type EncodedAudio } from './audioMixer';
import {
  normalizeExportDimensions, validateExportTiming,
  frameTimestampUs, frameDurationUs, isExportKeyframe,
  collectExportVideoDecodes, exportOutputFrameCount, exportCompFrame,
} from './exportMath';
import {
  EXPORT_STALL_TIMEOUT_MS, EXPORT_QUEUE_HIGH, EXPORT_QUEUE_LOW, EXPORT_ACCEL_LADDER,
  isExportStalled, shouldRetryWithSoftware, formatAdapterInfo, formatExportDiagnostics,
  type ExportAccel, type ExportDiagnostics,
} from './exportRuntime';
import { projectExportSizeBytes } from './exportEstimate';
import { readDeviceMemoryGB } from './exportMemory';

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
  /** Live projection of the final file size (bytes), extrapolated from real encoded bytes. Present once
   *  at least one frame has been encoded - the honest, calibrated number (unlike the pre-export hint). */
  projectedBytes?: number;
}

export interface ExportResult {
  blob: Blob;
  /** Audio was requested but the file has NONE (mixing/AAC-encoding failed or was unavailable). The UI
   *  should tell the user the export is silent rather than presenting a clean success. */
  audioDropped: boolean;
}

/** An export failure that carries a copyable diagnostics block (build, GPU, codec, frame it stopped on)
 *  for a bug report. Thrown only after every encoder path has been tried. */
export interface ExportError extends Error {
  diagnostics?: ExportDiagnostics;
  diagnosticsText?: string;
}

/** Stall error: a wait exceeded EXPORT_STALL_TIMEOUT_MS with no encoder progress (wedged encoder/GPU). */
function makeStall(label: string): Error {
  return new Error(
    `Export stalled: no encoder progress for ${Math.round(EXPORT_STALL_TIMEOUT_MS / 1000)}s (${label}). The video encoder may have failed.`,
  );
}

function makeExportError(cause: Error | null, d: ExportDiagnostics): ExportError {
  const e = new Error(cause?.message || 'Export failed') as ExportError;
  e.diagnostics = { ...d };
  e.diagnosticsText = formatExportDiagnostics(d);
  return e;
}

export async function exportToMp4(
  composition: Composition,
  settings: Partial<ExportSettings> = {},
  onProgress?: (progress: ExportProgress) => void,
  signal?: AbortSignal,
  // Registry lookup so precomp layers resolve their sub-compositions during export.
  // Without it, resolveFrame gets no ResolveContext and every precomp renders blank.
  getComposition?: (id: string) => Composition | undefined,
): Promise<ExportResult> {
  // H.264 requires even dimensions; round down (and reject a blank/degenerate size). Pure + validated.
  const { width, height } = normalizeExportDimensions(
    settings.width ?? composition.settings.width,
    settings.height ?? composition.settings.height,
  );
  // The composition is authored at compFps; the user may export at a different fps. We RESAMPLE (below)
  // so real duration + speed are preserved - rendering the comp's frame count at a different rate would
  // silently re-time the video. exportFps drives the emitted frames + timestamps; compFps drives which
  // comp frame each output frame samples, and the (continuous) audio mix.
  const exportFps = settings.frameRate ?? composition.settings.frameRate;
  const compFps = composition.settings.frameRate;
  const durationFrames = composition.settings.durationFrames;
  const bitrate = settings.bitrate ?? 8_000_000;
  const codec = settings.codec ?? 'avc1.42001f';

  // Pre-flight: fail fast and clearly on an empty/invalid composition rather than spinning up the
  // renderer + encoder only to produce a broken file. Both fps matter (compFps for resampling).
  validateExportTiming(durationFrames, exportFps);
  if (!Number.isFinite(compFps) || compFps <= 0) {
    throw new Error('Nothing to export - the composition has an invalid frame rate.');
  }
  // Number of frames to EMIT at exportFps, preserving real duration (equal fps -> durationFrames).
  const totalFrames = exportOutputFrameCount(durationFrames, compFps, exportFps);

  // WebCodecs + codec preflight BEFORE any renderer/audio work, so an unsupported browser or an
  // unsupported H.264 profile (e.g. 4K High profile on some GPUs) fails fast with a clear message
  // instead of throwing raw errors mid-export.
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('Video export needs WebCodecs, which this browser does not support. Use a recent Chromium-based browser.');
  }
  const support = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate: exportFps });
  if (support.supported === false) {
    throw new Error(`This browser or GPU does not support the selected export quality (${codec} at ${width}x${height}). Try a lower quality or resolution.`);
  }

  // Diagnostics, filled in as we learn more; attached to the error if every encoder path fails.
  const diag: ExportDiagnostics = {
    appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    deviceMemoryGB: readDeviceMemoryGB() ?? null,
    gpu: '',
    codec,
    width,
    height,
    bitrate,
    framerate: exportFps,
    hardwareAcceleration: 'no-preference',
    configSupported: support.supported ?? null,
    stoppedAtFrame: null,
    totalFrames,
    reason: '',
  };

  onProgress?.({ phase: 'initializing', currentFrame: 0, totalFrames, percent: 0, message: 'Setting up renderer...' });

  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');

  const renderer = new WebGPURenderer();
  const ok = await renderer.initializeOffscreen(width, height);
  if (!ok) {
    throw new Error('WebGPU not available for export');
  }
  diag.gpu = formatAdapterInfo(renderer.getAdapterInfo());
  // Export always renders motion blur at full quality so output matches the
  // full-quality preview (Preview = Export).
  renderer.setMotionBlurSamples(EXPORT_MOTION_BLUR_SAMPLES);
  // Export decodes ORIGINAL (coded) frames and never routes through the upright __proxy, so the shader
  // must apply the original container rotation (see renderer.exportMode / srcRotation).
  renderer.setExportMode(true);

  const canvas = renderer.getOffscreenCanvas()!;

  // Mix + encode audio up front - the muxer needs the audio track configured at construction. Mixed ONCE
  // and reused across encoder attempts (it is independent of the video encoder). Failures are non-fatal:
  // we fall back to a video-only export.
  let audio: EncodedAudio | null = null;
  let audioDropped = false; // audio was requested but couldn't be produced (surfaced to the user)
  if (settings.includeAudio ?? true) {
    onProgress?.({ phase: 'initializing', currentFrame: 0, totalFrames, percent: 1, message: 'Mixing audio...' });
    try {
      // Audio is continuous, so it is mixed in REAL time at the composition fps (not the export fps and
      // not the resampled output-frame count); durationFrames/compFps = the true duration the video also
      // spans, so A/V stay in sync regardless of the export fps.
      const mix = await exportCompositionAudio(composition, { frameRate: compFps, durationFrames }, signal);
      audio = mix.audio;
      // Audible sources existed but no AAC track could be produced (e.g. a browser without AAC encode):
      // the file will be silent DESPITE having audio, so flag it rather than reporting a clean success.
      if (mix.droppedForEncoding) audioDropped = true;
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

  // Total encoded-audio bytes (for the live size projection: video is extrapolated, audio is known).
  let audioBytesTotal = 0;
  if (audio) for (const { chunk } of audio.chunks) audioBytesTotal += chunk.byteLength;

  // One encode attempt with a specific acceleration. Fresh encoder + muxer + chunk buffer each time, so a
  // software retry after a hardware wedge starts clean. Re-rendering from frame 0 is deterministic and
  // safe. Throws on cancel / encoder error / stall; the caller decides whether to retry with software.
  const attemptEncode = async (hwAccel: ExportAccel): Promise<Blob> => {
    diag.hardwareAcceleration = hwAccel;

    // Probe THIS acceleration so an unavailable software encoder gives a clear message (not a raw throw).
    let probedSupported: boolean | null = null;
    try {
      const s = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate: exportFps, hardwareAcceleration: hwAccel });
      probedSupported = s.supported ?? null;
    } catch {
      probedSupported = null; // some engines reject the probe itself; fall through and let configure() decide
    }
    diag.configSupported = probedSupported;
    if (probedSupported === false) {
      throw new Error(hwAccel === 'prefer-software'
        ? 'No software H.264 encoder is available in this browser.'
        : 'This browser or GPU does not support the selected export configuration.');
    }

    // Drop any frames the shared scheduler buffered during preview (half-res PROXY frames) so every export
    // frame is decoded fresh at full resolution. Done per attempt so a retry also starts clean.
    frameScheduler.releaseBufferedFrames();

    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: 'avc', width, height },
      audio: audio ? { codec: 'aac', sampleRate: audio.sampleRate, numberOfChannels: audio.numberOfChannels } : undefined,
      fastStart: 'in-memory',
    });

    const encodedChunks: { chunk: EncodedVideoChunk; meta?: EncodedVideoChunkMetadata }[] = [];
    let encodeError: Error | null = null;
    let encodedBytesSoFar = 0;
    let lastAdvanceTs = performance.now();

    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        encodedChunks.push({ chunk, meta: meta ?? undefined });
        encodedBytesSoFar += chunk.byteLength;
        lastAdvanceTs = performance.now(); // a chunk coming out is progress
      },
      error: (e) => {
        encodeError = e instanceof Error ? e : new Error(String(e));
      },
    });

    // Bounded wait: resolve `p`, but reject on cancel / encoder error / stall (no encoder progress for
    // EXPORT_STALL_TIMEOUT_MS). This is what makes a wedged encoder impossible to hang on - every await in
    // the loop goes through it, and `isExportStalled` returns true once the wall clock passes the timeout.
    const guard = <T>(p: Promise<T>, label: string): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        let done = false;
        let timer: ReturnType<typeof setTimeout>;
        const settle = (fn: () => void) => { if (!done) { done = true; clearTimeout(timer); fn(); } };
        const tick = () => {
          if (done) return;
          if (signal?.aborted) return settle(() => reject(new Error('Export cancelled')));
          if (encodeError) return settle(() => reject(encodeError));
          if (isExportStalled(performance.now(), lastAdvanceTs)) return settle(() => reject(makeStall(label)));
          timer = setTimeout(tick, 250);
        };
        timer = setTimeout(tick, 250);
        p.then((v) => settle(() => resolve(v)), (e) => settle(() => reject(e)));
      });

    try {
      // configure() can throw synchronously on an invalid config; inside the try so the encoder is still
      // closed by the finally (and the caller can fall back to software).
      encoder.configure({ codec, width, height, bitrate, framerate: exportFps, hardwareAcceleration: hwAccel });

      for (let frame = 0; frame < totalFrames; frame++) {
        if (signal?.aborted) throw new Error('Export cancelled');
        if (encodeError) throw encodeError;
        diag.stoppedAtFrame = frame;
        lastAdvanceTs = performance.now(); // starting a frame is progress

        // `frame` is the OUTPUT frame index (at exportFps). Resolve the composition frame it samples in
        // real time; identity when exportFps == compFps.
        const compFrame = exportCompFrame(frame, durationFrames, compFps, exportFps);
        const renderData = resolveFrame(composition, compFrame, { getComposition, depth: 0, visited: new Set() });

        // Pre-decode video frames at full resolution for this composition frame (plus the frame-blend B
        // frame when active - see collectExportVideoDecodes), or the export would drop what the preview shows.
        const videoDecodePromises: Promise<void>[] = [];
        for (const { assetId, frame: sourceFrame } of collectExportVideoDecodes(renderData.layers)) {
          if (frameScheduler.getFrame(assetId, sourceFrame)) continue;
          videoDecodePromises.push(
            videoDecoderPool.decodeFrameForExport(assetId, sourceFrame).then((decoded) => {
              frameScheduler.injectFrame(assetId, sourceFrame, decoded);
            }),
          );
        }
        if (videoDecodePromises.length > 0) {
          lastAdvanceTs = performance.now();
          await guard(Promise.all(videoDecodePromises), 'video-decode');
        }

        // Images decode lazily, so ensure every image layer in THIS frame is resident before rendering.
        const imageEnsures: Promise<unknown>[] = [];
        for (const l of renderData.layers) {
          if (l.layerType === 'image' && l.image?.assetId) {
            imageEnsures.push(mediaAssetManager.ensureImageBitmap(l.image.assetId));
          }
        }
        if (imageEnsures.length > 0) {
          lastAdvanceTs = performance.now();
          await guard(Promise.all(imageEnsures), 'image-decode');
        }

        lastAdvanceTs = performance.now();
        await guard(renderer.renderFrameAsync(renderData, 'offscreen'), 'render');

        const videoFrame = new VideoFrame(canvas, {
          timestamp: frameTimestampUs(frame, exportFps),
          duration: frameDurationUs(exportFps),
        });
        encoder.encode(videoFrame, { keyFrame: isExportKeyframe(frame, exportFps) });
        videoFrame.close();
        lastAdvanceTs = performance.now(); // an accepted encode is progress

        // Backpressure: let the encoder drain. The guard rejects on cancel/error/stall, so a wedged
        // encoder (queue never drains, no error fired) can no longer hang here forever.
        if (encoder.encodeQueueSize > EXPORT_QUEUE_HIGH) {
          await guard(
            new Promise<void>((resolve) => {
              const poll = () => { if (encoder.encodeQueueSize <= EXPORT_QUEUE_LOW) resolve(); else setTimeout(poll, 30); };
              poll();
            }),
            'encoder-backpressure',
          );
        }

        const percent = Math.round(((frame + 1) / totalFrames) * 95);
        const projectedBytes = projectExportSizeBytes(encodedBytesSoFar, encodedChunks.length, totalFrames, audioBytesTotal) ?? undefined;
        onProgress?.({
          phase: 'rendering',
          currentFrame: frame + 1,
          totalFrames,
          percent,
          message: `Rendering frame ${frame + 1} / ${totalFrames}`,
          projectedBytes,
        });
      }

      await guard(encoder.flush(), 'flush');
      // An error can arrive via the async error callback during/after flush - re-check before muxing so a
      // corrupt tail chunk isn't shipped as a finished file.
      if (encodeError) throw encodeError;

      onProgress?.({ phase: 'finalizing', currentFrame: totalFrames, totalFrames, percent: 97, message: 'Building MP4 file...' });

      // Exactly one chunk per frame. Zero = structurally-broken MP4; a mismatch = a truncated video track
      // (while audio is full-length) that would play wrong. Both fail loudly.
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
      // A valid MP4 with even one frame is well over 1KB; anything smaller is broken.
      if (blob.size < 1024) {
        throw new Error('Export produced an empty or invalid file. Please try again.');
      }
      diag.stoppedAtFrame = null; // completed cleanly
      return blob;
    } finally {
      try { if (encoder.state !== 'closed') encoder.close(); } catch { /* already closed */ }
    }
  };

  // Everything from here can throw (decode/render/encode/GPU-loss); the finally guarantees the offscreen
  // GPU device + buffered VideoFrames are always released, so a failed export can't leak a GPU device or
  // frame memory.
  try {
    // Try the browser default (usually hardware) first; if it wedges or errors, retry once with a forced
    // software encoder (the fix for a wedged hardware H.264 encoder). A cancellation is never retried.
    let blob: Blob | null = null;
    let lastError: Error | null = null;
    for (let i = 0; i < EXPORT_ACCEL_LADDER.length; i++) {
      const hwAccel = EXPORT_ACCEL_LADDER[i];
      try {
        blob = await attemptEncode(hwAccel);
        break;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        if (err.message === 'Export cancelled') throw err; // user cancel: propagate, never retry
        lastError = err;
        const triedSoftware = hwAccel === 'prefer-software';
        if (shouldRetryWithSoftware({ cancelled: false, triedSoftware })) {
          console.warn(`[export] ${hwAccel} attempt failed (${err.message}); retrying with a software encoder.`);
          onProgress?.({ phase: 'initializing', currentFrame: 0, totalFrames, percent: 1, message: 'Hardware encoder failed; retrying with a software encoder...' });
          continue;
        }
        break;
      }
    }

    if (!blob) {
      diag.reason = lastError?.message ?? 'unknown error';
      throw makeExportError(lastError, diag);
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

    return { blob, audioDropped };
  } finally {
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
