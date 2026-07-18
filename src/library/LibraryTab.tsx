import { useState, useCallback, useEffect, useRef } from 'react';
import { usePanelStore } from '../store/panels';
import {
  Folder,
  ChevronRight,
  ChevronLeft,
  Download,
  Loader2,
  Film,
  Image,
  Music,
  FileText,
  AlertCircle,
  Home,
  Grid2x2,
  Grid3x3,
  Play,
  Pause,
  Search,
  X,
  Check,
} from 'lucide-react';
import { listDriveFolder, searchDriveAssets, getDriveStreamUrl } from './driveService';
import { useEditorStore } from '../store/editor';
import { useProjectStore } from '../project-system/hooks/useProjectStore';
import type { DriveItem } from './types';

interface BreadcrumbItem {
  id: string;
  name: string;
}

function getFileIcon(item: DriveItem) {
  if (item.isFolder) return <Folder size={18} className="text-[#f7b500]" />;
  if (item.mimeType.startsWith('video/')) return <Film size={18} className="text-blue-400" />;
  if (item.mimeType.startsWith('image/')) return <Image size={18} className="text-emerald-400" />;
  if (item.mimeType.startsWith('audio/')) return <Music size={18} className="text-amber-400" />;
  return <FileText size={18} className="text-slate-500" />;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// --- Audio Waveform Player Card ---

function AudioCard({
  file,
  downloadingId,
  importedIds,
  onImport,
}: {
  file: DriveItem;
  downloadingId: string | null;
  importedIds: Set<string>;
  onImport: (file: DriveItem) => void;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef(0);

  const loadAudio = useCallback(async () => {
    if (audioRef.current) return;
    setAudioLoading(true);
    setAudioError(false);

    try {
      const streamUrl = getDriveStreamUrl(file.id);
      const audio = new Audio(streamUrl);
      audioRef.current = audio;

      audio.addEventListener('loadedmetadata', () => {
        setDuration(audio.duration);
        setAudioLoading(false);
      });

      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        setCurrentTime(0);
      });

      audio.addEventListener('error', () => {
        setAudioError(true);
        setAudioLoading(false);
      });

      // Generate a pseudo-waveform from file size
      const bars = 40;
      const generated: number[] = [];
      const seed = file.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      for (let i = 0; i < bars; i++) {
        const noise = Math.sin(seed * (i + 1) * 0.7) * 0.5 + 0.5;
        const envelope = Math.sin((i / bars) * Math.PI) * 0.6 + 0.4;
        generated.push(noise * envelope);
      }
      setWaveform(generated);

      audio.load();
    } catch {
      setAudioError(true);
      setAudioLoading(false);
    }
  }, [file.id]);

  const togglePlay = useCallback(async () => {
    if (!audioRef.current) {
      await loadAudio();
      return;
    }

    if (isPlaying) {
      audioRef.current.pause();
      cancelAnimationFrame(animFrameRef.current);
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
        const tick = () => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
          animFrameRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setAudioError(true);
      }
    }
  }, [isPlaying, loadAudio]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = ratio * duration;
    setCurrentTime(ratio * duration);
  }, [duration]);

  useEffect(() => {
    // Generate waveform immediately for display even before loading audio
    if (waveform.length === 0) {
      const bars = 40;
      const generated: number[] = [];
      const seed = file.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      for (let i = 0; i < bars; i++) {
        const noise = Math.sin(seed * (i + 1) * 0.7) * 0.5 + 0.5;
        const envelope = Math.sin((i / bars) * Math.PI) * 0.6 + 0.4;
        generated.push(noise * envelope);
      }
      setWaveform(generated);
    }
  }, [file.id, waveform.length]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="rounded border border-[#1c3155] bg-[#16294a] hover:border-[#2a3a5c] transition-all p-2 group">
      <div className="flex items-center gap-2">
        {/* Play button */}
        <button
          onClick={togglePlay}
          disabled={audioLoading}
          className="flex-shrink-0 w-7 h-7 rounded-full bg-[#f7b500] flex items-center justify-center text-black hover:bg-[#f7b500]/90 transition-colors disabled:opacity-50"
        >
          {audioLoading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : isPlaying ? (
            <Pause size={11} fill="currentColor" />
          ) : (
            <Play size={11} fill="currentColor" className="ml-0.5" />
          )}
        </button>

        {/* Waveform + progress */}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div
            className="h-6 flex items-end gap-[1px] cursor-pointer relative"
            onClick={handleSeek}
          >
            {waveform.map((v, i) => {
              const barProgress = i / waveform.length;
              const isPast = barProgress <= progress;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm transition-colors"
                  style={{
                    height: `${Math.max(12, v * 100)}%`,
                    backgroundColor: isPast ? '#f7b500' : 'rgba(148,163,184,0.25)',
                  }}
                />
              );
            })}
          </div>

          {/* Time + name */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] text-slate-300 truncate">{file.name}</span>
            <span className="text-[8px] text-slate-500 flex-shrink-0 font-mono">
              {duration > 0 ? `${formatTime(currentTime)} / ${formatTime(duration)}` : formatSize(file.size)}
            </span>
          </div>
        </div>

        {/* Import */}
        <button
          onClick={() => onImport(file)}
          disabled={downloadingId === file.id || importedIds.has(file.id)}
          className={`flex-shrink-0 p-1 rounded transition-all disabled:opacity-50 ${
            importedIds.has(file.id)
              ? 'text-emerald-400 opacity-100'
              : 'text-slate-500 hover:text-[#f7b500] opacity-0 group-hover:opacity-100'
          }`}
          title={importedIds.has(file.id) ? 'Imported' : 'Import to project'}
        >
          {downloadingId === file.id ? (
            <Loader2 size={11} className="animate-spin" />
          ) : importedIds.has(file.id) ? (
            <Check size={11} />
          ) : (
            <Download size={11} />
          )}
        </button>
      </div>

      {audioError && (
        <div className="mt-1 text-[8px] text-red-400/70">Unable to play audio</div>
      )}
    </div>
  );
}

