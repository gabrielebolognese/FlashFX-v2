import type { VideoMetadata } from './videoWorker.types';

// Animated-image decode backend (GIF / animated WebP / APNG / AVIF) using the browser ImageDecoder.
// It mirrors mediabunnyController's public shape so videoDecoderPool can route an animated image through
// the SAME video pipeline (frameScheduler -> videoTextureCache -> renderer + exporter) as real video -
// which is why an animated GIF plays and exports "for free" once it's modelled as a video asset.
// ImageDecoder is Chromium-only; callers gate on isAnimatedImage()/availability and fall back to a
// static first-frame image where it is missing (no regression). decode() returns a VideoFrame, exactly
// what the frame pipeline already accepts.

function hasImageDecoder(): boolean {
  return typeof (globalThis as { ImageDecoder?: unknown }).ImageDecoder === 'function';
}

function guessType(source: File | string): string {
  const name = typeof source === 'string' ? source : source.name;
  const mime = typeof source === 'string' ? '' : source.type;
  if (mime && mime.startsWith('image/')) return mime;
  const ext = (name.split('?')[0].split('.').pop() || '').toLowerCase();
  if (ext === 'webp') return 'image/webp';
  if (ext === 'apng') return 'image/apng';
  if (ext === 'avif') return 'image/avif';
  return 'image/gif';
}

/** True if `file` decodes to more than one frame (an animated GIF/WebP/APNG/AVIF). Fast: reads the
 *  track header, not the frames. false when ImageDecoder is unavailable or on any error. */
export async function isAnimatedImage(file: File): Promise<boolean> {
  if (!hasImageDecoder()) return false;
  try {
    const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: guessType(file) });
    await decoder.tracks.ready;
    const n = decoder.tracks.selectedTrack?.frameCount ?? 1;
    decoder.close();
    return n > 1;
  } catch {
    return false;
  }
}

interface AssetCtl { decoder: ImageDecoder; metadata: VideoMetadata; frameCount: number }

class ImageDecoderController {
  private assets = new Map<string, AssetCtl>();
  private initInflight = new Map<string, Promise<VideoMetadata>>();

  async initAsset(assetId: string, source: File | string): Promise<VideoMetadata> {
    const existing = this.assets.get(assetId);
    if (existing) return existing.metadata;
    const inflight = this.initInflight.get(assetId);
    if (inflight) return inflight;
    const p = this._init(assetId, source);
    this.initInflight.set(assetId, p);
    try { return await p; } finally { this.initInflight.delete(assetId); }
  }

  private async _init(assetId: string, source: File | string): Promise<VideoMetadata> {
    if (!hasImageDecoder()) throw new Error('ImageDecoder unavailable');
    const data = typeof source === 'string' ? await (await fetch(source)).arrayBuffer() : await source.arrayBuffer();
    const decoder = new ImageDecoder({ data, type: guessType(source) });
    await decoder.tracks.ready;
    const frameCount = Math.max(1, decoder.tracks.selectedTrack?.frameCount ?? 1);
    // Frame 0 gives dimensions + the per-frame delay. Assume a near-uniform delay for the frame rate
    // (true for the vast majority of GIFs); exact per-frame timing would need a duration table (later).
    const first = await decoder.decode({ frameIndex: 0, completeFramesOnly: true });
    const w = first.image.displayWidth || first.image.codedWidth || 1;
    const h = first.image.displayHeight || first.image.codedHeight || 1;
    const perFrameUs = first.image.duration && first.image.duration > 0 ? first.image.duration : 100_000; // 100ms default
    first.image.close();
    const fps = Math.max(1, Math.min(60, 1_000_000 / perFrameUs));
    const metadata: VideoMetadata = { frameCount, frameRate: fps, width: w, height: h, duration: frameCount / fps, codec: 'gif', rotation: 0 };
    this.assets.set(assetId, { decoder, metadata, frameCount });
    return metadata;
  }

  getMetadata(assetId: string): VideoMetadata | null {
    return this.assets.get(assetId)?.metadata ?? null;
  }

  async decodeFrame(assetId: string, frameIndex: number): Promise<VideoFrame> {
    const ctl = this.assets.get(assetId);
    if (!ctl) throw new Error(`ImageDecoder: asset ${assetId} not initialized`);
    const i = Math.max(0, Math.min(Math.round(frameIndex), ctl.frameCount - 1));
    const { image } = await ctl.decoder.decode({ frameIndex: i, completeFramesOnly: true });
    return image; // the caller (scheduler / texture cache) owns and closes it
  }

  decodeFrameForExport(assetId: string, frameIndex: number): Promise<VideoFrame> {
    return this.decodeFrame(assetId, frameIndex);
  }

  setProxyMode(): void { /* no-op: animated-image frames aren't proxy-scaled */ }

  async destroyAsset(assetId: string): Promise<void> {
    const ctl = this.assets.get(assetId);
    if (!ctl) return;
    this.assets.delete(assetId);
    try { ctl.decoder.close(); } catch { /* ignore */ }
  }
}

export const imageDecoderController = new ImageDecoderController();
