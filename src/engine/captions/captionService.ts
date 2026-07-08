import type { CaptionSegment, CaptionOptions } from '../../core/captions';
import type { WorkerInbound, WorkerOutbound } from './captionWorker';

export type CaptionBackend = 'webgpu' | 'wasm';

export interface CaptionProgressHandlers {
  onBackend?: (backend: CaptionBackend) => void;
  onDownload?: (info: { file: string; progress: number; loaded: number; total: number }) => void;
  onStatus?: (stage: 'loading-model' | 'transcribing', message: string) => void;
  onTranscribeProgress?: (progress: number) => void;
}

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    try {
      worker = new Worker(new URL('./captionWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      throw new Error('Caption worker failed to load');
    }
  }
  return worker;
}

// Drop the worker so a fresh one is spawned next time. Used after fatal errors
// to release model memory and reset runtime state.
export function disposeCaptionWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

// Run one transcription job. Resolves with cleaned-elsewhere raw segments, or
// rejects on worker error / abort. Only one job should be in flight at a time.
export function generateCaptions(
  audio: Float32Array,
  options: CaptionOptions,
  handlers: CaptionProgressHandlers,
  signal?: AbortSignal,
): Promise<CaptionSegment[]> {
  return new Promise<CaptionSegment[]>((resolve, reject) => {
    const w = getWorker();

    const cleanup = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };

    const onMessage = (event: MessageEvent<WorkerOutbound>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'backend':
          handlers.onBackend?.(msg.backend);
          break;
        case 'download':
          handlers.onDownload?.(msg);
          break;
        case 'status':
          handlers.onStatus?.(msg.stage, msg.message);
          break;
        case 'transcribe-progress':
          handlers.onTranscribeProgress?.(msg.progress);
          break;
        case 'done':
          cleanup();
          resolve(msg.segments);
          break;
        case 'error':
          cleanup();
          disposeCaptionWorker();
          reject(new Error(msg.message));
          break;
      }
    };

    const onError = (event: ErrorEvent) => {
      cleanup();
      disposeCaptionWorker();
      reject(new Error(event.message || 'Caption worker crashed.'));
    };

    const onAbort = () => {
      cleanup();
      // Terminating is the only reliable way to stop in-flight inference.
      disposeCaptionWorker();
      reject(new Error('Caption generation cancelled'));
    };

    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort);

    const message: WorkerInbound = {
      type: 'generate',
      audio,
      model: options.model,
      language: options.language,
      timestampMode: options.timestampMode,
    };
    // Transfer the audio buffer to avoid copying large arrays into the worker.
    w.postMessage(message, [audio.buffer]);
  });
}
