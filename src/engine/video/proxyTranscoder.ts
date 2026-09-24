import { planProxy, type ProxySourceMeta } from './proxyPlan';

// Spawns the proxy transcode worker and returns a low-res proxy Blob for heavy footage, or null
// (FAIL-OPEN) when no proxy is warranted or transcoding fails/times out - the caller then just uses the
// original. Serialized (one WebCodecs re-encode at a time) so a batch of imports can't spike CPU/decoder
// pressure. The worker is spawned lazily on first use.

type Outbound = { id: number; buffer?: ArrayBuffer; error?: string };

const TRANSCODE_TIMEOUT_MS = 180_000;

class ProxyTranscoder {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, (blob: Blob | null) => void>();
  private tail: Promise<unknown> = Promise.resolve();

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker;
    if (typeof Worker === 'undefined' || typeof document === 'undefined') return null;
    try {
      const w = new Worker(new URL('./proxyTranscodeWorker.ts', import.meta.url), { type: 'module' });
      w.addEventListener('message', (e: MessageEvent<Outbound>) => {
        const { id, buffer, error } = e.data;
        const cb = this.pending.get(id);
        if (!cb) return;
        this.pending.delete(id);
        cb(error || !buffer ? null : new Blob([buffer], { type: 'video/mp4' }));
      });
      // A worker-level error can't be tied to a specific request; each pending call self-resolves null
      // on its timeout, so nothing leaks.
      w.addEventListener('error', () => { /* fail-open via per-request timeout */ });
      this.worker = w;
    } catch {
      this.worker = null;
    }
    return this.worker;
  }

  /** Transcode `blob` to a low-res proxy per planProxy(meta), or null if not warranted / on any failure. */
  transcode(blob: Blob, meta: ProxySourceMeta): Promise<Blob | null> {
    const plan = planProxy(meta);
    if (!plan) return Promise.resolve(null);
    const run = (): Promise<Blob | null> => new Promise((resolve) => {
      const w = this.ensureWorker();
      if (!w) { resolve(null); return; }
      const id = ++this.seq;
      const timeout = setTimeout(() => { if (this.pending.delete(id)) resolve(null); }, TRANSCODE_TIMEOUT_MS);
      this.pending.set(id, (b) => { clearTimeout(timeout); resolve(b); });
      try {
        w.postMessage({ id, blob, width: plan.width, height: plan.height });
      } catch {
        this.pending.delete(id);
        clearTimeout(timeout);
        resolve(null);
      }
    });
    // Serialize so concurrent imports don't run multiple re-encodes at once.
    const p = this.tail.then(run, run);
    this.tail = p.catch(() => {});
    return p;
  }
}

export const proxyTranscoder = new ProxyTranscoder();
