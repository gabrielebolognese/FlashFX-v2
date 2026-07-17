/**
 * DemuxWorker — WebCodecs + mp4box demux/decode pipeline.
 * Runs entirely off the main thread. Receives MainToWorkerMessage commands
 * and sends WorkerToMainMessage responses including decoded VideoFrames.
 *
 * Maximum concurrent decoders is configurable via MAX_CONCURRENT_DECODERS.
 * All VideoFrame objects are transferred to the main thread with zero copy.
 */

import { createFile } from 'mp4box';
import type { ISOFile, MP4BoxBuffer, Sample } from 'mp4box';
import type { MainToWorkerMessage, WorkerToMainMessage } from '../types';

const MAX_CONCURRENT_DECODERS = 4;

interface DecoderState {
  clipId: string;
  assetId: string;
  decoder: VideoDecoder;
  mp4file: ISOFile;
  videoTrackId: number;
  ready: boolean;
  bufferAheadSeconds: number;
  targetTime: number;
  pendingSamples: Sample[];
  pendingFlush: boolean;
}

const activeDecoders = new Map<string, DecoderState>();

function post(msg: WorkerToMainMessage, transfer?: Transferable[]): void {
  if (transfer && transfer.length > 0) {
    (self as unknown as Worker).postMessage(msg, transfer);
  } else {
    (self as unknown as Worker).postMessage(msg);
  }
}

function buildDecoderConfig(trackInfo: Record<string, unknown>, description: Uint8Array | null): VideoDecoderConfig {
  const codec = (trackInfo.codec as string | undefined) ?? 'avc1.42E01E';
  const config: VideoDecoderConfig = {
    codec,
    codedWidth: (trackInfo.track_width as number | undefined) ?? 1920,
    codedHeight: (trackInfo.track_height as number | undefined) ?? 1080,
  };

  if (description) {
    config.description = description;
  }

  return config;
}

