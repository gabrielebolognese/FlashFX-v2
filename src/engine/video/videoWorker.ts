import { createFile, DataStream, type ISOFile as MP4File, type MP4BoxBuffer as MP4ArrayBuffer } from 'mp4box';
import type {
  WorkerInboundMessage,
  WorkerOutboundMessage,
  VideoMetadata,
} from './videoWorker.types';

type MP4Info = any;
type Sample = any;

// ---------------------------------------------------------------------------
// BYTE SOURCE ABSTRACTION
// ---------------------------------------------------------------------------

interface ByteSource {
  read(start: number, end: number): Promise<ArrayBuffer>;
  readonly totalSize: number;
}

class FileByteSource implements ByteSource {
  private file: File;
  get totalSize(): number { return this.file.size; }

  constructor(file: File) {
    this.file = file;
  }

  async read(start: number, end: number): Promise<ArrayBuffer> {
    const blob = this.file.slice(start, end);
    return blob.arrayBuffer();
  }
}

class UrlByteSource implements ByteSource {
  private url: string;
  private _totalSize = 0;
  get totalSize(): number { return this._totalSize; }

  constructor(url: string) {
    this.url = url;
  }

  async init(): Promise<void> {
    const resp = await fetch(this.url, { method: 'HEAD' });
    const cl = resp.headers.get('Content-Length');
    if (cl) {
      this._totalSize = parseInt(cl, 10);
    } else {
      const rangeResp = await fetch(this.url, { headers: { Range: 'bytes=0-0' } });
      const cr = rangeResp.headers.get('Content-Range');
      if (cr) {
        const total = cr.split('/')[1];
        this._totalSize = parseInt(total, 10);
      }
    }
  }

  async read(start: number, end: number): Promise<ArrayBuffer> {
    const resp = await fetch(this.url, {
      headers: { Range: `bytes=${start}-${end - 1}` },
    });
    return resp.arrayBuffer();
  }
}

// ---------------------------------------------------------------------------
// STREAMING DEMUXER
// ---------------------------------------------------------------------------

interface DemuxerAssetState {
  mp4file: MP4File;
  byteSource: ByteSource;
  samples: Sample[];
  keyframeIndices: number[];
  timescale: number;
  codecConfig: VideoDecoderConfig;
  width: number;
  height: number;
  frameRate: number;
  duration: number;
  frameCount: number;
  rotation: number;
  byteCache: Map<string, ArrayBuffer>;
}

const BYTE_CACHE_LIMIT = 64;
const COALESCE_GAP = 65536; // 64KB

class StreamingDemuxer {
  private assets = new Map<string, DemuxerAssetState>();

  async init(assetId: string, source: File | string): Promise<VideoMetadata> {
    let byteSource: ByteSource;
    if (source instanceof File) {
      if (source.size === 0) {
        throw new Error(`File is empty (0 bytes) for asset ${assetId}`);
      }
      byteSource = new FileByteSource(source);
    } else {
      const urlSource = new UrlByteSource(source);
      await urlSource.init();
      if (urlSource.totalSize === 0) {
        throw new Error(`File is empty (0 bytes) for asset ${assetId}`);
      }
      byteSource = urlSource;
    }

    const state = await this.parseFile(assetId, byteSource);
    this.assets.set(assetId, state);

    return {
      frameCount: state.frameCount,
      frameRate: state.frameRate,
      width: state.width,
      height: state.height,
      duration: state.duration,
      codec: state.codecConfig.codec,
      rotation: state.rotation,
    };
  }

