import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useEditorStore } from '../../store/editor';
import { useProjectStore } from '../../project-system/hooks/useProjectStore';
import { mediaAssetManager } from '../../engine/media/assetManager';
import { Search, Upload, Image, Film, GripVertical, Music, Sparkles, BookOpen, Loader2, Palette, Bookmark } from 'lucide-react';
import { useIconSearch } from '../../components/icons/useIconSearch';
import { VirtualGrid } from '../../components/icons/VirtualGrid';
import { SvgIcon } from '../../components/icons/SvgIcon';
import { rasterizeIconToFile } from '../../components/icons/rasterizeIcon';
import type { IconData } from '../../components/icons/types';
import { usePanelStore } from '../../store/panels';
import { useMediaPoolStore, type MediaSortMode } from '../../store/mediaPool';
import { AssetPreviewModal } from './AssetPreviewModal';
import { AiImageModal } from './ai-image/AiImageModal';
import { useContextMenu } from '../context-menu';
import { buildMediaPoolEmptyMenu, buildMediaAssetMenu } from '../context-menu/menuDefinitions';
import { BrandsTab } from './BrandsTab';
import { SavedAssetsTab } from './SavedAssetsTab';
import { LibraryTab } from '../../library/LibraryTab';
import { FolderBrowser } from '../../library/FolderBrowser';

type PoolTab = 'images' | 'videos' | 'audio' | 'icons' | 'brands' | 'saved' | 'library';

