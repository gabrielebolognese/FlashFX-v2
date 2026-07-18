import type {
  ExpressionContext,
  ExpressionValue,
  WorkerInbound,
  WorkerOutbound,
} from './types';
import { useExpressionStore } from './store';
import { getSettingValue } from '../settings/store';

function getEvalTimeout(): number {
  return getSettingValue<number>('interaction.expression.timeout') ?? 50;
}
function getMaxTimeouts(): number {
  return getSettingValue<number>('interaction.expression.maxTimeouts') ?? 3;
}

interface PendingRequest {
  resolve: (msg: WorkerOutbound) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface EvalState {
  inFlight: boolean;
  lastFrame: number;
  consecutiveTimeouts: number;
}

export class ExpressionManager {
  private worker: Worker | null = null;
  private cache = new Map<string, ExpressionValue>();
  private pending = new Map<string, PendingRequest>();
  private evalState = new Map<string, EvalState>();
  private idCounter = 0;

  constructor() {
    this.spawnWorker();
  }

  private spawnWorker(): void {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.addEventListener('message', this.handleMessage);
    this.worker.addEventListener('error', () => this.recoverWorker());
  }

  private handleMessage = (event: MessageEvent<WorkerOutbound>): void => {
    const msg = event.data;
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(msg.id);
    pending.resolve(msg);
  };

  private recoverWorker(): void {
    if (this.worker) {
      this.worker.removeEventListener('message', this.handleMessage);
      this.worker.terminate();
      this.worker = null;
    }
    for (const [id, req] of this.pending) {
      clearTimeout(req.timer);
      req.resolve({ type: 'eval-error', id, error: 'Worker crashed' });
    }
    this.pending.clear();
    for (const state of this.evalState.values()) {
      state.inFlight = false;
    }
    this.spawnWorker();
  }

  private nextId(): string {
    return String(++this.idCounter);
  }

  private send(msg: WorkerInbound): Promise<WorkerOutbound> {
    const id = msg.id;
    return new Promise<WorkerOutbound>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ type: 'eval-error', id, error: 'Expression timed out (possible infinite loop)' });
        this.recoverWorker();
      }, getEvalTimeout());
      this.pending.set(id, { resolve, timer });
      this.worker!.postMessage(msg);
    });
  }

  private cacheKey(layerId: string, propertyPath: string): string {
    return `${layerId}::${propertyPath}`;
  }

  private getEvalState(key: string): EvalState {
    let state = this.evalState.get(key);
    if (!state) {
      state = { inFlight: false, lastFrame: -1, consecutiveTimeouts: 0 };
      this.evalState.set(key, state);
    }
    return state;
  }

  evaluate(
    layerId: string,
    propertyPath: string,
    context: ExpressionContext,
  ): ExpressionValue | null {
    const store = useExpressionStore.getState();
    const def = store.getExpression(layerId, propertyPath);
    if (!def || !def.enabled || !def.code.trim()) return null;

    const key = this.cacheKey(layerId, propertyPath);
    const state = this.getEvalState(key);

    // Dedup: same frame as last evaluation, return cached
    if (state.lastFrame === context.frame && this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    // Throttle: worker still processing previous request for this expression
    if (state.inFlight) {
      return this.cache.get(key) ?? null;
    }

    state.lastFrame = context.frame;
    state.inFlight = true;
    const id = this.nextId();

    this.send({ type: 'eval', id, code: def.code, context }).then((msg) => {
      state.inFlight = false;

      if (msg.type === 'eval-result') {
        this.cache.set(key, msg.value);
        state.consecutiveTimeouts = 0;
        if (def.error !== null) {
          store.setError(layerId, propertyPath, null);
        }
      } else if (msg.type === 'eval-error') {
        const isTimeout = msg.error.includes('timed out');
        if (isTimeout) {
          state.consecutiveTimeouts++;
          if (state.consecutiveTimeouts >= getMaxTimeouts()) {
            store.setEnabled(layerId, propertyPath, false);
            store.setError(layerId, propertyPath, 'Expression auto-disabled: too slow (timed out 3 consecutive times)');
            state.consecutiveTimeouts = 0;
          } else {
            store.setError(layerId, propertyPath, msg.error);
          }
        } else {
          state.consecutiveTimeouts = 0;
          store.setError(layerId, propertyPath, msg.error);
        }
      }
    });

    return this.cache.get(key) ?? null;
  }

  getCached(layerId: string, propertyPath: string): ExpressionValue | null {
    return this.cache.get(this.cacheKey(layerId, propertyPath)) ?? null;
  }

  hasActiveExpression(layerId: string, propertyPath: string): boolean {
    const def = useExpressionStore.getState().getExpression(layerId, propertyPath);
    return !!def && def.enabled && !!def.code.trim();
  }

  async validate(code: string): Promise<string | null> {
    const id = this.nextId();
    const msg = await this.send({ type: 'validate', id, code });
    if (msg.type === 'validate-result') return msg.error;
    return (msg as any).error ?? 'Unknown validation error';
  }

  clearCache(layerId?: string): void {
    if (!layerId) {
      this.cache.clear();
      this.evalState.clear();
      return;
    }
    const prefix = `${layerId}::`;
    for (const key of [...this.cache.keys()]) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
    for (const key of [...this.evalState.keys()]) {
      if (key.startsWith(prefix)) this.evalState.delete(key);
    }
  }

  dispose(): void {
    if (this.worker) {
      this.worker.removeEventListener('message', this.handleMessage);
      this.worker.terminate();
      this.worker = null;
    }
    for (const [, req] of this.pending) {
      clearTimeout(req.timer);
    }
    this.pending.clear();
    this.cache.clear();
    this.evalState.clear();
  }
}

export const expressionManager = new ExpressionManager();
