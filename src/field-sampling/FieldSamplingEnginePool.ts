import type { FieldSampledConfig } from './types';

interface WorkerEntry {
  worker: Worker;
  ready: boolean;
  lastFrame: number;
}

class FieldSamplingEnginePool {
  private entries: Map<string, WorkerEntry> = new Map();

  addLayer(layerId: string, width: number, height: number, config: FieldSampledConfig): void {
    if (this.entries.has(layerId)) return;

    try {
      const canvas = new OffscreenCanvas(width, height);
      const worker = new Worker(
        new URL('./fieldWorker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.postMessage(
        { type: 'INIT', canvas, config },
        [canvas]
      );

      const entry: WorkerEntry = { worker, ready: false, lastFrame: -1 };

      worker.onmessage = (e) => {
        if (e.data.type === 'READY') {
          entry.ready = true;
        }
      };

      this.entries.set(layerId, entry);
    } catch {
      // WebGPU not available in worker - fallback to CPU renderer
    }
  }

  removeLayer(layerId: string): void {
    const entry = this.entries.get(layerId);
    if (!entry) return;
    entry.worker.postMessage({ type: 'DESTROY' });
    this.entries.delete(layerId);
  }

  updateConfig(layerId: string, delta: Partial<FieldSampledConfig>): void {
    const entry = this.entries.get(layerId);
    if (!entry || !entry.ready) return;
    entry.worker.postMessage({ type: 'CONFIG_UPDATE', delta });
  }

  tickFrame(frameNumber: number, totalFrames: number): void {
    const t = totalFrames > 0 ? frameNumber / totalFrames : 0;

    for (const [_, entry] of this.entries) {
      if (!entry.ready) continue;
      if (entry.lastFrame === frameNumber) continue;
      entry.lastFrame = frameNumber;
      entry.worker.postMessage({ type: 'FRAME', frameNumber, t });
    }
  }

  hasLayer(layerId: string): boolean {
    return this.entries.has(layerId);
  }

  isReady(layerId: string): boolean {
    return this.entries.get(layerId)?.ready ?? false;
  }

  getActiveCount(): number {
    return this.entries.size;
  }

  destroy(): void {
    for (const [_, entry] of this.entries) {
      entry.worker.postMessage({ type: 'DESTROY' });
    }
    this.entries.clear();
  }
}

export const fieldEnginePool = new FieldSamplingEnginePool();
