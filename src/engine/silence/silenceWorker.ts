/// <reference lib="webworker" />
import { computeRmsDb } from '../../core/silenceDetection';

export type WorkerInbound = {
  type: 'analyze';
  audio: Float32Array;
  sampleRate: number;
  windowSec: number;
};

export type WorkerOutbound =
  | { type: 'progress'; fraction: number }
  | { type: 'done'; db: Float32Array; windowSec: number; durationSec: number }
  | { type: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function post(msg: WorkerOutbound, transfer?: Transferable[]): void {
  ctx.postMessage(msg, transfer ?? []);
}

ctx.addEventListener('message', (event: MessageEvent<WorkerInbound>) => {
  const msg = event.data;
  if (msg.type !== 'analyze') return;
  try {
    let lastSent = 0;
    const analysis = computeRmsDb(msg.audio, msg.sampleRate, msg.windowSec, (fraction) => {
      // Throttle progress messages to whole-percent steps.
      const pct = Math.floor(fraction * 100);
      if (pct > lastSent) {
        lastSent = pct;
        post({ type: 'progress', fraction });
      }
    });
    post(
      { type: 'done', db: analysis.db, windowSec: analysis.windowSec, durationSec: analysis.durationSec },
      [analysis.db.buffer],
    );
  } catch (e) {
    post({ type: 'error', message: (e as Error).message });
  }
});
