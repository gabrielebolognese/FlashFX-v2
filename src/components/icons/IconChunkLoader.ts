import type { IconData } from './types';

const chunkCache: Map<string, IconData[]> = new Map();
const inflight: Map<string, Promise<IconData[]>> = new Map();

export async function loadIconChunk(name: string): Promise<IconData[]> {
  const cached = chunkCache.get(name);
  if (cached) return cached;

  const pending = inflight.get(name);
  if (pending) return pending;

  const promise = fetch(`/icons/chunks/${name}.json`)
    .then((r) => {
      if (!r.ok) {
        throw new Error(`Failed to load icon chunk ${name}: ${r.status}`);
      }
      return r.json() as Promise<IconData[]>;
    })
    .then((data) => {
      chunkCache.set(name, data);
      inflight.delete(name);
      return data;
    })
    .catch((err) => {
      inflight.delete(name);
      throw err;
    });

  inflight.set(name, promise);
  return promise;
}

export async function loadIconChunks(names: string[]): Promise<IconData[]> {
  const unique = Array.from(new Set(names));
  const chunks = await Promise.all(unique.map(loadIconChunk));
  return chunks.flat();
}

export function getCachedIcon(id: string): IconData | undefined {
  for (const list of chunkCache.values()) {
    const found = list.find((i) => i.id === id);
    if (found) return found;
  }
  return undefined;
}
