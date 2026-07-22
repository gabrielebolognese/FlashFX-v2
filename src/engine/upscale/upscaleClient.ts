import type { UpscaleInbound, UpscaleOutbound } from './upscaleWorker';

// 2x classical super-resolution (Swin2SR, ONNX). Runs fully client-side via
// transformers.js (WebGPU with a WASM fallback). The model is fetched from the
// HF hub on first use and cached by the browser thereafter.
export const UPSCALE_MODEL = 'Xenova/swin2SR-classical-sr-x2-64';
export const UPSCALE_FACTOR = 2;

// Cap the long side of the INPUT so super-resolution stays within browser memory
// (output is ~2x this). Images at/under this pass through untouched; only very
// large sources are downscaled first.
const MAX_INPUT_SIDE = 2048;

export interface UpscaleHandlers {
  onBackend?: (backend: 'webgpu' | 'wasm') => void;
  onDownload?: (progress: number) => void;
  onProcessing?: () => void;
}

export interface UpscaleResult {
  blob: Blob;
  width: number;
  height: number;
}

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    try {
      worker = new Worker(new URL('./upscaleWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      throw new Error('Upscale worker failed to load');
    }
  }
  return worker;
}

// Drop the worker so a fresh one spawns next time — releases model memory after
// a fatal error or cancellation.
export function disposeUpscaleWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

async function prepareInput(source: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(source);
  const long = Math.max(bmp.width, bmp.height);
  if (long <= MAX_INPUT_SIDE) {
    bmp.close();
    return source;
  }
  const scale = MAX_INPUT_SIDE / long;
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d');
  if (!c) { bmp.close(); return source; }
  c.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Resize failed'))), 'image/png'),
  );
}

/**
 * Upscale an image blob 2x using an in-browser super-resolution model. Resolves
 * with the enlarged PNG blob and its dimensions. Reports model-download and
 * processing progress through `handlers`.
 */
export async function upscaleImage(source: Blob, handlers: UpscaleHandlers = {}): Promise<UpscaleResult> {
  const image = await prepareInput(source);

  return new Promise<UpscaleResult>((resolve, reject) => {
    const w = getWorker();

    const cleanup = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
    };

    const onMessage = (event: MessageEvent<UpscaleOutbound>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'backend':
          handlers.onBackend?.(msg.backend);
          break;
        case 'download':
          handlers.onDownload?.(msg.progress);
          break;
        case 'status':
          handlers.onProcessing?.();
          break;
        case 'done':
          cleanup();
          resolve({ blob: msg.blob, width: msg.width, height: msg.height });
          break;
        case 'error':
          cleanup();
          disposeUpscaleWorker();
          reject(new Error(msg.message));
          break;
      }
    };

    const onError = (event: ErrorEvent) => {
      cleanup();
      disposeUpscaleWorker();
      reject(new Error(event.message || 'Upscale worker crashed.'));
    };

    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);

    const message: UpscaleInbound = { type: 'upscale', image, model: UPSCALE_MODEL };
    w.postMessage(message);
  });
}
