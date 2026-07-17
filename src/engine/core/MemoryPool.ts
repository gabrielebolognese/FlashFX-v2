export class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private reset: (obj: T) => void;

  constructor(factory: () => T, reset: (obj: T) => void, initialSize = 32) {
    this.factory = factory;
    this.reset = reset;
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }

  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.factory();
  }

  release(obj: T): void {
    this.reset(obj);
    this.pool.push(obj);
  }

  get size(): number {
    return this.pool.length;
  }

  drain(): void {
    this.pool.length = 0;
  }
}

export interface PooledResolvedProps {
  [key: string]: number | string | undefined;
  _pooled?: boolean;
}

const resolvedPropsKeys = [
  'x', 'y', 'width', 'height', 'rotation', 'opacity',
  'fill', 'stroke', 'strokeWidth', 'borderRadius',
  'scaleX', 'scaleY', 'shadowBlur', 'shadowX', 'shadowY',
  'fontSize', 'letterSpacing',
];

function createResolvedProps(): PooledResolvedProps {
  const obj: PooledResolvedProps = { _pooled: true };
  for (const key of resolvedPropsKeys) {
    obj[key] = undefined;
  }
  return obj;
}

function resetResolvedProps(obj: PooledResolvedProps): void {
  for (const key of resolvedPropsKeys) {
    obj[key] = undefined;
  }
}

export const resolvedPropsPool = new ObjectPool(
  createResolvedProps,
  resetResolvedProps,
  64
);

export class FrameCache {
  private cache: Map<number, Map<string, PooledResolvedProps>> = new Map();
  private maxFrames: number;
  private accessOrder: number[] = [];

  constructor(maxFrames = 120) {
    this.maxFrames = maxFrames;
  }

  get(frame: number): Map<string, PooledResolvedProps> | undefined {
    const entry = this.cache.get(frame);
    if (entry) {
      const idx = this.accessOrder.indexOf(frame);
      if (idx !== -1) {
        this.accessOrder.splice(idx, 1);
        this.accessOrder.push(frame);
      }
    }
    return entry;
  }

  set(frame: number, state: Map<string, PooledResolvedProps>): void {
    if (this.cache.size >= this.maxFrames && !this.cache.has(frame)) {
      const oldest = this.accessOrder.shift();
      if (oldest !== undefined) {
        const evicted = this.cache.get(oldest);
        if (evicted) {
          for (const props of evicted.values()) {
            resolvedPropsPool.release(props);
          }
          this.cache.delete(oldest);
        }
      }
    }
    this.cache.set(frame, state);
    this.accessOrder.push(frame);
  }

  invalidate(): void {
    for (const entry of this.cache.values()) {
      for (const props of entry.values()) {
        resolvedPropsPool.release(props);
      }
    }
    this.cache.clear();
    this.accessOrder.length = 0;
  }

  get size(): number {
    return this.cache.size;
  }
}
