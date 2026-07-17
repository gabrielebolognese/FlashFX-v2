import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

export interface EncodingProgress {
  phase: 'loading' | 'writing' | 'encoding' | 'finalizing';
  progress: number;
  message: string;
}

const CORE_VERSION = '0.12.6';
const BASE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

export class FFmpegEncoder {
  private ffmpeg: FFmpeg | null = null;
  private loaded = false;
  private progressCallback: ((p: EncodingProgress) => void) | null = null;

  setProgressCallback(callback: (p: EncodingProgress) => void) {
    this.progressCallback = callback;
  }

  private report(phase: EncodingProgress['phase'], progress: number, message: string) {
    this.progressCallback?.({ phase, progress, message });
  }

  async load(): Promise<void> {
    if (this.loaded && this.ffmpeg) return;

    this.report('loading', 0, 'Downloading encoder...');

    this.ffmpeg = new FFmpeg();

    this.ffmpeg.on('progress', ({ progress }) => {
      const pct = Math.max(0, Math.min(1, progress));
      this.report('encoding', pct, `Encoding: ${Math.round(pct * 100)}%`);
    });

    const coreURL = await toBlobURL(`${BASE_URL}/ffmpeg-core.js`, 'text/javascript');
    const wasmURL = await toBlobURL(`${BASE_URL}/ffmpeg-core.wasm`, 'application/wasm');

    await this.ffmpeg.load({ coreURL, wasmURL });
    this.loaded = true;
    this.report('loading', 1, 'Encoder ready');
  }

  async writeFrame(index: number, data: Uint8Array): Promise<void> {
    if (!this.ffmpeg) throw new Error('FFmpeg not loaded');
    const filename = `frame_${String(index).padStart(6, '0')}.png`;
    await this.ffmpeg.writeFile(filename, data);
  }

  async encode(fps: number, totalFrames: number, _width: number, _height: number): Promise<Blob> {
    if (!this.ffmpeg) throw new Error('FFmpeg not loaded');

    this.report('encoding', 0, 'Starting H.264 encoding...');

    let mp4Data: Uint8Array | null = null;

    try {
      await this.ffmpeg.exec([
        '-r', String(fps),
        '-i', 'frame_%06d.png',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'medium',
        '-crf', '23',
        '-movflags', '+faststart',
        '-y',
        'output.mp4',
      ]);

      this.report('finalizing', 0.9, 'Reading encoded file...');

      const result = await this.ffmpeg.readFile('output.mp4');
      mp4Data = result instanceof Uint8Array ? result : new TextEncoder().encode(result as string);
    } finally {
      for (let i = 0; i < totalFrames; i++) {
        const filename = `frame_${String(i).padStart(6, '0')}.png`;
        try { await this.ffmpeg?.deleteFile(filename); } catch { /* already cleaned */ }
      }
      try { await this.ffmpeg?.deleteFile('output.mp4'); } catch { /* already cleaned */ }
    }

    if (!mp4Data) throw new Error('Encoding produced no output');

    this.report('finalizing', 1, 'Encoding complete');

    return new Blob([mp4Data.buffer], { type: 'video/mp4' });
  }

  terminate() {
    try { this.ffmpeg?.terminate(); } catch { /* ignore */ }
    this.ffmpeg = null;
    this.loaded = false;
  }
}