// --- Main Library Tab ---

export function LibraryTab() {
  const [items, setItems] = useState<DriveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: '1B9QPPiE0zz4hBLsh9FeGvThSQgzoN_15', name: 'Assets' }]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const workspace = usePanelStore((s) => s.editorWorkspace);
  const [gridCols, setGridCols] = useState<2 | 3>(workspace === 'design' ? 3 : 2);

  // Search state
  const [searchResults, setSearchResults] = useState<DriveItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Editor integration
  const addImage = useEditorStore((s) => s.addImage);
  const addAudio = useEditorStore((s) => s.addAudio);
  const addVideo = useEditorStore((s) => s.addVideo);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const currentFolderId = breadcrumbs[breadcrumbs.length - 1].id;

  const loadFolder = useCallback(async (folderId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await listDriveFolder(folderId);
      setItems(result.items);
    } catch (err: any) {
      setError(err.message || 'Failed to load assets');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSearchMode) {
      loadFolder(currentFolderId);
    }
  }, [currentFolderId, loadFolder, isSearchMode]);

  // Debounced global search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setIsSearchMode(false);
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    setIsSearchMode(true);
    setSearchLoading(true);

    // A superseded run must not write state: the debounce only clears a *pending*
    // timer, so a request already in flight for an older query could otherwise
    // resolve last and overwrite the current query's results.
    let cancelled = false;

    searchTimerRef.current = setTimeout(async () => {
      try {
        const result = await searchDriveAssets(searchQuery.trim());
        if (cancelled) return;
        setSearchResults(result.items);
      } catch (err: any) {
        if (cancelled) return;
        setSearchResults([]);
        setError(err.message || 'Search failed');
      } finally {
        // Leave the spinner up if a newer query is already loading.
        if (!cancelled) setSearchLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setIsSearchMode(false);
    setSearchResults([]);
  }, []);

  const navigateToFolder = useCallback((item: DriveItem) => {
    clearSearch();
    setBreadcrumbs((prev) => [...prev, { id: item.id, name: item.name }]);
  }, [clearSearch]);

  const navigateBack = useCallback(() => {
    setBreadcrumbs((prev) => {
      if (prev.length <= 1) return prev;
      return prev.slice(0, -1);
    });
  }, []);

  const navigateToBreadcrumb = useCallback((index: number) => {
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
  }, []);

  const handleImport = useCallback(async (item: DriveItem) => {
    if (!activeProjectId) return;
    setDownloadingId(item.id);
    try {
      const streamUrl = getDriveStreamUrl(item.id);
      const res = await fetch(streamUrl);
      if (!res.ok) throw new Error('Failed to fetch file');
      const blob = await res.blob();
      const file = new File([blob], item.name, { type: item.mimeType });

      if (item.mimeType.startsWith('image/')) {
        await addImage(file, activeProjectId);
      } else if (item.mimeType.startsWith('video/')) {
        await addVideo(file, activeProjectId);
      } else if (item.mimeType.startsWith('audio/')) {
        await addAudio(file, activeProjectId);
      }

      setImportedIds((prev) => new Set(prev).add(item.id));
    } catch (err: any) {
      console.error('Import failed:', err);
    } finally {
      setDownloadingId(null);
    }
  }, [activeProjectId, addImage, addVideo, addAudio]);

  // Determine what to display
  const displayItems = isSearchMode ? searchResults : items;
  const folders = isSearchMode ? [] : displayItems.filter((i) => i.isFolder);
  const visualFiles = displayItems.filter((i) => !i.isFolder && (i.mimeType.startsWith('video/') || i.mimeType.startsWith('image/')));
  const audioFiles = displayItems.filter((i) => !i.isFolder && i.mimeType.startsWith('audio/'));
  const isLoading = isSearchMode ? searchLoading : loading;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Search bar + grid toggle */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[#1a2a42]">
        <div className={`flex-1 flex items-center gap-1.5 bg-[#16294a] border rounded px-2 py-1 transition-colors ${isSearchMode ? 'border-[#f7b500]/40' : 'border-[#1c3155]'}`}>
          <Search size={9} className={`flex-shrink-0 ${isSearchMode ? 'text-[#f7b500]' : 'text-slate-600'}`} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search all assets globally..."
            className="bg-transparent text-[9px] text-slate-300 outline-none w-full placeholder:text-slate-700"
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="flex-shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
            >
              <X size={9} />
            </button>
          )}
        </div>
        {/* Grid column toggle */}
        <div className="flex items-center gap-0.5 bg-[#16294a] border border-[#1c3155] rounded p-0.5">
          <button
            onClick={() => setGridCols(2)}
            className={`p-0.5 rounded transition-colors ${gridCols === 2 ? 'bg-[#f7b500]/15 text-[#f7b500]' : 'text-slate-600 hover:text-slate-400'}`}
            title="2 per row"
          >
            <Grid2x2 size={11} />
          </button>
          <button
            onClick={() => setGridCols(3)}
            className={`p-0.5 rounded transition-colors ${gridCols === 3 ? 'bg-[#f7b500]/15 text-[#f7b500]' : 'text-slate-600 hover:text-slate-400'}`}
            title="3 per row"
          >
            <Grid3x3 size={11} />
          </button>
        </div>
      </div>

      {/* Breadcrumbs / Search indicator */}
      {isSearchMode ? (
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[#1a2a42] min-h-[28px]">
          <Search size={9} className="text-[#f7b500]" />
          <span className="text-[9px] text-slate-400">
            {searchLoading ? 'Searching...' : `${visualFiles.length + audioFiles.length} results for "${searchQuery}"`}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[#1a2a42] overflow-x-auto min-h-[28px]">
          {breadcrumbs.length > 1 && (
            <button
              onClick={navigateBack}
              className="flex-shrink-0 p-0.5 rounded hover:bg-white/5 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <ChevronLeft size={12} />
            </button>
          )}
          {breadcrumbs.map((crumb, i) => (
            <div key={crumb.id} className="flex items-center gap-0.5 flex-shrink-0">
              {i > 0 && <ChevronRight size={8} className="text-slate-700" />}
              <button
                onClick={() => navigateToBreadcrumb(i)}
                className={`text-[9px] px-1 py-0.5 rounded transition-colors ${
                  i === breadcrumbs.length - 1
                    ? 'text-slate-200 font-medium'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                }`}
              >
                {i === 0 ? <Home size={9} className="inline -mt-0.5" /> : null}
                {i === 0 ? '' : crumb.name}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={18} className="animate-spin text-slate-500" />
          </div>
        )}

        {error && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <AlertCircle size={20} className="text-red-400/70 mb-2" />
            <p className="text-[10px] text-red-400/80">{error}</p>
            <button
              onClick={() => { setError(null); loadFolder(currentFolderId); }}
              className="mt-2 text-[9px] text-[#f7b500] hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !error && (
          <div className="p-2 space-y-2">
            {/* Folders (only in browse mode) */}
            {folders.length > 0 && (
              <div className="space-y-0.5">
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => navigateToFolder(folder)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#16294a] transition-colors group text-left"
                  >
                    <Folder size={14} className="text-[#f7b500] flex-shrink-0" />
                    <span className="text-[10px] text-slate-300 group-hover:text-slate-100 truncate flex-1">
                      {folder.name}
                    </span>
                    <ChevronRight size={10} className="text-slate-700 group-hover:text-slate-500 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {/* Separator */}
            {folders.length > 0 && (visualFiles.length > 0 || audioFiles.length > 0) && (
              <div className="border-t border-[#1a2a42]" />
            )}

            {/* Visual files grid (images + videos) */}
            {visualFiles.length > 0 && (
              <div className={`grid gap-1.5 ${gridCols === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {visualFiles.map((file) => (
                  <div
                    key={file.id}
                    className="group rounded overflow-hidden border border-[#1c3155] bg-[#16294a] hover:border-[#2a3044] transition-all"
                  >
                    <div className={`${gridCols === 3 ? 'aspect-square' : 'aspect-video'} bg-[#0a1628] relative overflow-hidden flex items-center justify-center`}>
                      {file.thumbnail ? (
                        <img
                          src={file.thumbnail}
                          alt={file.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        getFileIcon(file)
                      )}

                      {/* Import overlay */}
                      <div className={`absolute inset-0 bg-black/50 transition-opacity flex items-center justify-center ${
                        importedIds.has(file.id) ? 'opacity-100 bg-black/30' : 'opacity-0 group-hover:opacity-100'
                      }`}>
                        <button
                          onClick={() => handleImport(file)}
                          disabled={downloadingId === file.id || importedIds.has(file.id)}
                          className={`p-1.5 rounded-full transition-colors disabled:opacity-70 ${
                            importedIds.has(file.id)
                              ? 'bg-emerald-500 text-white'
                              : 'bg-[#f7b500] text-black hover:bg-[#f7b500]/90'
                          }`}
                        >
                          {downloadingId === file.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : importedIds.has(file.id) ? (
                            <Check size={12} />
                          ) : (
                            <Download size={12} />
                          )}
                        </button>
                      </div>

                      {/* Type badge */}
                      <div className="absolute top-1 right-1 px-1 py-0.5 rounded bg-black/60 text-[7px] text-slate-300 uppercase">
                        {file.mimeType.startsWith('video/') ? 'VID' : 'IMG'}
                      </div>
                    </div>

                    <div className="px-1.5 py-1">
                      <div className="text-[9px] text-slate-300 truncate">{file.name}</div>
                      <div className="flex items-center gap-1">
                        <span className="text-[8px] text-slate-600">{formatSize(file.size)}</span>
                        {isSearchMode && file.path && (
                          <span className="text-[7px] text-slate-600 truncate" title={file.path}>
                            {file.path}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Separator between visual and audio */}
            {visualFiles.length > 0 && audioFiles.length > 0 && (
              <div className="border-t border-[#1a2a42]" />
            )}

            {/* Audio files (WhatsApp-style cards) */}
            {audioFiles.length > 0 && (
              <div className="space-y-1.5">
                {audioFiles.length > 0 && (visualFiles.length > 0 || folders.length > 0) && (
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <Music size={9} className="text-amber-400" />
                    <span className="text-[9px] text-slate-500 font-medium">Audio</span>
                  </div>
                )}
                {audioFiles.map((file) => (
                  <AudioCard
                    key={file.id}
                    file={file}
                    downloadingId={downloadingId}
                    importedIds={importedIds}
                    onImport={handleImport}
                  />
                ))}
              </div>
            )}

            {/* Empty state */}
            {folders.length === 0 && visualFiles.length === 0 && audioFiles.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                {isSearchMode ? (
                  <>
                    <Search size={24} className="text-slate-700 mb-2" />
                    <p className="text-[10px] text-slate-600">
                      No assets found for "{searchQuery}"
                    </p>
                    <p className="text-[9px] text-slate-700 mt-1">
                      Try a different search term
                    </p>
                  </>
                ) : (
                  <>
                    <Folder size={24} className="text-slate-700 mb-2" />
                    <p className="text-[10px] text-slate-600">
                      This folder is empty
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
