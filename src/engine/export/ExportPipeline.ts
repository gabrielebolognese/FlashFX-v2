import type { RenderFrame, RenderElement } from '../core/types';
import { TimelineEngine } from '../core/TimelineEngine';
import { RenderPipeline } from '../renderer/RenderPipeline';

export interface ExportConfig {
  width: number;
  height: number;
  fps: number;
  duration: number;
  format: 'webm' | 'png-sequence';
  quality: number;
  videoBitrate: number;
}

export interface ExportProgress {
  status: 'idle' | 'preloading' | 'rendering' | 'encoding' | 'completed' | 'error';
  currentFrame: number;
  totalFrames: number;
  percentage: number;
  estimatedTimeRemaining: number;
  message: string;
}

export class ExportPipeline {
  private timeline: TimelineEngine;
  private renderer: RenderPipeline;
  private abortController: AbortController | null = null;

  constructor(timeline: TimelineEngine, renderer: RenderPipeline) {
    this.timeline = timeline;
    this.renderer = renderer;
  }

  async exportVideo(
    config: ExportConfig,
    elements: RenderElement[],
    background: RenderFrame['background'],
    onProgress?: (progress: ExportProgress) => void
  ): Promise<Blob> {
    this.abortController = new AbortController();
    const totalFrames = Math.ceil(config.duration * config.fps);
    const startTime = Date.now();

    const report = (
      status: ExportProgress['status'],
      frame: number,
      message: string
    ) => {
      if (!onProgress) return;
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = frame > 0 ? frame / elapsed : 0;
      const remaining = rate > 0 ? (totalFrames - frame) / rate : 0;
      onProgress({
        status,
        currentFrame: frame,
        totalFrames,
        percentage: Math.round((frame / totalFrames) * 100),
        estimatedTimeRemaining: remaining,
        message,
      });
    };

    report('preloading', 0, 'Loading assets...');
    await this.renderer.preloadAssets(elements);

    if (config.format === 'png-sequence') {
      return this.exportPngSequence(config, elements, background, totalFrames, report);
    }

    return this.exportWebM(config, elements, background, totalFrames, report);
  }

  private async exportWebM(
    config: ExportConfig,
    elements: RenderElement[],
    background: RenderFrame['background'],
    totalFrames: number,
    report: (status: ExportProgress['status'], frame: number, message: string) => void
  ): Promise<Blob> {
    const offscreen = this.renderer.createOffscreen(config.width, config.height);

    const stream = offscreen.canvas.captureStream(0);
    const mimeType = this.getSupportedMimeType();

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: config.videoBitrate || 8_000_000,
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.start();
    report('rendering', 0, 'Starting render...');

    for (let i = 0; i < totalFrames; i++) {
      if (this.abortController?.signal.aborted) {
        recorder.stop();
        throw new Error('Export cancelled');
      }

      const time = i / config.fps;
      const frame = this.timeline.resolveFrame(
        time, elements, config.width, config.height, background
      );

      this.renderer.renderFrame(frame, offscreen);

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && 'requestFrame' in videoTrack) {
        (videoTrack as unknown as { requestFrame: () => void }).requestFrame();
      }

      report('rendering', i + 1, `Rendering frame ${i + 1} of ${totalFrames}`);

      if (i % 5 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    report('encoding', totalFrames, 'Encoding video...');
    recorder.stop();

    return new Promise((resolve, reject) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        report('completed', totalFrames, 'Export complete');
        resolve(blob);
      };
      recorder.onerror = () => reject(new Error('MediaRecorder error'));
    });
  }

  private async exportPngSequence(
    config: ExportConfig,
    elements: RenderElement[],
    background: RenderFrame['background'],
    totalFrames: number,
    report: (status: ExportProgress['status'], frame: number, message: string) => void
  ): Promise<Blob> {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    report('rendering', 0, 'Starting render...');

    for (let i = 0; i < totalFrames; i++) {
      if (this.abortController?.signal.aborted) {
        throw new Error('Export cancelled');
      }

      const time = i / config.fps;
      const frame = this.timeline.resolveFrame(
        time, elements, config.width, config.height, background
      );

      const blob = await this.renderer.renderFrameToBlob(frame, 'png', 1);
      const padded = String(i).padStart(5, '0');
      zip.file(`frame_${padded}.png`, blob);

      report('rendering', i + 1, `Rendering frame ${i + 1} of ${totalFrames}`);

      if (i % 10 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    report('encoding', totalFrames, 'Creating ZIP archive...');
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    report('completed', totalFrames, 'Export complete');
    return zipBlob;
  }

  private getSupportedMimeType(): string {
    const types = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return 'video/webm';
  }

  abort(): void {
    this.abortController?.abort();
  }

  static downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
