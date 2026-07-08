import { computeRmsDb, type RmsAnalysis } from '../../core/silenceDetection';

export interface SilenceAnalysisHandlers {
  onProgress?: (fraction: number) => void;
}

let worker: Worker | null = null;
let workerFailed = false;

function tryCreateWorker(): Worker | null {
  if (workerFailed) return null;
  try {
    return new Worker(new URL('./silenceWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    workerFailed = true;
    return null;
  }
}

function getWorker(): Worker | null {
  if (!worker) {
    worker = tryCreateWorker();
  }
  return worker;
}

export function disposeSilenceWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

export function analyzeAudioLoudness(
  audio: Float32Array,
  sampleRate: number,
  windowSec: number,
  handlers: SilenceAnalysisHandlers,
  signal?: AbortSignal,
): Promise<RmsAnalysis> {
  const w = getWorker();

  if (!w) {
    return analyzeOnMainThread(audio, sampleRate, windowSec, handlers, signal);
  }

  return analyzeViaWorker(w, audio, sampleRate, windowSec, handlers, signal);
}

function analyzeOnMainThread(
  audio: Float32Array,
  sampleRate: number,
  windowSec: number,
  handlers: SilenceAnalysisHandlers,
  signal?: AbortSignal,
): Promise<RmsAnalysis> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Silence analysis cancelled'));
      return;
    }

    const onAbort = () => reject(new Error('Silence analysis cancelled'));
    signal?.addEventListener('abort', onAbort, { once: true });

    // Use setTimeout to yield to the event loop periodically for progress updates
    setTimeout(() => {
      try {
        const analysis = computeRmsDb(audio, sampleRate, windowSec, (fraction) => {
          handlers.onProgress?.(fraction);
        });
        signal?.removeEventListener('abort', onAbort);
        resolve(analysis);
      } catch (e) {
        signal?.removeEventListener('abort', onAbort);
        reject(e);
      }
    }, 0);
  });
}

function analyzeViaWorker(
  w: Worker,
  audio: Float32Array,
  sampleRate: number,
  windowSec: number,
  handlers: SilenceAnalysisHandlers,
  signal?: AbortSignal,
): Promise<RmsAnalysis> {
  return new Promise<RmsAnalysis>((resolve, reject) => {
    const cleanup = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };

    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      switch (msg.type) {
        case 'progress':
          handlers.onProgress?.(msg.fraction);
          break;
        case 'done':
          cleanup();
          resolve({ db: msg.db, windowSec: msg.windowSec, durationSec: msg.durationSec });
          break;
        case 'error':
          cleanup();
          disposeSilenceWorker();
          reject(new Error(msg.message));
          break;
      }
    };

    const onError = (_event: ErrorEvent) => {
      cleanup();
      disposeSilenceWorker();
      workerFailed = true;
      // Worker failed to load -- fall back to main thread analysis
      analyzeOnMainThread(audio.length > 0 ? audio : new Float32Array(0), sampleRate, windowSec, handlers, signal)
        .then(resolve)
        .catch(reject);
    };

    const onAbort = () => {
      cleanup();
      disposeSilenceWorker();
      reject(new Error('Silence analysis cancelled'));
    };

    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort);

    const message = { type: 'analyze', audio, sampleRate, windowSec };
    w.postMessage(message, [audio.buffer]);
  });
}
