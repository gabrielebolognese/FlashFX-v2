import { useEffect, useState, useRef } from 'react';
import type { IconData, IconIndexEntry } from './types';
import { loadIconChunks } from './IconChunkLoader';

const MAX_RESULTS = 120;
const DEBOUNCE_MS = 150;

interface SearchState {
  query: string;
  results: IconData[];
  loading: boolean;
  error: string | null;
}

let _indexCache: IconIndexEntry[] | null = null;
let _indexInflight: Promise<IconIndexEntry[]> | null = null;

async function loadIndex(): Promise<IconIndexEntry[]> {
  if (_indexCache) return _indexCache;
  if (_indexInflight) return _indexInflight;

  _indexInflight = fetch('/icons/index.json')
    .then((r) => {
      if (!r.ok) throw new Error(`Failed to load icon index: ${r.status}`);
      return r.json() as Promise<IconIndexEntry[]>;
    })
    .then((data) => {
      _indexCache = data;
      _indexInflight = null;
      return data;
    })
    .catch((err) => {
      _indexInflight = null;
      throw err;
    });

  return _indexInflight;
}

function scoreEntry(entry: IconIndexEntry, query: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const name = entry.name.toLowerCase();
  const id = entry.id.toLowerCase();

  if (name === q || id === q) return 100;
  if (name.startsWith(q) || id.startsWith(q)) return 60;
  if (name.includes(q) || id.includes(q)) return 30;

  for (const tag of entry.tags) {
    if (tag.toLowerCase().includes(q)) return 15;
  }

  return 0;
}

export function useIconSearch(rawQuery: string) {
  const [state, setState] = useState<SearchState>({
    query: '',
    results: [],
    loading: true,
    error: null,
  });

  const indexRef = useRef<IconIndexEntry[] | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    let cancelled = false;

    loadIndex()
      .then((index) => {
        if (cancelled) return;
        indexRef.current = index;
        setState((s) => ({ ...s, loading: false }));
      })
      .catch((err) => {
        if (cancelled) return;
        setState((s) => ({ ...s, loading: false, error: String(err) }));
      });

    return () => {
      cancelled = true;
      cancelRef.current = true;
    };
  }, []);

  useEffect(() => {
    const query = rawQuery.trim();

    const handle = window.setTimeout(async () => {
      const index = indexRef.current;
      if (!index) return;

      let candidates: IconIndexEntry[];

      if (!query) {
        candidates = index.slice(0, MAX_RESULTS);
      } else {
        const scored: Array<{ entry: IconIndexEntry; score: number }> = [];
        for (const entry of index) {
          const score = scoreEntry(entry, query);
          if (score > 0) scored.push({ entry, score });
        }
        scored.sort((a, b) => b.score - a.score);
        candidates = scored.slice(0, MAX_RESULTS).map((s) => s.entry);
      }

      const idOrder = new Map<string, number>();
      candidates.forEach((c, i) => idOrder.set(c.id, i));
      const chunkNames = Array.from(new Set(candidates.map((c) => c.chunk)));

      setState((s) => ({ ...s, query, loading: true, error: null }));

      try {
        const allIcons = await loadIconChunks(chunkNames);
        if (cancelRef.current) return;

        const idSet = new Set(idOrder.keys());
        const results = allIcons
          .filter((i) => idSet.has(i.id))
          .sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));

        setState({ query, results, loading: false, error: null });
      } catch (err) {
        if (cancelRef.current) return;
        setState((s) => ({ ...s, loading: false, error: String(err) }));
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(handle);
    };
  }, [rawQuery]);

  return state;
}
