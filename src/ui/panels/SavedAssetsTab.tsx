import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Search, Upload, Trash2, Image, Music, Loader2, Bookmark, GripVertical } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useEditorStore } from '../../store/editor';
import { useProjectStore } from '../../project-system/hooks/useProjectStore';
import { mediaAssetManager } from '../../engine/media/assetManager';

interface SavedAsset {
  id: string;
  name: string;
  url: string;
  asset_type: 'image' | 'audio';
  width: number;
  height: number;
  duration: number | null;
  mime_type: string;
  created_at: string;
}

type FilterMode = 'all' | 'image' | 'audio';

export function SavedAssetsTab() {
  const addImage = useEditorStore((s) => s.addImage);
  const addAudio = useEditorStore((s) => s.addAudio);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const [assets, setAssets] = useState<SavedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAssets = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase
      .from('saved_assets')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setAssets(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const filteredAssets = useMemo(() => {
    let results = assets;
    if (filter !== 'all') {
      results = results.filter((a) => a.asset_type === filter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      results = results.filter((a) => a.name.toLowerCase().includes(q));
    }
    return results;
  }, [assets, filter, searchQuery]);

  const handleSaveAsset = useCallback(async (files: FileList | null) => {
    if (!files || !supabase) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith('image/');
      const isAudio = file.type.startsWith('audio/');
      if (!isImage && !isAudio) continue;

      const url = URL.createObjectURL(file);
      let width = 0;
      let height = 0;
      let duration: number | null = null;

      if (isImage) {
        const img = new window.Image();
        img.src = url;
        await new Promise<void>((resolve) => {
          img.onload = () => { width = img.naturalWidth; height = img.naturalHeight; resolve(); };
          img.onerror = () => resolve();
        });
      } else if (isAudio) {
        const audio = new Audio(url);
        await new Promise<void>((resolve) => {
          audio.onloadedmetadata = () => { duration = audio.duration; resolve(); };
          audio.onerror = () => resolve();
        });
      }

      const { data } = await supabase
        .from('saved_assets')
        .insert({
          name: file.name.replace(/\.[^.]+$/, ''),
          url,
          asset_type: isImage ? 'image' : 'audio',
          width,
          height,
          duration,
          mime_type: file.type,
        })
        .select()
        .maybeSingle();
      if (data) setAssets((prev) => [data, ...prev]);
    }
    setUploading(false);
  }, []);

  const handleRemove = useCallback(async (id: string) => {
    if (!supabase) return;
    await supabase.from('saved_assets').delete().eq('id', id);
    setAssets((prev) => prev.filter((a) => a.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  const handleUseAsset = useCallback(async (asset: SavedAsset) => {
    if (!activeProjectId) return;
    try {
      const response = await fetch(asset.url);
      const blob = await response.blob();
      const file = new File([blob], asset.name, { type: asset.mime_type });
      if (asset.asset_type === 'image') {
        await addImage(file, activeProjectId);
      } else {
        await addAudio(file, activeProjectId);
      }
    } catch {
      // Fallback: if blob URL is stale, the asset can't be loaded
    }
  }, [activeProjectId, addImage, addAudio]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={18} className="animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Search + filter bar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[#1a2a42]">
        <div className="flex-1 flex items-center gap-1.5 bg-[#16294a] border border-[#1c3155] rounded px-2 py-1">
          <Search size={9} className="text-slate-600 flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search saved..."
            className="bg-transparent text-[9px] text-slate-300 outline-none w-full placeholder:text-slate-700"
          />
        </div>
        <div className="flex items-center bg-[#16294a] border border-[#1c3155] rounded overflow-hidden">
          {(['all', 'image', 'audio'] as FilterMode[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 text-[8px] font-medium transition-colors ${
                filter === f
                  ? 'bg-[#f7b500]/15 text-[#f7b500]'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {f === 'all' ? 'All' : f === 'image' ? 'IMG' : 'AUD'}
            </button>
          ))}
        </div>
      </div>

      {/* Save button */}
      <div className="px-2 py-1.5 border-b border-[#1a2a42]">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full px-2 py-1.5 text-[10px] rounded bg-[#f7b500]/8 border border-[#f7b500]/15 text-[#f7b500] hover:bg-[#f7b500]/10 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Upload size={11} />
          {uploading ? 'Saving...' : 'Save Asset'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/svg+xml,audio/mpeg,audio/wav,audio/aac,audio/mp4,audio/ogg"
          onChange={(e) => handleSaveAsset(e.target.files)}
          className="hidden"
        />
      </div>

      {/* Asset grid */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
        {filteredAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <Bookmark size={22} className="text-slate-700 mb-2" />
            <span className="text-[10px] text-slate-600">
              {searchQuery ? 'No matching saved assets' : 'No saved assets yet'}
            </span>
            <span className="text-[9px] text-slate-700 mt-1">
              Save images and audio to reuse across projects
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {filteredAssets.map((asset) => (
              <SavedAssetCard
                key={asset.id}
                asset={asset}
                isSelected={selectedId === asset.id}
                onClick={() => setSelectedId(asset.id)}
                onUse={() => handleUseAsset(asset)}
                onRemove={() => handleRemove(asset.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SavedAssetCard({
  asset,
  isSelected,
  onClick,
  onUse,
  onRemove,
}: {
  asset: SavedAsset;
  isSelected: boolean;
  onClick: () => void;
  onUse: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      onClick={onClick}
      onDoubleClick={onUse}
      className={`group rounded overflow-hidden border transition-all cursor-pointer ${
        isSelected
          ? 'border-[#f7b500]/50 bg-[#f7b500]/5'
          : 'border-[#1c3155] bg-[#16294a] hover:border-[#2a3044]'
      }`}
    >
      <div className="aspect-video bg-[#0a1628] relative overflow-hidden">
        {asset.asset_type === 'image' ? (
          <img
            src={asset.url}
            alt={asset.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#1a1520]">
            <Music size={20} className="text-amber-500/60" />
          </div>
        )}

        <div className="absolute top-1 left-1">
          <Bookmark size={10} className="text-[#f7b500] fill-[#f7b500]" />
        </div>

        <div className="absolute top-1 right-1 px-1 py-0.5 rounded bg-black/60 text-[7px] text-slate-300 uppercase">
          {asset.asset_type === 'image' ? 'IMG' : 'AUD'}
        </div>

        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onUse(); }}
            className="px-2 py-1 rounded bg-[#f7b500]/90 text-[9px] text-white font-medium hover:bg-[#f7b500] transition-colors"
          >
            Use
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="p-1 rounded bg-white/10 text-white/70 hover:text-red-400 transition-colors"
            title="Remove"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      <div className="px-1.5 py-1">
        <div className="text-[9px] text-slate-300 truncate">{asset.name}</div>
        <div className="text-[8px] text-slate-600">
          {asset.asset_type === 'image'
            ? `${asset.width}x${asset.height}`
            : `${asset.duration?.toFixed(1) ?? '\u2014'}s`
          }
        </div>
      </div>
    </div>
  );
}
