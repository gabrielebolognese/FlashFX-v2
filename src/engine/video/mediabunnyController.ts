import { Input, BlobSource, ALL_FORMATS, VideoSampleSink, EncodedPacketSink, type InputVideoTrack, type VideoSample } from 'mediabunny';
import type { VideoMetadata } from './videoWorker.types';

// mediabunny-backed video decode. Playback requests are served by a small pool of LONG-LIVED FORWARD
// iterators ("cursors"), NOT per-frame getSample(t): getSample spins up a fresh VideoDecoder and
// re-decodes the whole GOP from a keyframe on EVERY call (verified in mediabunny's source), so
// per-frame playback that way costs ~GOP/2 decodes per displayed frame - the "freeze ~1s then jump"
// stall. A cursor is one VideoSampleSink.samples() generator that keeps a decoder open and pre-decodes
// ahead; sequential decodeFrame(i) advances it one next() = exactly one decode. Only a backward/large
// jump reseeks (tear down + reopen). Mirrors OpenCut's VideoCache. Export keeps a separate exact path.
//
// This runs on the main thread (WebCodecs decodes off-thread natively; OpenCut drives it the same way)
// and stays behind the videoDecoderPool public API - the scheduler/renderer/audio path are untouched.

const CURSOR_POOL_SIZE = 2;   // enough for two layers on one asset (split clip / two regions)
const FORWARD_WINDOW = 16;    // frames a request may sit ahead of a cursor before it counts as a jump
const BACK_TOL = 1;           // frames a request may sit behind a cursor and still reuse it (1-frame wobble)
// Small LRU of recently-decoded frames, kept as IMAGE BITMAPS (NOT VideoFrames/VideoSamples): an
// ImageBitmap does not occupy a WebCodecs decoder output-pool slot, so this cache can never stall the
// decoder (unlike retaining decoded VideoFrames, which the scheduler's MAX_OPEN_FRAMES cap guards
// against). A backward / oscillating scrub that lands BEYOND the scheduler's ~8-frame buffer hits this
// instead of tearing the cursor down and re-walking the whole GOP. Frame content is deterministic per
// (asset, source index), so caching by index is frame-pure. Kept tiny; bounded memory per asset.
const FRAME_CACHE_SIZE = 4;

/** Rejected when a newer request supersedes an in-flight pump; the scheduler drops it harmlessly. */
class SupersededError extends Error {
  constructor() { super('superseded'); this.name = 'SupersededError'; }
}

interface Cursor {
  it: AsyncGenerator<VideoSample, void, unknown> | null;
  index: number;              // source-frame index of the retained sample, -1 = uninitialized
  targetIndex: number;        // routing key = highest index routed to this cursor
  sample: VideoSample | null; // retained current frame, kept OPEN for continuity
  gen: number;                // seek-generation; bumped on reopen to supersede older pumps
  chain: Promise<unknown>;    // single-flight per cursor
  lastSeq: number;            // for LRU cursor reuse
  reopenTo: number | null;    // if set, the pump reopens the iterator at this index first
}

interface AssetCtl {
  assetId: string;
  input: Input;
  track: InputVideoTrack;
  sink: VideoSampleSink;
  metadata: VideoMetadata;
  firstTs: number;
  fps: number;
  proxyScale: number;
  cursors: Cursor[];
  reqSeq: number;
  frameCache: Map<number, ImageBitmap>; // recently-decoded frames (index -> bitmap), insertion-order LRU
  packetSink: EncodedPacketSink | null;  // lazily created for keyframe lookup (getNearestKeyframeIndex)
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