interface PoolAsset {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio';
  width: number;
  height: number;
  duration?: number;
  objectUrl: string;
  thumbnailUrl: string;
  importedAt: number;
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm'];
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.aac', '.m4a', '.ogg'];

type AssetCategory = 'images' | 'videos' | 'audio';

function getAcceptString(category: AssetCategory): string {
  if (category === 'images') return 'image/png,image/jpeg,image/webp,image/svg+xml';
  if (category === 'audio') return 'audio/mpeg,audio/wav,audio/aac,audio/mp4,audio/ogg';
  return 'video/mp4,video/quicktime,video/webm';
}

const TABS: { id: PoolTab; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
  { id: 'images', label: 'Images', icon: <Image size={13} /> },
  { id: 'videos', label: 'Videos', icon: <Film size={13} /> },
  { id: 'audio', label: 'Audio', icon: <Music size={13} /> },
  { id: 'icons', label: 'Icons', icon: <Sparkles size={13} /> },
  { id: 'brands', label: 'Brands', icon: <Palette size={13} /> },
  { id: 'saved', label: 'Saved', icon: <Bookmark size={13} /> },
  { id: 'library', label: 'Library', icon: <BookOpen size={13} /> },
];

export function MediaPool() {
  const addImage = useEditorStore((s) => s.addImage);
  const addAudio = useEditorStore((s) => s.addAudio);
  const addVideo = useEditorStore((s) => s.addVideo);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const { show: showContextMenu } = useContextMenu();

  const [tab, setTab] = useState<PoolTab>('images');
  const [searchQuery, setSearchQuery] = useState('');
  const sortMode = useMediaPoolStore((s) => s.sortMode);
  const setSortMode = useMediaPoolStore((s) => s.setSortMode);
  const [assets, setAssets] = useState<PoolAsset[]>([]);
  const [importing, setImporting] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [dragAssetId, setDragAssetId] = useState<string | null>(null);
  const [fileDragOver, setFileDragOver] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderAssetIds, setFolderAssetIds] = useState<string[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshAssets = useCallback(() => {
    const all = mediaAssetManager.getAllAssets();
    const poolAssets: PoolAsset[] = all.map((a) => {
      const isVideo = a.mimeType.startsWith('video/');
      const isAudio = a.mimeType.startsWith('audio/');
      const width = isVideo ? (a.metadata?.width ?? 0) : (a.imageMetadata?.width ?? 0);
      const height = isVideo ? (a.metadata?.height ?? 0) : (a.imageMetadata?.height ?? 0);
      const duration = isAudio ? (a.audioMetadata?.duration ?? undefined) : isVideo ? (a.metadata?.duration ?? undefined) : undefined;
      return {
        id: a.id,
        name: a.name,
        type: isAudio ? 'audio' : isVideo ? 'video' : 'image',
        width,
        height,
        duration,
        objectUrl: a.objectUrl,
        thumbnailUrl: a.objectUrl,
        importedAt: a.createdAt,
      };
    });
    setAssets(poolAssets);
  }, []);

  const assetCategory: AssetCategory = tab === 'videos' ? 'videos' : tab === 'audio' ? 'audio' : 'images';

  const filteredAssets = useMemo(() => {
    let filtered = assets.filter((a) => {
      if (assetCategory === 'images' && a.type !== 'image') return false;
      if (assetCategory === 'videos' && a.type !== 'video') return false;
      if (assetCategory === 'audio' && a.type !== 'audio') return false;
      if (folderAssetIds !== null) {
        if (!folderAssetIds.includes(a.id)) return false;
      }
      if (searchQuery) {
        return a.name.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    });

    filtered.sort((a, b) => {
      switch (sortMode) {
        case 'name': return a.name.localeCompare(b.name);
        case 'resolution': return (b.width * b.height) - (a.width * a.height);
        case 'duration': return (b.duration ?? 0) - (a.duration ?? 0);
        case 'type': return a.type.localeCompare(b.type) || a.name.localeCompare(b.name);
        case 'date':
        default: return b.importedAt - a.importedAt;
      }
    });

    return filtered;
  }, [assets, assetCategory, searchQuery, sortMode, folderAssetIds]);

  const handleImport = useCallback(async (files: FileList | null) => {
    if (!files || !activeProjectId) return;
    setImporting(true);

    for (const file of Array.from(files)) {
      try {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        if (IMAGE_EXTENSIONS.includes(ext) || file.type.startsWith('image/')) {
          await addImage(file, activeProjectId);
        } else if (VIDEO_EXTENSIONS.includes(ext) || file.type.startsWith('video/')) {
          await addVideo(file, activeProjectId);
        } else if (AUDIO_EXTENSIONS.includes(ext) || file.type.startsWith('audio/')) {
          await addAudio(file, activeProjectId);
        }
      } catch (err) {
        console.error('Import failed:', file.name, err);
      }
    }

    refreshAssets();
    setImporting(false);
  }, [activeProjectId, addImage, addVideo, addAudio, refreshAssets]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, asset: PoolAsset) => {
    setDragAssetId(asset.id);
    e.dataTransfer.setData('application/x-mediapool-asset', JSON.stringify({
      id: asset.id,
      type: asset.type,
      name: asset.name,
      width: asset.width,
      height: asset.height,
    }));
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragAssetId(null);
  }, []);

  const handleAssetContextMenu = useCallback((e: React.MouseEvent, asset: PoolAsset) => {
    e.preventDefault();
    e.stopPropagation(); // don't also pop the pool's empty-space menu
    setSelectedAssetId(asset.id);
    showContextMenu(e.clientX, e.clientY, buildMediaAssetMenu(asset.type, asset.id));
  }, [showContextMenu]);

  const handleFileDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setFileDragOver(true);
    }
  }, []);

  const handleFileDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setFileDragOver(false);
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setFileDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length) handleImport(files);
  }, [handleImport]);

  useEffect(() => {
    refreshAssets();
    const unsubscribe = mediaAssetManager.subscribe(refreshAssets);
    return unsubscribe;
  }, [refreshAssets, activeProjectId]);

  // Expose import/refresh to the (pure) media-pool context menus.
  useEffect(() => {
    useMediaPoolStore.getState().setHandlers({
      onImport: (opts) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        if (opts?.accept) input.accept = opts.accept;
        if (opts?.directory) input.setAttribute('webkitdirectory', '');
        input.onchange = () => handleImport(input.files);
        input.click();
      },
      onRefresh: refreshAssets,
    });
    return () => useMediaPoolStore.getState().setHandlers({ onImport: null, onRefresh: null });
  }, [handleImport, refreshAssets]);

  const handleFolderChange = useCallback((folderId: string | null) => {
    setCurrentFolderId(folderId);
  }, []);

  const handleFilterByFolder = useCallback((assetIds: string[] | null) => {
    setFolderAssetIds(assetIds);
  }, []);

  const isMediaTab = tab === 'images' || tab === 'videos' || tab === 'audio';

  return (
    <div
      className="flex flex-row h-full bg-[#081220] relative"
      onContextMenu={(e) => { e.preventDefault(); showContextMenu(e.clientX, e.clientY, buildMediaPoolEmptyMenu()); }}
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
    >
      <AssetPreviewModal />
      <AiImageModal />
      {fileDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none bg-[#0a1628]/80 backdrop-blur-sm border-2 border-dashed border-emerald-400 rounded-lg m-2">
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-emerald-400/10 border border-emerald-400/30 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <span className="text-base font-semibold text-emerald-400">Import Media</span>
            <span className="text-xs text-slate-400">Drop files to add to media pool</span>
          </div>
        </div>
      )}
      {/* Left nav */}
      <nav className="flex-shrink-0 w-[106px] flex flex-col py-1 border-r border-[#1a2a42] bg-[#0b0e15] overflow-y-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => !t.disabled && setTab(t.id)}
            disabled={t.disabled}
            aria-pressed={tab === t.id}
            className={`relative flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-left transition-colors ${
              t.disabled
                ? 'text-slate-700 cursor-not-allowed'
                : tab === t.id
                  ? 'text-[#f7b500] bg-[#f7b500]/10'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
            }`}
          >
            <span
              className={`absolute right-0 top-0 bottom-0 w-[2px] transition-colors ${
                tab === t.id ? 'bg-[#f7b500]' : 'bg-transparent'
              }`}
            />
            <span className="flex-shrink-0">{t.icon}</span>
            <span className="truncate">{t.label}</span>
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
        {isMediaTab && (
          <MediaTabContent
            category={assetCategory}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            sortMode={sortMode}
            setSortMode={setSortMode}
            filteredAssets={filteredAssets}
            selectedAssetId={selectedAssetId}
            setSelectedAssetId={setSelectedAssetId}
            dragAssetId={dragAssetId}
            handleDragStart={handleDragStart}
            handleDragEnd={handleDragEnd}
            onAssetContextMenu={handleAssetContextMenu}
            handleImportClick={handleImportClick}
            importing={importing}
            fileInputRef={fileInputRef}
            handleImport={handleImport}
            currentFolderId={currentFolderId}
            onFolderChange={handleFolderChange}
            onFilterByFolder={handleFilterByFolder}
          />
        )}

        {tab === 'icons' && (
          <IconsTabContent activeProjectId={activeProjectId} addImage={addImage} />
        )}

        {tab === 'brands' && (
          <BrandsTab />
        )}

        {tab === 'saved' && (
          <SavedAssetsTab />
        )}

        {tab === 'library' && (
          <LibraryTab />
        )}
      </div>
    </div>
  );
}

