import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { ChevronDown, Loader2, Download } from 'lucide-react';
import { useEditorStore } from '../../store/editor';

interface LottieIconEntry {
  folder: string;
  filename: string;
  path: string;
}

const LOTTIE_BASE = '/icons/lottieflow';
const COLUMNS = 4;
const OVERSCAN = 3;

type LottieManifest = Record<string, string[]>;

let _lottieModule: any = null;
let _lottiePromise: Promise<any> | null = null;

async function loadLottieLib(): Promise<any> {
  if (_lottieModule) return _lottieModule;
  if (_lottiePromise) return _lottiePromise;

  _lottiePromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js';
    script.onload = () => {
      _lottieModule = (window as any).lottie;
      resolve(_lottieModule);
    };
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });

  return _lottiePromise;
}

let _manifestCache: { folders: string[]; entries: LottieManifest } | null = null;
let _manifestInflight: Promise<{ folders: string[]; entries: LottieManifest }> | null = null;

function fetchManifest() {
  if (_manifestCache) return Promise.resolve(_manifestCache);
  if (_manifestInflight) return _manifestInflight;

  _manifestInflight = fetch(`${LOTTIE_BASE}/manifest.json`)
    .then((r) => r.json())
    .then((data: LottieManifest) => {
      const result = { folders: Object.keys(data).sort(), entries: data };
      _manifestCache = result;
      _manifestInflight = null;
      return result;
    })
    .catch((err) => {
      _manifestInflight = null;
      throw err;
    });

  return _manifestInflight;
}

function useLottieManifest() {
  const [folders, setFolders] = useState<string[]>(_manifestCache?.folders || []);
  const [entries, setEntries] = useState<LottieManifest>(_manifestCache?.entries || {});
  const [loading, setLoading] = useState(!_manifestCache);

  useEffect(() => {
    if (_manifestCache) return;
    fetchManifest()
      .then(({ folders: f, entries: e }) => {
        setFolders(f);
        setEntries(e);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { folders, entries, loading };
}

function interleaveRoundRobin(entries: LottieManifest): LottieIconEntry[] {
  const result: LottieIconEntry[] = [];
  const folderKeys = Object.keys(entries);
  if (folderKeys.length === 0) return result;
  const maxLen = Math.max(...folderKeys.map((k) => entries[k].length));

  for (let i = 0; i < maxLen; i++) {
    for (const folder of folderKeys) {
      const files = entries[folder];
      if (i < files.length) {
        result.push({
          folder,
          filename: files[i],
          path: `${LOTTIE_BASE}/${folder}/${files[i]}`,
        });
      }
    }
  }

  return result;
}

const LottieCell = memo(function LottieCell({
  entry,
  isSelected,
  onSelect,
}: {
  entry: LottieIconEntry;
  isSelected: boolean;
  onSelect: (entry: LottieIconEntry) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const animRef = useRef<any>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;

    loadLottieLib().then((lottie) => {
      if (cancelled || !lottie || !el) return;

      try {
        animRef.current = lottie.loadAnimation({
          container: el,
          renderer: 'canvas',
          loop: true,
          autoplay: true,
          path: entry.path,
        });

        animRef.current.addEventListener('DOMLoaded', () => {
          if (!cancelled) setStatus('ready');
        });

        animRef.current.addEventListener('error', () => {
          if (!cancelled) setStatus('error');
        });
      } catch {
        if (!cancelled) setStatus('error');
      }
    });

    return () => {
      cancelled = true;
      if (animRef.current) {
        animRef.current.destroy();
        animRef.current = null;
      }
    };
  }, [entry.path]);

  if (status === 'error') return null;

  return (
    <button
      onClick={() => onSelect(entry)}
      className={`w-full h-full rounded border flex items-center justify-center overflow-hidden transition-colors relative ${
        isSelected
          ? 'bg-[#f7b500]/10 border-[#f7b500]/50'
          : 'border-transparent hover:border-[#1a2a42] hover:bg-[#122240]'
      }`}
      title={entry.filename.replace('.json', '')}
    >
      <div
        ref={containerRef}
        className="w-8 h-8"
        style={{ opacity: status === 'ready' ? 1 : 0, transition: 'opacity 0.15s', filter: 'invert(1)' }}
      />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-5 h-5 rounded bg-[#1a2a42] animate-pulse" />
        </div>
      )}
    </button>
  );
});

function LottiePreview({ entry }: { entry: LottieIconEntry }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<any>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;

    loadLottieLib().then((lottie) => {
      if (cancelled || !lottie || !el) return;

      animRef.current = lottie.loadAnimation({
        container: el,
        renderer: 'canvas',
        loop: true,
        autoplay: true,
        path: entry.path,
      });
    });

    return () => {
      cancelled = true;
      if (animRef.current) {
        animRef.current.destroy();
        animRef.current = null;
      }
    };
  }, [entry.path]);

  return (
    <div
      ref={containerRef}
      className="w-10 h-10"
      style={{ filter: 'invert(1)' }}
    />
  );
}