    // optimizeForLatency shortens the decoder pipeline → faster seeks + fewer open frames.
    const sink = new VideoSampleSink(track, { optimizeForLatency: true });
    this.assets.set(assetId, { assetId, input, track, sink, metadata, firstTs, fps, proxyScale: 1, cursors: [], reqSeq: 0, frameCache: new Map(), packetSink: null });
    return metadata;
  }

  getMetadata(assetId: string): VideoMetadata | null {
    return this.assets.get(assetId)?.metadata ?? null;
  }

  /** Source-frame index of the nearest key frame at or before `frameIndex` (for keyframe-snap on a far
   *  seek: decoding a key frame is ~1 decode, vs walking the whole GOP to the exact frame). Read-only -
   *  uses an EncodedPacketSink, no decode. Returns null if unavailable, so callers fail safe. */
  async getNearestKeyframeIndex(assetId: string, frameIndex: number): Promise<number | null> {
    const ctl = this.assets.get(assetId);
    if (!ctl) return null;
    if (!ctl.packetSink) ctl.packetSink = new EncodedPacketSink(ctl.track);
    const i = Math.max(0, Math.min(Math.round(frameIndex), ctl.metadata.frameCount - 1));
    try {
      const pkt = await ctl.packetSink.getKeyPacket(this.timeForIndex(ctl, i));
      if (!pkt) return null;
      const k = Math.round((pkt.timestamp - ctl.firstTs) * ctl.fps);
      return Math.max(0, Math.min(k, ctl.metadata.frameCount - 1));
    } catch {
      return null;
    }
  }

  // Open a cursor at index i so its first yielded sample is frame i (samples(start) yields the sample
  // covering `start` first); land mid-frame to be robust against sub-frame timestamp jitter.
  private timeForIndex(ctl: AssetCtl, i: number): number {
    return ctl.firstTs + (Math.max(0, i) + 0.5) / ctl.fps;
  }

  private indexOf(ctl: AssetCtl, sample: VideoSample): number {
    return Math.round((sample.timestamp - ctl.firstTs) * ctl.fps);
  }

  async decodeFrame(assetId: string, frameIndex: number): Promise<VideoFrame> {
    const ctl = this.assets.get(assetId);
    if (!ctl) throw new Error(`mediabunny: asset ${assetId} not initialized`);
    const i = Math.max(0, Math.min(Math.round(frameIndex), ctl.metadata.frameCount - 1));

    // Cache hit: return an INDEPENDENT VideoFrame built from the cached bitmap (a copy - closing it
    // doesn't touch the cache, and it holds no decoder slot). Skips the cursor + any GOP walk entirely.
    const cachedBitmap = ctl.frameCache.get(i);
    if (cachedBitmap) {
      ctl.frameCache.delete(i); ctl.frameCache.set(i, cachedBitmap); // touch -> most-recently-used
      try {
        return new VideoFrame(cachedBitmap, { timestamp: Math.max(0, Math.round(this.timeForIndex(ctl, i) * 1_000_000)) });
      } catch {
        // Bitmap was closed mid-copy (a concurrent evict) or the ctor failed - fall through to decode.
      }
    }

    const seq = ++ctl.reqSeq;

    // Route synchronously so a same-tick forward burst [F..F+6] binds deterministically to one cursor.
    let c: Cursor | null = null;
    for (const cur of ctl.cursors) {
      if (i >= cur.targetIndex - BACK_TOL && i <= cur.targetIndex + FORWARD_WINDOW) {
        if (!c || cur.targetIndex > c.targetIndex) c = cur; // nearest-behind (highest target ≤ ~i)
      }
    }
    if (c) {
      // Continuation of an existing forward stream.
      c.targetIndex = Math.max(c.targetIndex, i);
      c.lastSeq = seq;
    } else {
      // Jump → (re)seek a cursor. gen++ supersedes any older pump still queued on a reused cursor.
      c = this.acquireCursor(ctl, seq);
      c.gen++;
      c.targetIndex = i;
      c.lastSeq = seq;
      c.reopenTo = i;
    }

    const myGen = c.gen;
    const cur = c;
    const job = cur.chain.then(() => this.runJob(ctl, cur, i, myGen));
    cur.chain = job.catch(() => {}); // keep the chain alive across a failed/superseded job
    return job;
  }

  private acquireCursor(ctl: AssetCtl, seq: number): Cursor {
    if (ctl.cursors.length < CURSOR_POOL_SIZE) {
      const c: Cursor = { it: null, index: -1, targetIndex: -1, sample: null, gen: 0, chain: Promise.resolve(), lastSeq: seq, reopenTo: null };
      ctl.cursors.push(c);
      return c;
    }
    // Reuse the least-recently-used cursor.
    let lru = ctl.cursors[0];
    for (const c of ctl.cursors) if (c.lastSeq < lru.lastSeq) lru = c;
    return lru;
  }

  private async runJob(ctl: AssetCtl, c: Cursor, i: number, myGen: number): Promise<VideoFrame> {
    if (myGen !== c.gen) {
      if (c.sample) return c.sample.toVideoFrame();
      throw new SupersededError();
    }
    // Reopen the iterator at a new position (jump).
    if (c.reopenTo != null) {
      if (c.it) { await c.it.return(); c.it = null; } // cheap decoder close (not a flush)
      c.sample?.close();
      c.sample = null;
      c.it = ctl.sink.samples(this.timeForIndex(ctl, c.reopenTo));
      c.index = -1;
      c.reopenTo = null;
    }
    // Forward pump: advance until the retained sample IS frame i (each next() = one decode).
    while (!c.sample || c.index < i) {
      if (myGen !== c.gen) {
        if (c.sample) return c.sample.toVideoFrame();
        throw new SupersededError();
      }
      const { value, done } = await c.it!.next();
      if (done) break; // EOF - clamp to the last frame
      if (c.sample && c.index < i) c.sample.close(); // drop a skipped intermediate
      c.sample = value;
      c.index = this.indexOf(ctl, value);
      if (c.index >= i) break;
    }
    if (!c.sample) throw new Error(`mediabunny: no frame at index ${i}`);
    // Populate the backward-scrub cache off the retained sample (async ImageBitmap copy, non-blocking).
    this.cacheFrame(ctl, i, c.sample);
    // Independent clone → the scheduler owns & closes it; the sample stays retained for continuity.
    return c.sample.toVideoFrame();
  }

  // Copy the just-decoded frame into the LRU as an ImageBitmap (off the retained sample, so it can't
  // race the returned frame). The transient VideoFrame is closed as soon as the copy completes, so it
  // holds a decoder slot only briefly; the cached ImageBitmap holds none. Fully guarded / non-blocking.
  private cacheFrame(ctl: AssetCtl, i: number, sample: VideoSample): void {
    if (ctl.frameCache.has(i)) return;
    let tmp: VideoFrame;
    try { tmp = sample.toVideoFrame(); } catch { return; }
    createImageBitmap(tmp).then(
      (bm) => {
        try { tmp.close(); } catch { /* ignore */ }
        // The asset may have been destroyed, or the frame cached by a concurrent decode, while the copy
        // was in flight - in either case drop this bitmap so it can't leak or double-insert.
        if (this.assets.get(ctl.assetId) !== ctl || ctl.frameCache.has(i)) { bm.close(); return; }
        ctl.frameCache.set(i, bm);
        while (ctl.frameCache.size > FRAME_CACHE_SIZE) {
          const oldest = ctl.frameCache.keys().next().value as number | undefined;
          if (oldest === undefined) break;
          ctl.frameCache.get(oldest)?.close();
          ctl.frameCache.delete(oldest);
        }
      },
      () => { try { tmp.close(); } catch { /* ignore */ } },
    );
  }

  // Export: deterministic, order-independent exact decode - must NOT share playback cursors (their
  // state depends on scrub history). Uses the single-shot getSample path.
  async decodeFrameForExport(assetId: string, frameIndex: number): Promise<VideoFrame> {
    const ctl = this.assets.get(assetId);
    if (!ctl) throw new Error(`mediabunny: asset ${assetId} not initialized`);
    const i = Math.max(0, Math.min(Math.round(frameIndex), ctl.metadata.frameCount - 1));
    const sample = await ctl.sink.getSample(this.timeForIndex(ctl, i));
    if (!sample) throw new Error(`mediabunny: no export frame at index ${i} for ${assetId}`);
    try {
      return sample.toVideoFrame();
    } finally {
      sample.close();
    }
  }

  setProxyMode(assetId: string, scale: number): void {
    const ctl = this.assets.get(assetId);
    if (ctl) ctl.proxyScale = scale; // tracked; real proxy (CanvasSink resize) is a later phase
  }

  async destroyAsset(assetId: string): Promise<void> {
    const ctl = this.assets.get(assetId);
    if (!ctl) return;
    this.assets.delete(assetId);
    for (const bm of ctl.frameCache.values()) { try { bm.close(); } catch { /* ignore */ } }
    ctl.frameCache.clear();
    for (const c of ctl.cursors) {
      try { await c.it?.return(); } catch { /* ignore */ }
      c.sample?.close();
    }
    try {
      (ctl.input as unknown as { dispose?: () => void }).dispose?.();
    } catch {
      /* best-effort */
    }
  }
}

export const mediabunnyController = new MediabunnyController();
