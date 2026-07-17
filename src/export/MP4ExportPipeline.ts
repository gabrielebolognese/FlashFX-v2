import { DeterministicRenderer } from './DeterministicRenderer';
import { FFmpegEncoder, EncodingProgress } from './FFmpegEncoder';
import { DesignElement } from '../types/design';
import { BackgroundConfig } from '../types/background';
import { ElementAnimation } from '../animation-engine/types';

export interface MP4ExportConfig {
  width: number;
  height: number;
  fps: number;
  duration: number;
  projectName: string;
}

export interface MP4ExportProgress {
  status: 'idle' | 'loading' | 'capturing' | 'encoding' | 'completed' | 'error';
  currentFrame: number;
  totalFrames: number;
  percentage: number;
  estimatedTimeRemaining: number;
  message: string;
  startTime: number | null;
}

export class MP4ExportPipeline {
  private renderer: DeterministicRenderer;
  private encoder: FFmpegEncoder;
  private aborted = false;

  constructor() {
    this.renderer = new DeterministicRenderer();
    this.encoder = new FFmpegEncoder();
  }

  abort() {
    this.aborted = true;
  }

  async export(
    config: MP4ExportConfig,
    elements: DesignElement[],
    animations: Record<string, ElementAnimation>,
    background: BackgroundConfig | undefined,
    onProgress?: (progress: MP4ExportProgress) => void
  ): Promise<Blob> {
    this.aborted = false;
    const totalFrames = Math.ceil(config.duration * config.fps);
    const startTime = Date.now();

    const report = (
      status: MP4ExportProgress['status'],
      currentFrame: number,
      message: string
    ) => {
      if (!onProgress) return;
      const elapsed = (Date.now() - startTime) / 1000;
      const fps = currentFrame > 0 ? currentFrame / elapsed : 0;
      const remaining = fps > 0 ? (totalFrames - currentFrame) / fps : 0;
      onProgress({
        status,
        currentFrame,
        totalFrames,
        percentage: totalFrames > 0 ? Math.round((currentFrame / totalFrames) * 100) : 0,
        estimatedTimeRemaining: remaining,
        message,
        startTime,
      });
    };

    try {
      report('loading', 0, 'Loading encoder...');
      this.encoder.setProgressCallback((ep: EncodingProgress) => {
        const pct = Math.round(ep.progress * 100);
        onProgress?.({
          status: 'encoding',
          currentFrame: totalFrames,
          totalFrames,
          percentage: pct,
          estimatedTimeRemaining: 0,
          message: ep.message,
          startTime,
        });
      });
      await this.encoder.load();

      if (this.aborted) throw new Error('Export cancelled');

      report('capturing', 0, 'Preloading assets...');

      const imageElements = elements.filter(el => el.type === 'image' && el.imageData);
      if (imageElements.length > 0) {
        await Promise.all(imageElements.map(el => {
          return new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = el.imageData!;
          });
        }));
      }

      this.renderer.prepareEngine(animations, config.fps, config.duration);

      for (let i = 0; i < totalFrames; i++) {
        if (this.aborted) throw new Error('Export cancelled');

        const time = i / config.fps;

        const blob = await this.renderer.renderFrameToBlob(
          elements,
          animations,
          time,
          config.width,
          config.height,
          background,
          'png',
          1
        );

        const data = new Uint8Array(await blob.arrayBuffer());
        await this.encoder.writeFrame(i, data);

        report('capturing', i + 1, `Capturing frame ${i + 1} of ${totalFrames}`);

        if (i % 5 === 0) {
          await new Promise(r => setTimeout(r, 0));
        }
      }

      if (this.aborted) throw new Error('Export cancelled');

      report('encoding', totalFrames, 'Encoding MP4 with H.264...');

      const mp4Blob = await this.encoder.encode(
        config.fps,
        totalFrames,
        config.width,
        config.height
      );

      report('completed', totalFrames, 'Export complete!');

      return mp4Blob;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Export failed';
      onProgress?.({
        status: 'error',
        currentFrame: 0,
        totalFrames,
        percentage: 0,
        estimatedTimeRemaining: 0,
        message: msg,
        startTime,
      });
      throw error;
    } finally {
      this.renderer.cleanup();
      this.encoder.terminate();
    }
  }

  static downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