  private parseFile(assetId: string, byteSource: ByteSource): Promise<DemuxerAssetState> {
    return new Promise(async (resolve, reject) => {
      const mp4file = createFile() as unknown as MP4File;
      let resolved = false;

      const samplesCollected: Sample[] = [];

      mp4file.onReady = (info: MP4Info) => {
        const videoTrack = info.tracks.find((t: any) => t.type === 'video');
        if (!videoTrack) {
          reject(new Error(`No video track found in asset ${assetId}`));
          return;
        }

        const timescale = videoTrack.timescale;
        const duration = videoTrack.duration / timescale;
        const width = videoTrack.video?.width ?? videoTrack.track_width;
        const height = videoTrack.video?.height ?? videoTrack.track_height;

        const trak = (mp4file as any).getTrackById(videoTrack.id);
        const codecConfig = this.extractCodecConfig(videoTrack, trak);

        // Extract rotation from track header matrix
        let rotation = 0;
        const matrix = videoTrack.matrix ?? trak?.tkhd?.matrix;
        if (matrix && matrix.length >= 6) {
          const a = matrix[0] / 65536;
          const b = matrix[1] / 65536;
          const angle = Math.round(Math.atan2(b, a) * (180 / Math.PI));
          if (angle === 90 || angle === 180 || angle === 270 || angle === -90) {
            rotation = angle < 0 ? angle + 360 : angle;
          }
        }

        mp4file.onSamples = (_trackId: number, _user: any, samples: Sample[]) => {
          for (const s of samples) {
            samplesCollected.push(s);
          }
        };

        mp4file.setExtractionOptions(videoTrack.id, null, { nbSamples: Infinity });
        mp4file.start();
        mp4file.flush();

        const frameCount = samplesCollected.length || videoTrack.nb_samples;
        const frameRate = frameCount > 0 && duration > 0
          ? frameCount / duration
          : (videoTrack as any).fps ?? 30;

        const keyframeIndices: number[] = [];
        for (let i = 0; i < samplesCollected.length; i++) {
          if (samplesCollected[i].is_sync) {
            keyframeIndices.push(i);
          }
        }

        // VFR / timestamp gap detection
        const checkCount = Math.min(100, samplesCollected.length);
        if (checkCount > 1) {
          let hasGaps = false;
          const avgDuration = samplesCollected.slice(0, checkCount).reduce((sum, s) => sum + s.duration, 0) / checkCount;
          for (let i = 1; i < checkCount; i++) {
            const gap = Math.abs(samplesCollected[i].duration - avgDuration);
            if (gap > avgDuration * 0.5) {
              hasGaps = true;
              break;
            }
          }
          if (hasGaps) {
            console.warn(`[VideoWorker] Variable frame rate detected for asset ${assetId}. Playback timing may be approximate.`);
          }
        }

        const state: DemuxerAssetState = {
          mp4file,
          byteSource,
          samples: samplesCollected,
          keyframeIndices,
          timescale,
          codecConfig,
          width,
          height,
          frameRate: Math.round(frameRate * 1000) / 1000,
          duration,
          frameCount: samplesCollected.length,
          rotation,
          byteCache: new Map(),
        };

        resolved = true;
        resolve(state);
      };

      mp4file.onError = (e: string) => {
        if (!resolved) reject(new Error(`MP4 parse error for ${assetId}: ${e}`));
      };

      try {
        await this.feedUntilReady(mp4file, byteSource);
        if (!resolved) {
          reject(new Error(`Failed to parse moov box for asset ${assetId}`));
        }
      } catch (err) {
        if (!resolved) reject(err);
      }
    });
  }

