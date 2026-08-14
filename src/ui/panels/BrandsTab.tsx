import { useState, useCallback, useEffect, useRef } from 'react';
import { Plus, Trash2, Upload, Star, Image, Loader2, X } from 'lucide-react';
import { invalidateBrandColorCache } from '../components/BrandColorPicker';
import { brandColorsDb, brandAssetsDb, libraryId } from '../../project-system/storage/libraryDb';

interface BrandColor {
  id: string;
  hex: string;
  sort_order: number;
}

interface BrandAsset {
  id: string;
  name: string;
  url: string;
  is_logo: boolean;
  sort_order: number;
  width: number;
  height: number;
}

export function BrandsTab() {
  const [colors, setColors] = useState<BrandColor[]>([]);
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingColorId, setEditingColorId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Object URLs we created from stored blobs — revoked on unmount / removal.
  const urlsRef = useRef<Set<string>>(new Set());

  const makeUrl = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    urlsRef.current.add(url);
    return url;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [colorRecs, assetRecs] = await Promise.all([brandColorsDb.all(), brandAssetsDb.all()]);
        if (cancelled) return;
        setColors(
          colorRecs.sort((a, b) => a.sortOrder - b.sortOrder).map((r) => ({ id: r.id, hex: r.hex, sort_order: r.sortOrder })),
        );
        setAssets(
          assetRecs.sort((a, b) => a.sortOrder - b.sortOrder).map((r) => ({
            id: r.id, name: r.name, url: makeUrl(r.blob), is_logo: r.isLogo, sort_order: r.sortOrder, width: r.width, height: r.height,
          })),
        );
      } catch {
        /* empty library on first run / IDB unavailable — fall through to empty state */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const urls = urlsRef.current;
    return () => { cancelled = true; urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear(); };
  }, [makeUrl]);

  const addColor = useCallback(async () => {
    const record = { id: libraryId(), hex: '#3B82F6', sortOrder: colors.length };
    await brandColorsDb.put(record);
    setColors((prev) => [...prev, { id: record.id, hex: record.hex, sort_order: record.sortOrder }]);
    invalidateBrandColorCache();
  }, [colors.length]);

  const updateColor = useCallback(async (id: string, hex: string) => {
    const rec = colors.find((c) => c.id === id);
    setColors((prev) => prev.map((c) => (c.id === id ? { ...c, hex } : c)));
    await brandColorsDb.put({ id, hex, sortOrder: rec?.sort_order ?? 0 });
    invalidateBrandColorCache();
  }, [colors]);

  const removeColor = useCallback(async (id: string) => {
    await brandColorsDb.delete(id);
    setColors((prev) => prev.filter((c) => c.id !== id));
    invalidateBrandColorCache();
  }, []);

  const handleImportAssets = useCallback(async (files: FileList | null) => {
    if (!files) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const probe = URL.createObjectURL(file);
      const img = new window.Image();
      img.src = probe;
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
      const width = img.naturalWidth || 200;
      const height = img.naturalHeight || 200;
      URL.revokeObjectURL(probe);
      const record = {
        id: libraryId(),
        name: file.name.replace(/\.[^.]+$/, ''),
        blob: file,
        isLogo: false,
        sortOrder: assets.length,
        width,
        height,
      };
      await brandAssetsDb.put(record);
      setAssets((prev) => [...prev, {
        id: record.id, name: record.name, url: makeUrl(file), is_logo: false, sort_order: record.sortOrder, width, height,
      }]);
    }
    setUploading(false);
  }, [assets.length, makeUrl]);

  const toggleLogo = useCallback(async (id: string) => {
    const asset = assets.find((a) => a.id === id);
    if (!asset) return;
    const newValue = !asset.is_logo;
    setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, is_logo: newValue } : a)));
    const rec = (await brandAssetsDb.all()).find((r) => r.id === id);
    if (rec) await brandAssetsDb.put({ ...rec, isLogo: newValue });
  }, [assets]);

  const removeAsset = useCallback(async (id: string) => {
    await brandAssetsDb.delete(id);
    setAssets((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target && urlsRef.current.has(target.url)) {
        URL.revokeObjectURL(target.url);
        urlsRef.current.delete(target.url);
      }
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const logos = assets.filter((a) => a.is_logo).sort((a, b) => a.sort_order - b.sort_order);
  const otherAssets = assets.filter((a) => !a.is_logo).sort((a, b) => a.sort_order - b.sort_order);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={18} className="animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      {/* Colors Section */}
      <section className="px-3 py-3 border-b border-hairline">
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Brand Colors</h3>
          <button
            onClick={addColor}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
          >
            <Plus size={10} />
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {colors.map((color) => (
            <div key={color.id} className="relative group">
              <button
                onClick={() => setEditingColorId(editingColorId === color.id ? null : color.id)}
                className={`w-9 h-9 rounded-lg border-2 transition shadow-sm hover:scale-110 ${
                  editingColorId === color.id
                    ? 'border-white/60 scale-110'
                    : 'border-hairline hover:border-white/30'
                }`}
                style={{ backgroundColor: color.hex }}
                title={color.hex}
              />
              <button
                onClick={() => removeColor(color.id)}
                className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={8} />
              </button>
              {editingColorId === color.id && (
                <div className="absolute top-11 left-0 z-10 bg-[#0d1520] border border-hairline rounded-lg p-2 shadow-overlay">
                  <input
                    type="color"
                    value={color.hex}
                    onChange={(e) => updateColor(color.id, e.target.value)}
                    className="w-24 h-24 rounded cursor-pointer border-0 bg-transparent p-0"
                  />
                  <div className="mt-1.5 flex items-center gap-1">
                    <input
                      type="text"
                      value={color.hex}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) updateColor(color.id, v);
                      }}
                      className="flex-1 bg-surface-sunken border border-hairline rounded px-1.5 py-0.5 text-[9px] text-slate-200 font-mono outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
          {colors.length === 0 && (
            <p className="text-[9px] text-slate-600">No brand colors yet. Click Add to start.</p>
          )}
        </div>
      </section>

      {/* Logos Section */}
      <section className="px-3 py-3 border-b border-hairline">
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
            <Star size={10} className="inline mr-1 text-accent" />
            Logos
          </h3>
          <span className="text-[8px] text-slate-600">{logos.length} logo{logos.length !== 1 ? 's' : ''}</span>
        </div>
        {logos.length === 0 ? (
          <p className="text-[9px] text-slate-600">
            Mark images as logos using the star icon below.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {logos.map((asset) => (
              <BrandAssetCard
                key={asset.id}
                asset={asset}
                onToggleLogo={toggleLogo}
                onRemove={removeAsset}
                isLogo
              />
            ))}
          </div>
        )}
      </section>

      {/* Assets Section */}
      <section className="px-3 py-3 flex-1">
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Assets</h3>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] text-accent hover:bg-accent-wash transition-colors disabled:opacity-50"
          >
            <Upload size={10} />
            {uploading ? 'Uploading...' : 'Import'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(e) => handleImportAssets(e.target.files)}
            className="hidden"
          />
        </div>
        {otherAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Image size={20} className="text-slate-700 mb-2" />
            <span className="text-[9px] text-slate-600">No brand assets yet</span>
            <span className="text-[8px] text-slate-700 mt-0.5">Import images to build your brand library</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {otherAssets.map((asset) => (
              <BrandAssetCard
                key={asset.id}
                asset={asset}
                onToggleLogo={toggleLogo}
                onRemove={removeAsset}
                isLogo={false}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function BrandAssetCard({
  asset,
  onToggleLogo,
  onRemove,
  isLogo,
}: {
  asset: BrandAsset;
  onToggleLogo: (id: string) => void;
  onRemove: (id: string) => void;
  isLogo: boolean;
}) {
  return (
    <div
      className={`group rounded overflow-hidden border transition ${
        isLogo
          ? 'border-accent-dim bg-accent-wash'
          : 'border-hairline bg-surface-4 hover:border-[#2a3044]'
      }`}
    >
      <div className="aspect-video bg-surface-1 relative overflow-hidden">
        <img
          src={asset.url}
          alt={asset.name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {isLogo && (
          <div className="absolute top-1 left-1">
            <Star size={10} className="text-accent fill-accent" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
          <button
            onClick={() => onToggleLogo(asset.id)}
            className={`p-1 rounded ${isLogo ? 'bg-accent-wash text-accent' : 'bg-white/10 text-white/70 hover:text-accent'}`}
            title={isLogo ? 'Remove from logos' : 'Mark as logo'}
          >
            <Star size={12} className={isLogo ? 'fill-current' : ''} />
          </button>
          <button
            onClick={() => onRemove(asset.id)}
            className="p-1 rounded bg-white/10 text-white/70 hover:text-red-400"
            title="Delete asset"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      <div className="px-1.5 py-1">
        <div className="text-[9px] text-slate-300 truncate">{asset.name}</div>
        <div className="text-[8px] text-slate-600">{asset.width}x{asset.height}</div>
      </div>
    </div>
  );
}
