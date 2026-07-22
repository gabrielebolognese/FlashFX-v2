/// <reference lib="webworker" />
import {
  pipeline,
  env,
  RawImage,
  type ImageToImagePipeline,
  type ProgressInfo,
} from '@huggingface/transformers';

// Download models from the HF hub on first run; reuse the browser cache after.
// No local model files are bundled (mirrors the caption worker).
env.allowLocalModels = false;
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.proxy = false;
}

// ─── Worker message protocol ───

export type UpscaleInbound = {
  type: 'upscale';
  image: Blob;
  model: string;
};

export type UpscaleOutbound =
  | { type: 'backend'; backend: 'webgpu' | 'wasm' }
  | { type: 'download'; file: string; progress: number }
  | { type: 'status'; stage: 'processing' }
  | { type: 'done'; blob: Blob; width: number; height: number }
  | { type: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function post(msg: UpscaleOutbound): void {
  ctx.postMessage(msg);
}

// One cached pipeline per (model, backend).
let cached: { key: string; pipe: ImageToImagePipeline } | null = null;

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

async function loadPipeline(model: string, device: 'webgpu' | 'wasm'): Promise<ImageToImagePipeline> {
  const key = `${model}@${device}`;
  if (cached && cached.key === key) return cached.pipe;

  const progress_callback = (info: ProgressInfo) => {
    if (info.status === 'progress') {
      post({
        type: 'download',
        file: info.file ?? 'model',
        progress: typeof info.progress === 'number' ? info.progress : 0,
      });
    }
  };

  const pipe = (await pipeline('image-to-image', model, {
    device,
    progress_callback,
  })) as ImageToImagePipeline;

  cached = { key, pipe };
  return pipe;
}

async function run(model: string, device: 'webgpu' | 'wasm', image: Blob): Promise<RawImage> {
  const pipe = await loadPipeline(model, device);
  post({ type: 'status', stage: 'processing' });
  const input = await RawImage.fromBlob(image);
  const output = (await pipe(input)) as RawImage | RawImage[];
  return Array.isArray(output) ? output[0] : output;
}

ctx.addEventListener('message', async (event: MessageEvent<UpscaleInbound>) => {
  const msg = event.data;
  if (msg.type !== 'upscale') return;

  try {
    let device: 'webgpu' | 'wasm' = (await supportsWebGPU()) ? 'webgpu' : 'wasm';
    post({ type: 'backend', backend: device });

    let result: RawImage;
    try {
      result = await run(msg.model, device, msg.image);
    } catch (err) {
      // Swin2SR's ONNX ops aren't all supported on the WebGPU EP — fall back to
      // WASM for the whole load+inference (cached weights are reused).
      if (device === 'webgpu') {
        device = 'wasm';
        post({ type: 'backend', backend: device });
        result = await run(msg.model, device, msg.image);
      } else {
        throw err;
      }
    }

    const blob = (await result.toBlob('image/png')) as Blob;
    post({ type: 'done', blob, width: result.width, height: result.height });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : 'Upscale failed' });
  }
});