  private async feedUntilReady(mp4file: MP4File, byteSource: ByteSource): Promise<void> {
    const totalSize = byteSource.totalSize;
    const attempts = [
      { headSize: 524288, tailSize: 524288 },
      { headSize: 2097152, tailSize: 2097152 },
      { headSize: Math.min(totalSize, 8388608), tailSize: Math.min(totalSize, 8388608) },
    ];

    let offset = 0;

    for (const attempt of attempts) {
      if ((mp4file as any).moovStartFound) break;

      const headEnd = Math.min(attempt.headSize, totalSize);
      if (offset < headEnd) {
        const buf = await byteSource.read(offset, headEnd);
        const mp4buf = buf as MP4ArrayBuffer;
        mp4buf.fileStart = offset;
        offset = mp4file.appendBuffer(mp4buf);
      }

      if ((mp4file as any).moovStartFound) break;

      if (totalSize > attempt.headSize) {
        const tailStart = Math.max(headEnd, totalSize - attempt.tailSize);
        if (tailStart < totalSize) {
          const tailBuf = await byteSource.read(tailStart, totalSize);
          const mp4tailBuf = tailBuf as MP4ArrayBuffer;
          mp4tailBuf.fileStart = tailStart;
          mp4file.appendBuffer(mp4tailBuf);
        }
      }

      if ((mp4file as any).moovStartFound) break;
    }
  }

  private extractCodecConfig(videoTrack: any, trak: any): VideoDecoderConfig {
    const codec = videoTrack.codec;
    const config: VideoDecoderConfig = {
      codec,
      codedWidth: videoTrack.video?.width ?? videoTrack.track_width,
      codedHeight: videoTrack.video?.height ?? videoTrack.track_height,
    };

    if (trak) {
      const entry = trak.mdia?.minf?.stbl?.stsd?.entries?.[0];
      if (entry) {
        if (entry.avcC) {
          const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
          entry.avcC.write(stream);
          config.description = new Uint8Array(stream.buffer, 8);
        } else if (entry.hvcC) {
          const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
          entry.hvcC.write(stream);
          config.description = new Uint8Array(stream.buffer, 8);
        } else if (entry.vpcC) {
          const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
          entry.vpcC.write(stream);
          config.description = new Uint8Array(stream.buffer, 8);
        } else if (entry.av1C) {
          const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
          entry.av1C.write(stream);
          config.description = new Uint8Array(stream.buffer, 8);
        }
      }
    }

    // HDR detection - log warning if HDR content detected
    if (trak) {
      const entry = trak.mdia?.minf?.stbl?.stsd?.entries?.[0];
      const colr = entry?.colr ?? entry?.colour;
      if (colr) {
        const primaries = colr.colour_primaries ?? colr.primaries;
        const transfer = colr.transfer_characteristics ?? colr.transfer;
        if (primaries === 9 || transfer === 16 || transfer === 18) {
          console.warn('[VideoWorker] HDR video detected (BT.2020/PQ/HLG). Colors will be clipped to SDR range.');
        }
      }
    }

    return config;
  }

  getSampleForFrame(assetId: string, frameIndex: number): Sample | null {
    const state = this.assets.get(assetId);
    if (!state || frameIndex < 0 || frameIndex >= state.samples.length) return null;
    return state.samples[frameIndex];
  }