function ImportButton({ entry }: { entry: LottieIconEntry }) {
  const addLottieIcon = useEditorStore((s) => s.addLottieIcon);
  const [loading, setLoading] = useState(false);

  const handleImport = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(entry.path);
      if (!resp.ok) throw new Error('Failed to fetch');
      const jsonData = await resp.text();
      const parsed = JSON.parse(jsonData);

      const totalFrames = (parsed.op ?? 60) - (parsed.ip ?? 0);
      const frameRate = parsed.fr ?? 30;
      const sourceWidth = parsed.w ?? 200;
      const sourceHeight = parsed.h ?? 200;
      const name = entry.filename.replace('.json', '');

      addLottieIcon(entry.path, jsonData, totalFrames, frameRate, sourceWidth, sourceHeight, name);
    } catch (err) {
      console.warn('Failed to import lottie icon:', err);
    } finally {
      setLoading(false);
    }
  }, [entry, addLottieIcon]);

  return (
    <button
      onClick={handleImport}
      disabled={loading}
      className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-[#f7b500] hover:bg-[#e5a800] text-[#0a0e14] text-[10px] font-semibold transition-colors disabled:opacity-50"
    >
      {loading ? (
        <Loader2 size={11} className="animate-spin" />
      ) : (
        <Download size={11} />
      )}
      {loading ? 'Importing...' : 'Add to Timeline'}
    </button>
  );
}

function useVirtualGrid(
  itemCount: number,
  columns: number,
  rowHeight: number,
  containerRef: React.RefObject<HTMLDivElement | null>,
) {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener('scroll', onScroll, { passive: true });

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerHeight(entry.contentRect.height);
    });
    observer.observe(el);

    return () => {
      el.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [containerRef]);

  const totalRows = Math.ceil(itemCount / columns);
  const totalHeight = totalRows * rowHeight;

  const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const endRow = Math.min(totalRows - 1, Math.ceil((scrollTop + containerHeight) / rowHeight) + OVERSCAN);

  const visibleIndices: number[] = [];
  for (let row = startRow; row <= endRow; row++) {
    for (let col = 0; col < columns; col++) {
      const idx = row * columns + col;
      if (idx < itemCount) visibleIndices.push(idx);
    }
  }

  return { visibleIndices, totalHeight, startRow, rowHeight };
}

export function AnimatedIconsTab() {
  const { folders, entries, loading } = useLottieManifest();
  const [selectedFolder, setSelectedFolder] = useState<string>('All');
  const [selectedEntry, setSelectedEntry] = useState<LottieIconEntry | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const allItems = useMemo(() => {
    if (selectedFolder === 'All') {
      return interleaveRoundRobin(entries);
    }
    const files = entries[selectedFolder] || [];
    return files.map((f) => ({
      folder: selectedFolder,
      filename: f,
      path: `${LOTTIE_BASE}/${selectedFolder}/${f}`,
    }));
  }, [entries, selectedFolder]);

  const [cellSize, setCellSize] = useState(48);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setCellSize(Math.floor(entry.contentRect.width / COLUMNS));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { visibleIndices, totalHeight } = useVirtualGrid(
    allItems.length,
    COLUMNS,
    cellSize,
    scrollRef,
  );

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [selectedFolder]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const handleSelect = useCallback((entry: LottieIconEntry) => {
    setSelectedEntry(entry);
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Dropdown filter */}
      <div className="px-2 py-1.5 border-b border-[#1a2a42]">
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full flex items-center justify-between gap-1 bg-[#16294a] border border-[#1c3155] rounded px-2 py-1 text-[9px] text-slate-300 hover:border-[#2a3a5c] transition-colors"
          >
            <span className="truncate capitalize">
              {selectedFolder === 'All' ? 'All Categories' : selectedFolder.replace(/-/g, ' ')}
            </span>
            <ChevronDown size={10} className={`text-slate-500 flex-shrink-0 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          {dropdownOpen && (
            <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-[#0d1b30] border border-[#1c3155] rounded shadow-xl max-h-[200px] overflow-y-auto">
              <button
                onClick={() => { setSelectedFolder('All'); setDropdownOpen(false); }}
                className={`w-full text-left px-2 py-1 text-[9px] hover:bg-[#16294a] transition-colors ${
                  selectedFolder === 'All' ? 'text-[#f7b500]' : 'text-slate-300'
                }`}
              >
                All Categories
              </button>
              {folders.map((f) => (
                <button
                  key={f}
                  onClick={() => { setSelectedFolder(f); setDropdownOpen(false); }}
                  className={`w-full text-left px-2 py-1 text-[9px] capitalize hover:bg-[#16294a] transition-colors ${
                    selectedFolder === f ? 'text-[#f7b500]' : 'text-slate-300'
                  }`}
                >
                  {f.replace(/-/g, ' ')}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Virtualized Grid */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 size={16} className="animate-spin text-slate-500" />
          </div>
        )}

        {!loading && allItems.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-600">
            No animations in this category
          </div>
        )}

        {!loading && allItems.length > 0 && (
          <div style={{ height: totalHeight, position: 'relative' }}>
            {visibleIndices.map((idx) => {
              const row = Math.floor(idx / COLUMNS);
              const col = idx % COLUMNS;
              const entry = allItems[idx];
              return (
                <div
                  key={entry.path}
                  style={{
                    position: 'absolute',
                    top: row * cellSize,
                    left: col * cellSize,
                    width: cellSize,
                    height: cellSize,
                    padding: 2,
                  }}
                >
                  <LottieCell
                    entry={entry}
                    isSelected={selectedEntry?.path === entry.path}
                    onSelect={handleSelect}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selection preview */}
      {selectedEntry && (
        <div className="flex-shrink-0 border-t border-[#1a2a42] bg-[#0a1628] px-2 py-2 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded border border-[#1a2a42] bg-[#06101a] flex items-center justify-center flex-shrink-0 overflow-hidden">
              <LottiePreview entry={selectedEntry} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-slate-200 truncate">
                {selectedEntry.filename.replace('.json', '')}
              </div>
              <div className="text-[8px] text-slate-600 capitalize truncate">
                {selectedEntry.folder.replace(/-/g, ' ')}
              </div>
            </div>
          </div>
          <ImportButton entry={selectedEntry} />
        </div>
      )}
    </div>
  );
}
