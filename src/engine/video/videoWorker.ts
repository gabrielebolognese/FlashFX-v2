import { createFile, DataStream, Endianness, type ISOFile as MP4File, type MP4BoxBuffer as MP4ArrayBuffer } from 'mp4box';
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
    return new Promise((resolve, reject) => {
      const mp4file = createFile() as unknown as MP4File;
      let settled = false;

      const finish = (err: Error | null, state?: DemuxerAssetState): void => {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve(state!);
      };

      mp4file.onError = (e: string) => finish(new Error(`MP4 parse error for ${assetId}: ${e}`));

      mp4file.onReady = (info: MP4Info) => {
        try {
          const videoTrack = info.tracks.find((t: any) => t.type === 'video');
          if (!videoTrack) {
            finish(new Error(`No video track found in asset ${assetId}`));
            return;
          }

          const timescale = videoTrack.timescale;
          const duration = videoTrack.duration / timescale;
          const width = videoTrack.video?.width ?? videoTrack.track_width;
          const height = videoTrack.video?.height ?? videoTrack.track_height;

          const trak = (mp4file as any).getTrackById(videoTrack.id);
          const codecConfig = this.extractCodecConfig(videoTrack, trak);

          // Extract rotation from track header matrix.
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

          // Build the FULL random-access sample table from the parsed moov.
          // mp4box populates trak.samples (offset/size/cts/dts/duration/is_sync)
          // from stco/stsc/stsz/stts/ctts/stss during moov parse — BEFORE onReady
          // — so the complete index is available WITHOUT appending any mdat media
          // bytes. fetchSampleData() reads the actual bytes on demand via byte
          // ranges. (The old code collected samples via onSamples, which only
          // delivers samples whose media bytes were appended; with the head/tail
          // feed that meant everything past the first few MB was missing, so any
          // real-length clip only decoded its opening fraction, then froze.)
          const raw = (trak?.samples ?? []) as any[];
          if (raw.length === 0) {
            finish(new Error(`No sample table in moov for asset ${assetId} (fragmented MP4 is not supported)`));
            return;
          }

          const samples: Sample[] = new Array(raw.length);
          const keyframeIndices: number[] = [];
          for (let i = 0; i < raw.length; i++) {
            const s = raw[i];
            samples[i] = {
              offset: s.offset,
              size: s.size,
              cts: s.cts,
              duration: s.duration,
              is_sync: !!s.is_sync,
            };
            if (s.is_sync) keyframeIndices.push(i);
          }
          // A decoder can only start at a sync sample, so frame 0 must be one.
          // If stss somehow omits it, treat index 0 as an implicit keyframe AND
          // type it 'key' (below), so a keyframe-start feed never trips the
          // [[key chunk required]] rule with a delta chunk.
          if (keyframeIndices.length === 0 || keyframeIndices[0] !== 0) {
            keyframeIndices.unshift(0);
            samples[0].is_sync = true;
          }

          const frameCount = samples.length;
          const frameRate = frameCount > 0 && duration > 0
            ? frameCount / duration
            : (videoTrack as any).fps ?? 30;

          finish(null, {
            mp4file,
            byteSource,
            samples,
            keyframeIndices,
            timescale,
            codecConfig,
            width,
            height,
            frameRate: Math.round(frameRate * 1000) / 1000,
            duration,
            frameCount,
            rotation,
            byteCache: new Map(),
          });
        } catch (err) {
          finish(err instanceof Error ? err : new Error(String(err)));
        }
      };

      // Feed only the bytes mp4box needs to parse the moov. appendBuffer returns
      // the next file offset it wants, which lets it seek past a leading mdat to
      // reach a trailing moov (and, for a faststart file, stop as soon as the
      // front moov is parsed) — so we never load mdat into memory here.
      void this.feedUntilReady(mp4file, byteSource, () => settled).then(
        () => { if (!settled) finish(new Error(`Failed to parse moov box for asset ${assetId}`)); },
        (err) => finish(err instanceof Error ? err : new Error(String(err))),
      );
    });
  }

  private async feedUntilReady(
    mp4file: MP4File,
    byteSource: ByteSource,
    isDone: () => boolean,
  ): Promise<void> {
    const totalSize = byteSource.totalSize;
    const CHUNK = 1 << 20; // 1 MiB
    let fileStart = 0;
    let guard = 0;

    while (!isDone() && fileStart < totalSize) {
      if (++guard > 8192) throw new Error('moov scan exceeded read budget');
      const end = Math.min(fileStart + CHUNK, totalSize);
      const buf = await byteSource.read(fileStart, end);
      if (isDone()) return;
      const mp4buf = buf as MP4ArrayBuffer;
      mp4buf.fileStart = fileStart;
      const next = mp4file.appendBuffer(mp4buf);
      if (isDone()) return;
      // Follow mp4box's requested next offset; if it doesn't advance past what
      // we fed, continue sequentially.
      fileStart = typeof next === 'number' && next > fileStart ? next : end;
    }

    // Reached EOF without onReady: flush so mp4box finalizes a moov sitting at
    // the very end of the file. If that still doesn't yield onReady, the caller
    // rejects.
    if (!isDone()) mp4file.flush();
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
          const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
          entry.avcC.write(stream);
          config.description = new Uint8Array(stream.buffer, 8);
        } else if (entry.hvcC) {
          const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
          entry.hvcC.write(stream);
          config.description = new Uint8Array(stream.buffer, 8);
        } else if (entry.vpcC) {
          const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
          entry.vpcC.write(stream);
          config.description = new Uint8Array(stream.buffer, 8);
        } else if (entry.av1C) {
          const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
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
  requestId: number;
  frameIndex: number;
  resolve: (frame: VideoFrame) => void;
  reject: (err: Error) => void;
  cancelled: boolean;
  /** True once resolved/rejected — guards double-settle and skips redundant passes. */
  settled: boolean;
  /** True once this frame's chunk has been fed to the decoder (awaiting output). */
  fed: boolean;
}