  getNearestKeyframeBefore(assetId: string, frameIndex: number): number {
    const state = this.assets.get(assetId);
    if (!state) return 0;
    const kf = state.keyframeIndices;
    let lo = 0, hi = kf.length - 1;
    let result = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (kf[mid] <= frameIndex) {
        result = kf[mid];
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return result;
  }

  getSamplesInRange(assetId: string, startFrame: number, endFrame: number): Sample[] {
    const state = this.assets.get(assetId);
    if (!state) return [];
    const start = Math.max(0, startFrame);
    const end = Math.min(endFrame, state.samples.length - 1);
    return state.samples.slice(start, end + 1);
  }

  getKeyframeIndices(assetId: string): number[] {
    return this.assets.get(assetId)?.keyframeIndices ?? [];
  }

  getCodecConfig(assetId: string): VideoDecoderConfig | null {
    return this.assets.get(assetId)?.codecConfig ?? null;
  }

  getTimescale(assetId: string): number {
    return this.assets.get(assetId)?.timescale ?? 1;
  }

  async fetchSampleData(assetId: string, samples: Sample[]): Promise<ArrayBuffer[]> {
    const state = this.assets.get(assetId);
    if (!state) throw new Error(`Asset ${assetId} not initialized`);

    const groups = this.coalesceSamples(samples);
    const results: ArrayBuffer[] = [];

    for (const group of groups) {
      const rangeStart = group[0].offset;
      const lastSample = group[group.length - 1];
      const rangeEnd = lastSample.offset + lastSample.size;
      const cacheKey = `${rangeStart}-${rangeEnd}`;

      let rangeBuffer = state.byteCache.get(cacheKey);
      if (!rangeBuffer) {
        rangeBuffer = await state.byteSource.read(rangeStart, rangeEnd);
        if (state.byteCache.size >= BYTE_CACHE_LIMIT) {
          const firstKey = state.byteCache.keys().next().value!;
          state.byteCache.delete(firstKey);
        }
        state.byteCache.set(cacheKey, rangeBuffer);
      }

      for (const sample of group) {
        const localOffset = sample.offset - rangeStart;
        results.push(rangeBuffer.slice(localOffset, localOffset + sample.size));
      }
    }

    return results;
  }

  private coalesceSamples(samples: Sample[]): Sample[][] {
    if (samples.length === 0) return [];
    const groups: Sample[][] = [[samples[0]]];
    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1];
      const curr = samples[i];
      const gap = curr.offset - (prev.offset + prev.size);
      if (gap <= COALESCE_GAP) {
        groups[groups.length - 1].push(curr);
      } else {
        groups.push([curr]);
      }
    }
    return groups;
  }

  destroy(assetId: string): void {
    const state = this.assets.get(assetId);
    if (state) {
      state.mp4file.stop();
      state.samples.length = 0;
      state.byteCache.clear();
      this.assets.delete(assetId);
    }
  }
}

// ---------------------------------------------------------------------------
// VIDEO DECODER WORKER
// ---------------------------------------------------------------------------

interface PendingDecode {
  frameIndex: number;
  resolve: (frame: VideoFrame) => void;
  reject: (err: Error) => void;
  cancelled: boolean;
}

class VideoDecoderController {
  private decoder: VideoDecoder | null = null;
  private demuxer: StreamingDemuxer;
  private assetId: string;
  private pendingDecodes = new Map<number, PendingDecode>();
  private lastKeyframeFed = -1;
  private lastFrameFed = -1;
  private configured = false;

  constructor(demuxer: StreamingDemuxer, assetId: string) {
    this.demuxer = demuxer;
    this.assetId = assetId;
  }

  async configure(): Promise<void> {
    const config = this.demuxer.getCodecConfig(this.assetId);
    if (!config) throw new Error(`No codec config for ${this.assetId}`);

    const support = await VideoDecoder.isConfigSupported(config);
    if (!support.supported) {
      throw new Error(`Codec ${config.codec} not supported by this browser`);
    }

    this.decoder = new VideoDecoder({
      output: (frame: VideoFrame) => this.onFrame(frame),
      error: (err: DOMException) => this.onError(err),
    });

    this.decoder.configure(config);
    this.configured = true;
    this.lastKeyframeFed = -1;
    this.lastFrameFed = -1;
  }