function getAVCCDescription(track: Record<string, unknown>): Uint8Array | null {
  try {
    const trak = (track as unknown as { trak?: Record<string, unknown> }).trak;
    if (!trak) return null;
    const mdia = (trak as Record<string, unknown>).mdia as Record<string, unknown> | undefined;
    if (!mdia) return null;
    const minf = (mdia as Record<string, unknown>).minf as Record<string, unknown> | undefined;
    if (!minf) return null;
    const stbl = (minf as Record<string, unknown>).stbl as Record<string, unknown> | undefined;
    if (!stbl) return null;
    const stsd = (stbl as Record<string, unknown>).stsd as Record<string, unknown> | undefined;
    if (!stsd) return null;
    const entries = (stsd as Record<string, unknown>).entries as Record<string, unknown>[] | undefined;
    if (!entries || !entries[0]) return null;
    const entry = entries[0];
    const avcC = (entry as Record<string, unknown>).avcC as Record<string, unknown> | undefined;
    if (!avcC) return null;
    const stream = (avcC as Record<string, unknown>).size !== undefined
      ? (avcC as unknown as { write: (ds: unknown) => void })
      : null;
    if (!stream) {
      const configData = (avcC as Record<string, unknown>).config as Uint8Array | undefined;
      return configData ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

async function initDecoder(
  clipId: string,
  assetId: string,
  file: File,
  targetTime: number,
  bufferAheadSeconds: number
): Promise<void> {
  if (activeDecoders.size >= MAX_CONCURRENT_DECODERS) {
    post({ type: 'ERROR', clipId, message: `Max concurrent decoders (${MAX_CONCURRENT_DECODERS}) reached`, fatal: false });
    return;
  }

  const mp4file: ISOFile = createFile();
  let trackId = -1;

  const state: DecoderState = {
    clipId,
    assetId,
    decoder: null as unknown as VideoDecoder,
    mp4file,
    videoTrackId: -1,
    ready: false,
    bufferAheadSeconds,
    targetTime,
    pendingSamples: [],
    pendingFlush: false,
  };

  activeDecoders.set(clipId, state);

  mp4file.onReady = (info) => {
    const videoTrack = info.videoTracks?.[0];
    if (!videoTrack) {
      post({ type: 'ERROR', clipId, message: 'No video track found', fatal: true });
      return;
    }

    trackId = videoTrack.id;
    state.videoTrackId = trackId;

    const trackRecord = videoTrack as unknown as Record<string, unknown>;
    const description = getAVCCDescription(trackRecord);
    const config = buildDecoderConfig(trackRecord, description);

    const decoder = new VideoDecoder({
      output: (frame: VideoFrame) => {
        const currentState = activeDecoders.get(clipId);
        if (!currentState || currentState.pendingFlush) {
          frame.close();
          return;
        }
        const timestamp = frame.timestamp / 1_000_000;
        post(
          { type: 'FRAME', clipId, frame, timestamp },
          [frame as unknown as Transferable]
        );
      },
      error: (err: Error) => {
        post({ type: 'ERROR', clipId, message: err.message, fatal: false });
      },
    });

    decoder.configure(config);
    state.decoder = decoder;
    state.ready = true;

    mp4file.setExtractionOptions(trackId, null, { nbSamples: 30 });

    const seekResult = mp4file.seek(targetTime, true);
    state.targetTime = seekResult.time;

    mp4file.start();
    post({ type: 'READY', clipId });
  };

  mp4file.onError = (e: string) => {
    post({ type: 'ERROR', clipId, message: `mp4box: ${e}`, fatal: true });
    cleanup(clipId);
  };

  mp4file.onSamples = (_id: number, _user: unknown, samples: Sample[]) => {
    const currentState = activeDecoders.get(clipId);
    if (!currentState || !currentState.ready || currentState.pendingFlush) {
      return;
    }

    let exceededBuffer = false;

    for (const sample of samples) {
      const sampleTime = sample.dts / sample.timescale;

      if (sampleTime > currentState.targetTime + currentState.bufferAheadSeconds) {
        exceededBuffer = true;
        break;
      }

      const chunk = new EncodedVideoChunk({
        type: sample.is_sync ? 'key' : 'delta',
        timestamp: Math.round((sample.cts / sample.timescale) * 1_000_000),
        duration: Math.round((sample.duration / sample.timescale) * 1_000_000),
        data: sample.data,
      });

      try {
        currentState.decoder.decode(chunk);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        post({ type: 'ERROR', clipId, message: `decode: ${msg}`, fatal: false });
      }

      mp4file.releaseUsedSamples(currentState.videoTrackId, sample.number);
    }

    if (exceededBuffer) {
      mp4file.stop();
      currentState.decoder.flush().then(() => {
        post({ type: 'DECODE_COMPLETE', clipId });
      }).catch(() => {
        post({ type: 'DECODE_COMPLETE', clipId });
      });
    }
  };

  try {
    const arrayBuffer = await file.arrayBuffer();
    const mp4Buffer = arrayBuffer as MP4BoxBuffer;
    mp4Buffer.fileStart = 0;
    mp4file.appendBuffer(mp4Buffer, true);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    post({ type: 'ERROR', clipId, message: `Failed to read file: ${msg}`, fatal: true });
    cleanup(clipId);
  }
}

async function seekDecoder(clipId: string, targetTime: number, bufferAheadSeconds: number): Promise<void> {
  const state = activeDecoders.get(clipId);
  if (!state || !state.ready) return;

  state.pendingFlush = true;
  state.targetTime = targetTime;
  state.bufferAheadSeconds = bufferAheadSeconds;

  try {
    await state.decoder.flush();
  } catch {
  }

  state.pendingFlush = false;

  const seekResult = state.mp4file.seek(targetTime, true);
  state.targetTime = seekResult.time;
  state.mp4file.start();
}

function flushDecoder(clipId: string): void {
  const state = activeDecoders.get(clipId);
  if (!state) return;
  state.pendingFlush = true;
  state.mp4file.stop();
  state.decoder.flush().catch(() => {}).finally(() => {
    const s = activeDecoders.get(clipId);
    if (s) s.pendingFlush = false;
  });
}

function cleanup(clipId: string): void {
  const state = activeDecoders.get(clipId);
  if (!state) return;
  try { state.mp4file.stop(); } catch { }
  try { state.decoder.close(); } catch { }
  activeDecoders.delete(clipId);
}

self.onmessage = async (e: MessageEvent<MainToWorkerMessage>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'INIT':
      await initDecoder(msg.clipId, msg.assetId, msg.file, msg.targetTime, msg.bufferAheadSeconds);
      break;

    case 'SEEK':
      await seekDecoder(msg.clipId, msg.targetTime, msg.bufferAheadSeconds);
      break;

    case 'FLUSH':
      flushDecoder(msg.clipId);
      break;

    case 'FLUSH_ALL':
      for (const clipId of activeDecoders.keys()) {
        flushDecoder(clipId);
      }
      break;

    case 'CLOSE':
      cleanup(msg.clipId);
      break;
  }
};
