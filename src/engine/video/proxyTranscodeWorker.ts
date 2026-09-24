/// <reference lib="webworker" />
import { Input, BlobSource, ALL_FORMATS, Output, Mp4OutputFormat, BufferTarget, Conversion } from 'mediabunny';

// Background proxy transcode (PB4b): re-encode a source video to a low-res proxy (downscaled to the
// caller's target dims, per proxyPlan) so heavy/long footage scrubs smoothly. Runs off the main thread.
// Audio is dropped (the proxy is video-only; audio plays from the original). Fully guarded: any failure
// posts an error and the caller falls back to the original video (fail-open - a proxy is never required).

const ctx = self as unknown as DedicatedWorkerGlobalScope;

interface ProxyRequest { id: number; blob: Blob; width: number; height: number; }

ctx.addEventListener('message', async (event: MessageEvent<ProxyRequest>) => {
  const { id, blob, width, height } = event.data;
  try {
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      video: { width, height, fit: 'contain' },
      audio: { discard: true },
    });
    await conversion.execute();
    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer || buffer.byteLength < 1024) { ctx.postMessage({ id, error: 'empty proxy' }); return; }
    ctx.postMessage({ id, buffer }, [buffer]);
  } catch (err) {
    ctx.postMessage({ id, error: String((err as Error)?.message ?? err) });
  }
});