  async decodeFrame(frameIndex: number): Promise<VideoFrame> {
    if (!this.decoder || !this.configured) {
      await this.configure();
    }

    return new Promise<VideoFrame>(async (resolve, reject) => {
      const pending: PendingDecode = { frameIndex, resolve, reject, cancelled: false };
      this.pendingDecodes.set(frameIndex, pending);

      try {
        const nearestKf = this.demuxer.getNearestKeyframeBefore(this.assetId, frameIndex);
        let feedStart: number;

        if (this.lastKeyframeFed === nearestKf && this.lastFrameFed >= nearestKf && this.lastFrameFed < frameIndex) {
          feedStart = this.lastFrameFed + 1;
        } else if (this.lastKeyframeFed !== nearestKf || this.lastFrameFed < nearestKf) {
          await this.flush();
          feedStart = nearestKf;
          this.lastKeyframeFed = nearestKf;
        } else {
          feedStart = nearestKf;
          this.lastKeyframeFed = nearestKf;
        }

        const samples = this.demuxer.getSamplesInRange(this.assetId, feedStart, frameIndex);
        if (samples.length === 0) {
          this.pendingDecodes.delete(frameIndex);
          reject(new Error(`No samples found for frame ${frameIndex}`));
          return;
        }

        const dataBuffers = await this.demuxer.fetchSampleData(this.assetId, samples);
        const timescale = this.demuxer.getTimescale(this.assetId);

        for (let i = 0; i < samples.length; i++) {
          if (pending.cancelled) {
            this.pendingDecodes.delete(frameIndex);
            reject(new Error('Decode cancelled'));
            return;
          }

          const sample = samples[i];
          const data = dataBuffers[i];
          const timestamp = Math.round((sample.cts / timescale) * 1_000_000);
          const duration = Math.round((sample.duration / timescale) * 1_000_000);

          const chunk = new EncodedVideoChunk({
            type: sample.is_sync ? 'key' : 'delta',
            timestamp,
            duration,
            data,
          });

          this.decoder!.decode(chunk);
          this.lastFrameFed = feedStart + i;
        }

        await this.decoder!.flush();
      } catch (err) {
        if (this.pendingDecodes.has(frameIndex)) {
          this.pendingDecodes.delete(frameIndex);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }
    });
  }

  private onFrame(frame: VideoFrame): void {
    const timescale = this.demuxer.getTimescale(this.assetId);
    const samples = this.demuxer.getSamplesInRange(this.assetId, 0, Infinity as any);

    let matchedIndex = -1;
    const frameTimestamp = frame.timestamp;

    for (const [idx, pending] of this.pendingDecodes) {
      const sample = this.demuxer.getSampleForFrame(this.assetId, idx);
      if (sample) {
        const sampleTimestamp = Math.round((sample.cts / timescale) * 1_000_000);
        if (Math.abs(frameTimestamp - sampleTimestamp) < 1000) {
          matchedIndex = idx;
          break;
        }
      }
    }

    if (matchedIndex >= 0) {
      const pending = this.pendingDecodes.get(matchedIndex)!;
      this.pendingDecodes.delete(matchedIndex);
      if (pending.cancelled) {
        frame.close();
      } else {
        pending.resolve(frame);
      }
    } else {
      frame.close();
    }
  }

  private onError(err: DOMException): void {
    this.configured = false;
    for (const [, pending] of this.pendingDecodes) {
      pending.reject(new Error(`Decoder error: ${err.message}`));
    }
    this.pendingDecodes.clear();
  }

  private async flush(): Promise<void> {
    if (this.decoder && this.decoder.state !== 'closed') {
      try {
        await this.decoder.flush();
      } catch {}
      await this.decoder.reset();
      const config = this.demuxer.getCodecConfig(this.assetId);
      if (config) this.decoder.configure(config);
    }
  }

  cancelFrame(frameIndex: number): boolean {
    const pending = this.pendingDecodes.get(frameIndex);
    if (pending) {
      pending.cancelled = true;
      return true;
    }
    return false;
  }

  async reset(): Promise<void> {
    for (const [, pending] of this.pendingDecodes) {
      pending.reject(new Error('Decoder reset'));
    }
    this.pendingDecodes.clear();

    if (this.decoder && this.decoder.state !== 'closed') {
      try {
        this.decoder.reset();
      } catch {}
      this.decoder.close();
    }

    this.decoder = null;
    this.configured = false;
    this.lastKeyframeFed = -1;
    this.lastFrameFed = -1;
  }

  async destroy(): Promise<void> {
    await this.reset();
  }
}

// ---------------------------------------------------------------------------
// WORKER MESSAGE HANDLER
// ---------------------------------------------------------------------------

const demuxer = new StreamingDemuxer();
const decoders = new Map<string, VideoDecoderController>();
const proxyScales = new Map<string, number>();

function send(msg: WorkerOutboundMessage, transfer?: Transferable[]): void {
  if (transfer && transfer.length > 0) {
    self.postMessage(msg, transfer);
  } else {
    self.postMessage(msg);
  }
}

async function handleInit(msg: Extract<WorkerInboundMessage, { type: 'INIT' }>): Promise<void> {
  try {
    const metadata = await demuxer.init(msg.assetId, msg.source);
    const decoder = new VideoDecoderController(demuxer, msg.assetId);
    decoders.set(msg.assetId, decoder);

    const keyframes = demuxer.getKeyframeIndices(msg.assetId);

    send({
      type: 'INIT_DONE',
      requestId: msg.requestId,
      assetId: msg.assetId,
      metadata,
      keyframes,
    });
  } catch (err) {
    send({
      type: 'ERROR',
      requestId: msg.requestId,
      assetId: msg.assetId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

async function handleDecodeFrame(msg: Extract<WorkerInboundMessage, { type: 'DECODE_FRAME' }>): Promise<void> {
  const decoder = decoders.get(msg.assetId);
  if (!decoder) {
    send({
      type: 'ERROR',
      requestId: msg.requestId,
      assetId: msg.assetId,
      message: `Asset ${msg.assetId} not initialized`,
    });
    return;
  }

  try {
    const frame = await decoder.decodeFrame(msg.frameIndex);
    const scale = proxyScales.get(msg.assetId) ?? 1;

    if (scale < 1) {
      const w = Math.round(frame.displayWidth * scale);
      const h = Math.round(frame.displayHeight * scale);
      const bitmap = await createImageBitmap(frame, { resizeWidth: w, resizeHeight: h });
      frame.close();
      send(
        {
          type: 'FRAME_READY',
          requestId: msg.requestId,
          assetId: msg.assetId,
          frameIndex: msg.frameIndex,
          frame: bitmap,
        },
        [bitmap],
      );
    } else {
      send(
        {
          type: 'FRAME_READY',
          requestId: msg.requestId,
          assetId: msg.assetId,
          frameIndex: msg.frameIndex,
          frame,
        },
        [frame],
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'Decode cancelled') {
      send({
        type: 'CANCELLED',
        requestId: msg.requestId,
        assetId: msg.assetId,
        frameIndex: msg.frameIndex,
      });
    } else {
      send({
        type: 'ERROR',
        requestId: msg.requestId,
        assetId: msg.assetId,
        message,
      });
    }
  }
}

function handleCancel(msg: Extract<WorkerInboundMessage, { type: 'CANCEL' }>): void {
  const decoder = decoders.get(msg.assetId);
  if (decoder) {
    decoder.cancelFrame(msg.frameIndex);
  }
  send({
    type: 'CANCELLED',
    requestId: msg.requestId,
    assetId: msg.assetId,
    frameIndex: msg.frameIndex,
  });
}

async function handleDestroy(msg: Extract<WorkerInboundMessage, { type: 'DESTROY' }>): Promise<void> {
  const decoder = decoders.get(msg.assetId);
  if (decoder) {
    await decoder.destroy();
    decoders.delete(msg.assetId);
  }
  demuxer.destroy(msg.assetId);
}

self.onmessage = (e: MessageEvent<WorkerInboundMessage>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'INIT':
      handleInit(msg);
      break;
    case 'DECODE_FRAME':
      handleDecodeFrame(msg);
      break;
    case 'CANCEL':
      handleCancel(msg);
      break;
    case 'DESTROY':
      handleDestroy(msg);
      break;
    case 'SET_PROXY':
      proxyScales.set(msg.assetId, msg.proxyScale);
      break;
  }
};
