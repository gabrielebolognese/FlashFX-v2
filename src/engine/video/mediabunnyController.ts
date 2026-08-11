import { Input, BlobSource, ALL_FORMATS, VideoSampleSink, type InputVideoTrack } from 'mediabunny';
import type { VideoMetadata } from './videoWorker.types';

// mediabunny-backed video decode — the web-proven replacement for the hand-rolled mp4box + WebCodecs
// pump in videoWorker.ts (which delivered ~1 frame/2s and repeated maintenance pain). mediabunny does
// the demux, WebCodecs decode, B-frame reorder, backpressure and decode-ahead internally; we keep the
// integer SOURCE-FRAME-INDEX addressing the scheduler/renderer/export rely on by mapping index↔time.
// This is Phase 1: forward-playback decode behind the existing videoDecoderPool API, feature-flagged.
// (Runs on the main thread — WebCodecs decodes off-thread natively; OpenCut drives it the same way.)

interface AssetCtl {
  input: Input;
  track: InputVideoTrack;
  sink: VideoSampleSink;
  metadata: VideoMetadata;
  firstTs: number; // track's first presentation timestamp (seconds; may be non-zero/negative)
  fps: number;
  proxyScale: number;
}

class MediabunnyController {
  private assets = new Map<string, AssetCtl>();
  private initInflight = new Map<string, Promise<VideoMetadata>>();

  async initAsset(assetId: string, source: File | string): Promise<VideoMetadata> {
    const existing = this.assets.get(assetId);
    if (existing) return existing.metadata;
    const inflight = this.initInflight.get(assetId);
    if (inflight) return inflight;
    const p = this._init(assetId, source);
    this.initInflight.set(assetId, p);
    try {
      return await p;
    } finally {
      this.initInflight.delete(assetId);
    }
  }

  private async _init(assetId: string, source: File | string): Promise<VideoMetadata> {
    const blob: Blob = typeof source === 'string' ? await (await fetch(source)).blob() : source;
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error(`mediabunny: no video track in asset ${assetId}`);
    if (!(await track.canDecode())) {
      throw new Error(`mediabunny: browser cannot decode this codec (asset ${assetId})`);
    }

    const duration = await input.computeDuration();
    // computePacketStats gives a very accurate average frame rate without scanning the whole file.
    const stats = await track.computePacketStats(100);
    const fps = stats.averagePacketRate > 0 ? stats.averagePacketRate : 30;
    const firstTs = await track.getFirstTimestamp();
    const codec = await track.getCodec();
    const rotation = track.rotation;

    const metadata: VideoMetadata = {
      frameCount: Math.max(1, Math.round(duration * fps)),
      frameRate: fps,
      width: track.displayWidth,
      height: track.displayHeight,
      duration,
      codec: codec ? String(codec) : '',
      rotation: typeof rotation === 'number' ? rotation : 0,
    };

    const sink = new VideoSampleSink(track);
    this.assets.set(assetId, { input, track, sink, metadata, firstTs, fps, proxyScale: 1 });
    return metadata;
  }

  getMetadata(assetId: string): VideoMetadata | null {
    return this.assets.get(assetId)?.metadata ?? null;
  }

  // Land mid-frame so getSample's "last sample with start ts <= t" contract returns exactly frame
  // `frameIndex`, robust to sub-ms timestamp jitter. Offset by the track's first timestamp.
  private timeForIndex(ctl: AssetCtl, frameIndex: number): number {
    return ctl.firstTs + (Math.max(0, frameIndex) + 0.5) / ctl.fps;
  }

  async decodeFrame(assetId: string, frameIndex: number): Promise<VideoFrame> {
    const ctl = this.assets.get(assetId);
    if (!ctl) throw new Error(`mediabunny: asset ${assetId} not initialized`);
    const sample = await ctl.sink.getSample(this.timeForIndex(ctl, frameIndex));
    if (!sample) throw new Error(`mediabunny: no frame at index ${frameIndex} for ${assetId}`);
    try {
      // toVideoFrame() constructs an INDEPENDENT VideoFrame (verified: `new VideoFrame(underlying,…)`),
      // so the caller (frameScheduler) owns and closes it; we close the sample here.
      return sample.toVideoFrame();
    } finally {
      sample.close();
    }
  }

  async decodeFrameForExport(assetId: string, frameIndex: number): Promise<VideoFrame> {
    return this.decodeFrame(assetId, frameIndex); // full-res already (proxy not applied in Phase 1)
  }

  setProxyMode(assetId: string, scale: number): void {
    const ctl = this.assets.get(assetId);
    if (ctl) ctl.proxyScale = scale; // tracked; proxy downscale is a later phase (CanvasSink resize)
  }

  async destroyAsset(assetId: string): Promise<void> {
    const ctl = this.assets.get(assetId);
    if (!ctl) return;
    this.assets.delete(assetId);
    try {
      (ctl.input as unknown as { dispose?: () => void }).dispose?.();
    } catch {
      /* best-effort */
    }
  }
}

export const mediabunnyController = new MediabunnyController();
