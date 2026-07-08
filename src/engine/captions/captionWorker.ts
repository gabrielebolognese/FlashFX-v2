/// <reference lib="webworker" />
import {
  pipeline,
  env,
  type AutomaticSpeechRecognitionPipeline,
  type ProgressInfo,
} from '@huggingface/transformers';
import type { CaptionSegment, TimestampMode, WhisperModelId } from '../../core/captions';

// Allow remote model download (first run) and browser-cache reuse (subsequent
// runs). No local model files are bundled.
env.allowLocalModels = false;
if (env.backends?.onnx?.wasm) {
  // Let the runtime pick a sensible thread count for WASM fallback.
  env.backends.onnx.wasm.proxy = false;
}

// ─── Worker message protocol ───

export type WorkerInbound =
  | {
      type: 'generate';
      audio: Float32Array;
      model: WhisperModelId;
      language: string | null;
      timestampMode: TimestampMode;
    };

export type WorkerOutbound =
  | { type: 'backend'; backend: 'webgpu' | 'wasm' }
  | { type: 'download'; file: string; progress: number; loaded: number; total: number }
  | { type: 'status'; stage: 'loading-model' | 'transcribing'; message: string }
  | { type: 'transcribe-progress'; progress: number }
  | { type: 'done'; segments: CaptionSegment[] }
  | { type: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function post(msg: WorkerOutbound): void {
  ctx.postMessage(msg);
}

// One cached pipeline per (model, backend). Switching models or falling back to
// WASM creates a new instance; the previous one is dropped for GC.
let cached: { key: string; pipe: AutomaticSpeechRecognitionPipeline } | null = null;

async function supportsWebGPU(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    const adapter = await gpu.requestAdapter();
    return adapter != null;
  } catch {
    return false;
  }
}

async function loadPipeline(
  model: WhisperModelId,
  device: 'webgpu' | 'wasm',
): Promise<AutomaticSpeechRecognitionPipeline> {
  const key = `${model}@${device}`;
  if (cached && cached.key === key) return cached.pipe;

  const progress_callback = (info: ProgressInfo) => {
    if (info.status === 'progress') {
      post({
        type: 'download',
        file: info.file ?? 'model',
        progress: typeof info.progress === 'number' ? info.progress : 0,
        loaded: info.loaded ?? 0,
        total: info.total ?? 0,
      });
    }
  };

  const pipe = (await pipeline('automatic-speech-recognition', model, {
    device,
    progress_callback,
  })) as AutomaticSpeechRecognitionPipeline;

  cached = { key, pipe };
  return pipe;
}

interface WhisperChunk {
  text: string;
  timestamp: [number, number | null];
}

interface WhisperOutput {
  text?: string;
  chunks?: WhisperChunk[];
}

function toSegments(output: WhisperOutput, totalDuration: number): CaptionSegment[] {
  const chunks = output.chunks ?? [];
  if (chunks.length === 0 && output.text) {
    return [{ text: output.text, start: 0, end: totalDuration }];
  }
  const segments: CaptionSegment[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const start = chunk.timestamp[0] ?? 0;
    // Whisper sometimes omits the final end timestamp; fall back to the next
    // chunk's start or the audio duration.
    let end = chunk.timestamp[1];
    if (end == null) {
      end = chunks[i + 1]?.timestamp[0] ?? totalDuration;
    }
    segments.push({ text: chunk.text ?? '', start, end });
  }
  return segments;
}

async function run(msg: Extract<WorkerInbound, { type: 'generate' }>): Promise<void> {
  const totalDuration = msg.audio.length / 16000;

  let device: 'webgpu' | 'wasm' = (await supportsWebGPU()) ? 'webgpu' : 'wasm';
  post({ type: 'backend', backend: device });

  post({ type: 'status', stage: 'loading-model', message: 'Loading speech model' });
  let pipe: AutomaticSpeechRecognitionPipeline;
  try {
    pipe = await loadPipeline(msg.model, device);
  } catch (e) {
    // WebGPU can fail to initialize on some drivers even when an adapter exists.
    if (device === 'webgpu') {
      device = 'wasm';
      post({ type: 'backend', backend: device });
      post({ type: 'status', stage: 'loading-model', message: 'Loading speech model (CPU)' });
      pipe = await loadPipeline(msg.model, device);
    } else {
      throw e;
    }
  }

  post({ type: 'status', stage: 'transcribing', message: 'Generating captions' });

  const output = (await pipe(msg.audio, {
    return_timestamps: msg.timestampMode === 'word' ? 'word' : true,
    chunk_length_s: 30,
    stride_length_s: 5,
    language: msg.language ?? undefined,
    task: 'transcribe',
  } as Record<string, unknown>)) as WhisperOutput;

  const segments = toSegments(output, totalDuration);
  post({ type: 'done', segments });
}

ctx.addEventListener('message', (event: MessageEvent<WorkerInbound>) => {
  const msg = event.data;
  if (msg.type === 'generate') {
    run(msg).catch((e: unknown) => {
      post({ type: 'error', message: e instanceof Error ? e.message : 'Caption generation failed.' });
    });
  }
});