class VideoDecoderController {
  private decoder: VideoDecoder | null = null;
  private demuxer: StreamingDemuxer;
  private assetId: string;
  /**
   * Keyed by requestId, NOT frameIndex: two concurrent requests for the same
   * frame would otherwise clobber each other's entry, leaving the first promise
   * unresolved forever (and its scheduler slot stuck 'in-flight').
   */
  private pendingDecodes = new Map<number, PendingDecode>();
  private nextRequestId = 1;
  private configured = false;

  // ── Forward-streaming session ──────────────────────────────────────────────
  // The decoder is kept ALIVE across requests. During sequential/forward playback
  // we keep feeding the next contiguous chunks without flushing, so a GOP is
  // decoded once, not re-decoded from its keyframe on every frame. We only
  // reset() to a keyframe on a backward/distant seek, and only flush() to drain
  // the tail once decoding has caught up with demand (i.e. when it's not the
  // bottleneck). This mirrors how mediabunny/CapCut drive WebCodecs playback.
  /** decoder has been fed since the last flush/reset and can take a delta chunk. */
  private sessionOpen = false;
  /** highest sample index fed since the last flush/reset (-1 = none). */
  private fedThrough = -1;
  /** true while runLoop() is draining the pending queue. */
  private looping = false;
  /** Idle-drain timer: flushes the reorder tail shortly after feeding stops. */
  private drainTimer: ReturnType<typeof setTimeout> | null = null;

