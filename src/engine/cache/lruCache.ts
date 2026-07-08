// Generic LRU cache manager with a byte budget and last-access tracking.
//
// This is the eviction core of the Cached Render Tree: it stores expensive,
// reusable render artifacts (tessellated geometry, rasterized text textures)
// keyed by a content signature, and evicts the least-recently-used entries once
// the total estimated byte footprint or entry count exceeds the configured
// budget. Entries that are in use this frame can be pinned so they are never
// evicted while still needed.
//
// Map iteration order is insertion order, so we approximate recency by deleting
// and re-inserting an entry on every access — the oldest live entry is always
// the first key returned by the iterator, which is what eviction removes.

export interface LruEntry<V> {
  value: V;
  bytes: number;
  lastAccess: number;
}

export interface LruStats {
  hits: number;
  misses: number;
  evictions: number;
  entries: number;
  bytes: number;
  maxBytes: number;
}

export interface LruCacheOptions<V> {
  maxBytes: number;
  maxEntries: number;
  // Called when an entry is dropped (eviction, delete, or clear) so the owner
  // can release the underlying resource — e.g. destroy a GPUTexture.
  onEvict?: (key: string, value: V) => void;
  // Optional predicate; when it returns true the key is treated as in-use and
  // skipped during eviction. Used to protect layers being drawn this frame.
  isPinned?: (key: string) => boolean;
}

export class LruCache<V> {
  private map = new Map<string, LruEntry<V>>();
  private totalBytes = 0;
  private clock = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private maxBytes: number;
  private maxEntries: number;
  private onEvict?: (key: string, value: V) => void;
  private isPinned?: (key: string) => boolean;

  constructor(opts: LruCacheOptions<V>) {
    this.maxBytes = opts.maxBytes;
    this.maxEntries = opts.maxEntries;
    this.onEvict = opts.onEvict;
    this.isPinned = opts.isPinned;
  }

  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    this.hits++;
    entry.lastAccess = ++this.clock;
    // Re-insert to move to the most-recently-used end of the iteration order.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  peek(key: string): V | undefined {
    return this.map.get(key)?.value;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  set(key: string, value: V, bytes: number): void {
    const existing = this.map.get(key);
    if (existing) {
      this.totalBytes -= existing.bytes;
      if (existing.value !== value) {
        this.onEvict?.(key, existing.value);
      }
      this.map.delete(key);
    }
    const entry: LruEntry<V> = { value, bytes: Math.max(0, bytes), lastAccess: ++this.clock };
    this.map.set(key, entry);
    this.totalBytes += entry.bytes;
    this.evictToBudget();
  }

  delete(key: string): void {
    const entry = this.map.get(key);
    if (!entry) return;
    this.totalBytes -= entry.bytes;
    this.map.delete(key);
    this.onEvict?.(key, entry.value);
  }

  clear(): void {
    for (const [key, entry] of this.map) {
      this.onEvict?.(key, entry.value);
    }
    this.map.clear();
    this.totalBytes = 0;
  }

  private evictToBudget(): void {
    if (this.map.size <= this.maxEntries && this.totalBytes <= this.maxBytes) return;

    // Iterate oldest-first; skip pinned keys so in-use resources survive.
    const it = this.map.keys();
    let guard = this.map.size;
    while (
      (this.map.size > this.maxEntries || this.totalBytes > this.maxBytes) &&
      guard-- > 0
    ) {
      const next = it.next();
      if (next.done) break;
      const key = next.value;
      if (this.isPinned?.(key)) continue;
      const entry = this.map.get(key);
      if (!entry) continue;
      this.totalBytes -= entry.bytes;
      this.map.delete(key);
      this.onEvict?.(key, entry.value);
      this.evictions++;
    }
  }

  get size(): number {
    return this.map.size;
  }

  get bytes(): number {
    return this.totalBytes;
  }

  stats(): LruStats {
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      entries: this.map.size,
      bytes: this.totalBytes,
      maxBytes: this.maxBytes,
    };
  }

  resetCounters(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }
}