// ---------- Media (Images/Videos/Audio) tab ----------

interface MediaTabContentProps {
  category: AssetCategory;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  sortMode: MediaSortMode;
  setSortMode: (m: MediaSortMode) => void;
  filteredAssets: PoolAsset[];
  selectedAssetId: string | null;
  setSelectedAssetId: (id: string | null) => void;
  dragAssetId: string | null;
  handleDragStart: (e: React.DragEvent, asset: PoolAsset) => void;
  handleDragEnd: () => void;
  onAssetContextMenu: (e: React.MouseEvent, asset: PoolAsset) => void;
  handleImportClick: () => void;
  importing: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleImport: (files: FileList | null) => void;
  currentFolderId: string | null;
  onFolderChange: (folderId: string | null) => void;
  onFilterByFolder: (assetIds: string[] | null) => void;
}

function MediaTabContent({
  category,
  searchQuery,
  setSearchQuery,
  sortMode,
  setSortMode,
  filteredAssets,
  selectedAssetId,
  setSelectedAssetId,
  dragAssetId,
  handleDragStart,
  handleDragEnd,
  onAssetContextMenu,
  handleImportClick,
  importing,
  fileInputRef,
  handleImport,
  currentFolderId,
  onFolderChange,
  onFilterByFolder,
}: MediaTabContentProps) {
  const workspace = usePanelStore((s) => s.editorWorkspace);
  const thumbSize = useMediaPoolStore((s) => s.thumbSize);
  const viewMode = useMediaPoolStore((s) => s.viewMode);
  const baseCols = workspace === 'design' ? 3 : 2;
  const cols = thumbSize === 'large' ? Math.max(1, baseCols - 1) : baseCols;
  const gridColsClass = cols === 1 ? 'grid-cols-1' : cols === 2 ? 'grid-cols-2' : 'grid-cols-3';
  return (
    <>
      {/* Search + sort */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[#1a2a42]">
        <div className="flex-1 flex items-center gap-1.5 bg-[#16294a] border border-[#1c3155] rounded px-2 py-1">
          <Search size={9} className="text-slate-600 flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="bg-transparent text-[9px] text-slate-300 outline-none w-full placeholder:text-slate-700"
          />
        </div>
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as MediaSortMode)}
          className="bg-[#16294a] border border-[#1c3155] rounded px-1 py-0.5 text-[8px] text-slate-500 outline-none"
        >
          <option value="date">Recent</option>
          <option value="name">Name</option>
          <option value="resolution">Size</option>
          <option value="duration">Duration</option>
          <option value="type">Type</option>
        </select>
      </div>

      {/* Folder browser */}
      <FolderBrowser
        folderType={category}
        currentFolderId={currentFolderId}
        onFolderChange={onFolderChange}
        onFilterByFolder={onFilterByFolder}
      />

      {/* Import Button */}
      <div className="px-2 py-1.5 border-b border-[#1a2a42]">
        <button
          onClick={handleImportClick}
          disabled={importing}
          className="w-full px-2 py-1.5 text-[10px] rounded bg-[#f7b500]/8 border border-[#f7b500]/15 text-[#f7b500] hover:bg-[#f7b500]/10 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Upload size={11} />
          {importing ? 'Importing...' : 'Import Media'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={getAcceptString(category)}
          onChange={(e) => handleImport(e.target.files)}
          className="hidden"
        />
      </div>

      {/* Asset Grid */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
        {filteredAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <div className="text-slate-700 mb-2">
              {category === 'images' ? <Image size={24} /> : category === 'audio' ? <Music size={24} /> : <Film size={24} />}
            </div>
            <span className="text-[10px] text-slate-600">
              {searchQuery ? 'No matching assets' : currentFolderId ? 'This folder is empty' : `No ${category} imported`}
            </span>
            <span className="text-[9px] text-slate-700 mt-1">
              {currentFolderId ? 'Drag assets here to organize' : 'Click Import Media to add files'}
            </span>
          </div>
        ) : viewMode === 'list' ? (
          <div className="flex flex-col gap-0.5">
            {filteredAssets.map((asset) => (
              <AssetListRow
                key={asset.id}
                asset={asset}
                isSelected={selectedAssetId === asset.id}
                isDragging={dragAssetId === asset.id}
                onClick={() => setSelectedAssetId(asset.id)}
                onDragStart={(e) => handleDragStart(e, asset)}
                onDragEnd={handleDragEnd}
                onContextMenu={(e) => onAssetContextMenu(e, asset)}
              />
            ))}
          </div>
        ) : (
          <div className={`grid ${gridColsClass} gap-1.5`}>
            {filteredAssets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                isSelected={selectedAssetId === asset.id}
                isDragging={dragAssetId === asset.id}
                onClick={() => setSelectedAssetId(asset.id)}
                onDragStart={(e) => handleDragStart(e, asset)}
                onDragEnd={handleDragEnd}
                onContextMenu={(e) => onAssetContextMenu(e, asset)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ---------- Icons tab (inline browser) ----------

const ICON_CELL_SIZE = 42;
const ICON_CELL_GAP = 3;
const COLOR_PRESETS = ['#FFFFFF', '#0EA5E9', '#22C55E', '#F59E0B', '#EF4444', '#0F172A'];

type IconSubTab = 'static' | 'animated';

function IconsTabContent({
  activeProjectId,
  addImage,
}: {
  activeProjectId: string | null;
  addImage: (file: File, projectId: string) => Promise<void>;
}) {
  const [subTab, setSubTab] = useState<IconSubTab>('static');

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Subtab switcher */}
      <div className="flex items-center gap-0.5 px-2 pt-1.5 pb-1 border-b border-[#1a2a42]">
        <button
          onClick={() => setSubTab('static')}
          className={`flex-1 py-1 rounded text-[9px] font-medium transition-colors ${
            subTab === 'static'
              ? 'bg-[#f7b500]/10 text-[#f7b500] border border-[#f7b500]/20'
              : 'text-slate-500 hover:text-slate-300 border border-transparent'
          }`}
        >
          Static
        </button>
        <button
          onClick={() => setSubTab('animated')}
          className={`flex-1 py-1 rounded text-[9px] font-medium transition-colors ${
            subTab === 'animated'
              ? 'bg-[#f7b500]/10 text-[#f7b500] border border-[#f7b500]/20'
              : 'text-slate-500 hover:text-slate-300 border border-transparent'
          }`}
        >
          Animated
        </button>
      </div>

      {subTab === 'static' && (
        <StaticIconsContent activeProjectId={activeProjectId} addImage={addImage} />
      )}
      {subTab === 'animated' && (
        <AnimatedIconsTabLazy />
      )}
    </div>
  );
}

function AnimatedIconsTabLazy() {
  const [Comp, setComp] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    import('../../components/icons/AnimatedIconsTab').then((m) => {
      setComp(() => m.AnimatedIconsTab);
    });
  }, []);

  if (!Comp) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={16} className="animate-spin text-slate-500" />
      </div>
    );
  }

  return <Comp />;
}

function StaticIconsContent({
  activeProjectId,
  addImage,
}: {
  activeProjectId: string | null;
  addImage: (file: File, projectId: string) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [selectedIcon, setSelectedIcon] = useState<IconData | null>(null);
  const [selectedColor, setSelectedColor] = useState(COLOR_PRESETS[0]);
  const [inserting, setInserting] = useState(false);
  const { results, loading, error } = useIconSearch(query);

  const handleSelect = useCallback((icon: IconData) => {
    setSelectedIcon(icon);
  }, []);

  const handleInsert = async () => {
    if (!selectedIcon || !activeProjectId) return;
    setInserting(true);
    try {
      const file = await rasterizeIconToFile(selectedIcon, { color: selectedColor, size: 256 });
      await addImage(file, activeProjectId);
    } catch (err) {
      console.error('Failed to insert icon', err);
    }
    setInserting(false);
  };

  const renderItem = useCallback(
    (icon: IconData) => (
      <button
        onClick={() => handleSelect(icon)}
        className={`w-full h-full rounded border flex items-center justify-center transition-colors ${
          selectedIcon?.id === icon.id
            ? 'bg-[#f7b500]/10 border-[#f7b500]/50'
            : 'bg-transparent border-transparent hover:bg-[#122240] hover:border-[#1a2a42]'
        }`}
        title={icon.name}
      >
        <SvgIcon
          icon={icon}
          size={24}
          color={selectedIcon?.id === icon.id ? selectedColor : 'currentColor'}
        />
      </button>
    ),
    [selectedIcon?.id, selectedColor, handleSelect]
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Search */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[#1a2a42]">
        <div className="flex-1 flex items-center gap-1.5 bg-[#16294a] border border-[#1c3155] rounded px-2 py-1">
          <Search size={9} className="text-slate-600 flex-shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search icons..."
            className="bg-transparent text-[9px] text-slate-300 outline-none w-full placeholder:text-slate-700"
          />
        </div>
      </div>

      {/* Icon grid */}
      <div className="flex-1 relative min-h-0">
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-red-400 px-3 text-center">
            Failed to load icons
          </div>
        )}
        {!error && loading && results.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500">
            <Loader2 size={16} className="animate-spin" />
          </div>
        )}
        {!loading && !error && results.length === 0 && query && (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-500">
            No icons match "{query}"
          </div>
        )}
        {results.length > 0 && (
          <VirtualGrid
            items={results}
            itemSize={ICON_CELL_SIZE}
            gap={ICON_CELL_GAP}
            renderItem={renderItem}
            className="absolute inset-0 p-2"
          />
        )}
      </div>

      {/* Selection footer */}
      {selectedIcon && (
        <div className="flex-shrink-0 border-t border-[#1a2a42] bg-[#0a1628] px-2 py-2 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded border border-[#1a2a42] bg-[#06101a] flex items-center justify-center flex-shrink-0">
              <SvgIcon icon={selectedIcon} size={24} color={selectedColor} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-slate-200 truncate">{selectedIcon.name}</div>
              <div className="text-[8px] text-slate-600 font-mono truncate">{selectedIcon.id}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedColor(c)}
                className={`w-5 h-5 rounded-full border-2 transition-all ${
                  selectedColor === c ? 'border-[#f7b500] scale-110' : 'border-[#1a2a42] hover:border-slate-500'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
            <input
              type="color"
              value={selectedColor}
              onChange={(e) => setSelectedColor(e.target.value)}
              className="w-5 h-5 ml-1 bg-transparent border-0 cursor-pointer p-0"
            />
          </div>
          <button
            onClick={handleInsert}
            disabled={inserting || !activeProjectId}
            className="w-full py-1.5 rounded bg-[#f7b500] hover:bg-[#f7b500] disabled:opacity-50 text-white text-[10px] font-medium transition-colors"
          >
            {inserting ? 'Inserting...' : 'Insert Icon'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- Asset card ----------

interface AssetCardProps {
  asset: PoolAsset;
  isSelected: boolean;
  isDragging: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function AssetCard({ asset, isSelected, isDragging, onClick, onDragStart, onDragEnd, onContextMenu }: AssetCardProps) {
  return (
    <div
      draggable
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onContextMenu={onContextMenu}
      className={`group rounded overflow-hidden border transition-all cursor-grab active:cursor-grabbing ${
        isSelected
          ? 'border-[#f7b500]/50 bg-[#f7b500]/5'
          : 'border-[#1c3155] bg-[#16294a] hover:border-[#2a3044]'
      } ${isDragging ? 'opacity-50 scale-95' : ''}`}
    >
      <div className="aspect-video bg-[#0a1628] relative overflow-hidden">
        {asset.type === 'image' ? (
          <img
            src={asset.thumbnailUrl}
            alt={asset.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : asset.type === 'video' ? (
          <video
            src={asset.objectUrl}
            className="w-full h-full object-cover"
            muted
            preload="metadata"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#1a1520]">
            <Music size={20} className="text-amber-500/60" />
          </div>
        )}

        <div className="absolute top-1 right-1 px-1 py-0.5 rounded bg-black/60 text-[7px] text-slate-300 uppercase">
          {asset.type === 'video' ? 'VID' : asset.type === 'audio' ? 'AUD' : 'IMG'}
        </div>

        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical size={14} className="text-white/70" />
        </div>
      </div>

      <div className="px-1.5 py-1">
        <div className="text-[9px] text-slate-300 truncate">{asset.name}</div>
        <div className="text-[8px] text-slate-600">
          {asset.type === 'audio' ? `${asset.duration?.toFixed(1) ?? '\u2014'}s` : `${asset.width}x${asset.height}`}
        </div>
      </div>
    </div>
  );
}

// Compact single-line variant used when the pool view mode is "list".
function AssetListRow({ asset, isSelected, isDragging, onClick, onDragStart, onDragEnd, onContextMenu }: AssetCardProps) {
  return (
    <div
      draggable
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onContextMenu={onContextMenu}
      className={`group flex items-center gap-2 px-1.5 py-1 rounded border transition-all cursor-grab active:cursor-grabbing ${
        isSelected ? 'border-[#f7b500]/50 bg-[#f7b500]/5' : 'border-transparent hover:bg-[#16294a]'
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="w-9 h-9 flex-shrink-0 rounded overflow-hidden bg-[#0a1628] flex items-center justify-center">
        {asset.type === 'image' ? (
          <img src={asset.thumbnailUrl} alt={asset.name} className="w-full h-full object-cover" loading="lazy" />
        ) : asset.type === 'video' ? (
          <video src={asset.objectUrl} className="w-full h-full object-cover" muted preload="metadata" />
        ) : (
          <Music size={14} className="text-amber-500/60" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] text-slate-200 truncate">{asset.name}</div>
        <div className="text-[8px] text-slate-600">
          {asset.type === 'audio' ? `${asset.duration?.toFixed(1) ?? '\u2014'}s` : `${asset.width}x${asset.height}`}
        </div>
      </div>
      <div className="text-[7px] text-slate-500 uppercase flex-shrink-0">
        {asset.type === 'video' ? 'VID' : asset.type === 'audio' ? 'AUD' : 'IMG'}
      </div>
    </div>
  );
}