  /** Max samples fed in a single pass (bounds byte reads + input-queue depth). */
  private static readonly MAX_FORWARD_SPAN = 120;
  /** Backpressure cap: keep the decoder busy but don't overrun its input queue. */
  private static readonly DECODE_QUEUE_CAP = 24;
  /** Idle window before flushing the reorder tail (≈2 frames @ 30fps). */
  private static readonly DRAIN_IDLE_MS = 64;
  /** Watchdog: max wait for a flush() to drain before forcing a decoder rebuild. */
  private static readonly FLUSH_TIMEOUT_MS = 2000;

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
    this.sessionOpen = false;
    this.fedThrough = -1;
  }

  /** Resolve/reject a pending exactly once and drop it from the map. */
  private settle(pending: PendingDecode, action: () => void): void {
    if (pending.settled) return;
    pending.settled = true;
    this.pendingDecodes.delete(pending.requestId);
    action();
  }

  decodeFrame(frameIndex: number): Promise<VideoFrame> {
    const requestId = this.nextRequestId++;
    let resolve!: (frame: VideoFrame) => void;
    let reject!: (err: Error) => void;
    const promise = new Promise<VideoFrame>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    this.pendingDecodes.set(requestId, {
      requestId,
      frameIndex,
      resolve,
      reject,
      cancelled: false,
      settled: false,
      fed: false,
    });

    this.kick();
    return promise;
  }

  /** Start the drain loop if it isn't already running. */
  private kick(): void {
    if (this.looping) return;
    // A fresh feed is about to happen; cancel any pending idle-drain — the
    // continuation feed will push the buffered tail out without a flush.
    if (this.drainTimer !== null) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
    this.looping = true;
    void this.runLoop().finally(() => {
      this.looping = false;
      // A request that arrived during the final await gets its own loop.
      if (this.pickTarget()) {
        this.kick();
        return;
      }
      // Feeding is done but the decoder may still hold reorder-buffered frames.
      // Don't flush now: if playback continues, the next feed drains them for
      // free (streaming). Only flush if no feed arrives within an idle window.
      if (this.sessionOpen && this.hasBufferedFrames()) this.scheduleDrain();
    });
  }

  private scheduleDrain(): void {
    if (this.drainTimer !== null) return;
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      void this.maybeDrain();
    }, VideoDecoderController.DRAIN_IDLE_MS);
  }

  /** Flush the reorder tail once feeding has gone idle, so stragglers resolve. */
  private async maybeDrain(): Promise<void> {
    if (this.looping) return;
    if (!this.sessionOpen || !this.hasBufferedFrames() || this.pickTarget()) return;
    this.looping = true; // lock out the main loop while we flush
    try {
      await this.flushSession();
    } finally {
      this.looping = false;
      if (this.pickTarget()) this.kick();
    }
  }

  /** Lowest-frame pending that still needs feeding (unsettled, uncancelled, unfed). */
  private pickTarget(): PendingDecode | null {
    let best: PendingDecode | null = null;
    for (const p of this.pendingDecodes.values()) {
      if (p.settled || p.cancelled || p.fed) continue;
      if (!best || p.frameIndex < best.frameIndex) best = p;
    }
    return best;
  }

  /** Any fed-but-not-yet-emitted frame still sitting in the decoder pipeline. */
  private hasBufferedFrames(): boolean {
    for (const p of this.pendingDecodes.values()) {
      if (!p.settled && !p.cancelled && p.fed) return true;
    }
    return false;
  }

  private reapCancelled(): void {
    for (const p of [...this.pendingDecodes.values()]) {
      if (p.cancelled && !p.settled) {
        this.settle(p, () => p.reject(new Error('Decode cancelled')));
      }
    }
  }

  private async runLoop(): Promise<void> {
    try {
      while (true) {
        this.reapCancelled();
        const target = this.pickTarget();
        if (!target) break;
        await this.feedTowards(target);
        // Buffered frames from this pass are left in the decoder; the NEXT pass's
        // continuation feed drains them without a flush. Draining is handled by
        // the idle timer (kick's finally) when feeding stops.
      }
    } catch (err) {
      // Fatal: fail every outstanding request so nothing hangs, and drop the
      // session so the next request reconfigures from scratch.
      const e = err instanceof Error ? err : new Error(String(err));
      for (const p of [...this.pendingDecodes.values()]) {
        if (!p.settled) this.settle(p, () => p.reject(e));
      }
      this.sessionOpen = false;
      this.fedThrough = -1;
    }
  }

  /**
   * Feed the decoder up to (at least) `target`, extending forward to cover other
   * pending frames in the same run. Continues the open stream when the target is
   * just ahead; otherwise reseeks to the target's keyframe. Never flushes here —
   * frames emit via onFrame as the stream advances; runLoop() drains the tail.
   */
  private async feedTowards(target: PendingDecode): Promise<void> {
    if (!this.decoder || !this.configured) {
      await this.configure();
    }
    const decoder = this.decoder;
    if (!decoder) throw new Error('Decoder unavailable');

    const t = target.frameIndex;
    const kf = this.demuxer.getNearestKeyframeBefore(this.assetId, t);

    // Continue the open stream only when the target is forward AND reachable
    // without skipping its keyframe (same GOP or the immediately next one). A
    // backward jump or a far-ahead seek restarts at the keyframe instead — which
    // is cheaper than replaying a long delta run and avoids decoding frames the
    // caller doesn't want.
    let feedStart: number;
    if (this.sessionOpen && this.fedThrough >= 0 && t > this.fedThrough && kf <= this.fedThrough + 1) {
      feedStart = this.fedThrough + 1;
    } else {
      // Reseek. flush() (not reset()) drains any frames still buffered from the
      // previous run so THEIR promises resolve instead of being orphaned by a
      // discard, and it arms [[key chunk required]] so the keyframe start below
      // is valid. flush is also cheaper than reset()+reconfigure().
      if (this.sessionOpen) {
        await this.flushSession();
        if (this.decoder !== decoder || decoder.state === 'closed') return;
      }
      feedStart = kf;
    }

    // Extend the run to cover contiguous pending frames, capped.
    const cap = feedStart + VideoDecoderController.MAX_FORWARD_SPAN;
    let feedEnd = Math.min(Math.max(t, feedStart), cap);
    for (const p of this.pendingDecodes.values()) {
      if (p.settled || p.cancelled || p.fed) continue;
      if (p.frameIndex > feedEnd && p.frameIndex <= cap) feedEnd = p.frameIndex;
    }

    const samples = this.demuxer.getSamplesInRange(this.assetId, feedStart, feedEnd);
    if (samples.length === 0) {
      this.settle(target, () => target.reject(new Error(`No samples found for frame ${t}`)));
      return;
    }

    const dataBuffers = await this.demuxer.fetchSampleData(this.assetId, samples);
    if (this.decoder !== decoder) return; // reset/closed during the byte fetch
    const timescale = this.demuxer.getTimescale(this.assetId);

    for (let i = 0; i < samples.length; i++) {
      // Backpressure: keep the decoder busy without overrunning its input queue.
      if (decoder.decodeQueueSize > VideoDecoderController.DECODE_QUEUE_CAP) {
        await this.waitForDequeue(decoder);
        if (this.decoder !== decoder || decoder.state === 'closed') return;
      }
      const s = samples[i];
      decoder.decode(new EncodedVideoChunk({
        type: s.is_sync ? 'key' : 'delta',
        timestamp: Math.round((s.cts / timescale) * 1_000_000),
        duration: Math.round((s.duration / timescale) * 1_000_000),
        data: dataBuffers[i],
      }));
      const fedIndex = feedStart + i;
      this.fedThrough = fedIndex;
      this.markFed(fedIndex);
    }
    this.sessionOpen = true;

    // Let queued output callbacks run so emitted frames settle their pendings
    // before the loop decides what to feed next.
    await this.microYield();
  }

  private markFed(frameIndex: number): void {
    for (const p of this.pendingDecodes.values()) {
      if (!p.settled && !p.cancelled && p.frameIndex === frameIndex) p.fed = true;
    }
  }

  /** Force out buffered frames; flush() sets [[key chunk required]] so the next pass reseeks. */
  private async flushSession(): Promise<void> {
    const decoder = this.decoder;
    if (!decoder || decoder.state === 'closed') {
      this.sessionOpen = false;
      this.fedThrough = -1;
      return;
    }
    try {
      // Watchdog: flush() resolves only once every output is emitted, which can
      // stall indefinitely if the hardware output pool is exhausted (downstream
      // holding frames open). Bound it so the controller can never lock up — the
      // 'dequeue' wait is bounded for the same reason.
      await Promise.race([
        decoder.flush(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('flush timeout')), VideoDecoderController.FLUSH_TIMEOUT_MS)),
      ]);
    } catch {
      // Stalled or errored: fail any still-buffered pendings so nothing hangs,
      // and drop the decoder so the next feed rebuilds it from a keyframe.
      for (const p of [...this.pendingDecodes.values()]) {
        if (!p.settled && p.fed) this.settle(p, () => p.reject(new Error('Decoder flush stalled')));
      }
      try {
        decoder.close();
      } catch { /* already closed by an error callback during the await */ }
      if (this.decoder === decoder) {
        this.decoder = null;
        this.configured = false;
      }
    }
    this.sessionOpen = false;
    this.fedThrough = -1;
  }

  private waitForDequeue(decoder: VideoDecoder): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        decoder.removeEventListener('dequeue', finish);
        resolve();
      };
      decoder.addEventListener('dequeue', finish);
      // Safety valve: never block the loop forever if the decoder stalls (e.g.
      // its output pool is full because downstream is holding frames open).
      setTimeout(finish, 250);
    });
  }

  private microYield(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  private onFrame(frame: VideoFrame): void {
    const timescale = this.demuxer.getTimescale(this.assetId);
    const frameTimestamp = frame.timestamp;

    // Collect EVERY unsettled pending whose sample shares this frame's cts. There
    // is normally exactly one (the scheduler dedupes per asset+frame), but if two
    // requests target the same frame, resolving only one would strand the other.
    const matches: PendingDecode[] = [];
    for (const pending of this.pendingDecodes.values()) {
      if (pending.settled) continue;
      const sample = this.demuxer.getSampleForFrame(this.assetId, pending.frameIndex);
      if (!sample) continue;
      const sampleTimestamp = Math.round((sample.cts / timescale) * 1_000_000);
      if (Math.abs(frameTimestamp - sampleTimestamp) < 1000) {
        matches.push(pending);
      }
    }

    if (matches.length === 0) {
      // Intermediate/discarded frame (decoded to reach a target, or for an
      // already-settled pending). Nothing owns it — reclaim immediately.
      frame.close();
      return;
    }

    // The last live match takes ownership of `frame`; earlier ones get clones.
    // Cancelled matches are rejected and take no frame.
    const owners = matches.filter((m) => !m.cancelled);
    for (const m of matches) {
      if (m.cancelled) this.settle(m, () => m.reject(new Error('Decode cancelled')));
    }
    if (owners.length === 0) {
      frame.close();
      return;
    }
    for (let i = 0; i < owners.length; i++) {
      const m = owners[i];
      if (i === owners.length - 1) {
        this.settle(m, () => m.resolve(frame));
      } else {
        // clone() is valid here: `frame` isn't transferred until the resolved
        // promise is delivered to handleDecodeFrame in a later microtask.
        try {
          const clone = frame.clone();
          this.settle(m, () => m.resolve(clone));
        } catch {
          this.settle(m, () => m.reject(new Error('Duplicate-frame clone failed')));
        }
      }
    }
  }

  private onError(err: DOMException): void {
    this.configured = false;
    this.sessionOpen = false;
    this.fedThrough = -1;
    if (this.drainTimer !== null) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
    for (const pending of [...this.pendingDecodes.values()]) {
      this.settle(pending, () => pending.reject(new Error(`Decoder error: ${err.message}`)));
    }
    this.pendingDecodes.clear();
  }

  cancelFrame(frameIndex: number): boolean {
    let found = false;
    for (const pending of this.pendingDecodes.values()) {
      if (pending.frameIndex === frameIndex && !pending.settled) {
        pending.cancelled = true;
        found = true;
      }
    }
    // Route the cancellation through the loop so it is actually reaped (rejected).
    // Without this, cancelling the last request while its frame sits in the
    // reorder tail would strand it: maybeDrain skips (no live target), no frame
    // emits, and the promise never settles. kick() runs reapCancelled; if a loop
    // is already active it reaps on its next turn.
    if (found) this.kick();
    return found;
  }

  async reset(): Promise<void> {
    if (this.drainTimer !== null) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
    for (const pending of [...this.pendingDecodes.values()]) {
      this.settle(pending, () => pending.reject(new Error('Decoder reset')));
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
    this.sessionOpen = false;
    this.fedThrough = -1;
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
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(frame, { resizeWidth: w, resizeHeight: h });
      } finally {
        // Close the source frame even if createImageBitmap rejects, or it leaks
        // and eventually stalls the hardware decoder's output pool.
        frame.close();
      }
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
