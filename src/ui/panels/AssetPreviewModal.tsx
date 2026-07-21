import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useMediaPoolStore } from '../../store/mediaPool';
import { mediaAssetManager } from '../../engine/media/assetManager';

/**
 * Lightbox preview for a media-pool asset (image / video / audio), driven by
 * `mediaPool.previewAssetId`. Renders the asset from its object URL; closes on
 * backdrop click or Escape.
 */
export function AssetPreviewModal() {
  const assetId = useMediaPoolStore((s) => s.previewAssetId);
  const close = useMediaPoolStore((s) => s.setPreviewAsset);

  useEffect(() => {
    if (!assetId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [assetId, close]);

  if (!assetId) return null;

  const asset = mediaAssetManager.getAsset(assetId);
  const url = mediaAssetManager.getObjectUrl(assetId);
  const kind = asset?.metadata ? 'video' : asset?.audioMetadata ? 'audio' : 'image';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={() => close(null)}
    >
      <button
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
        onClick={() => close(null)}
        aria-label="Close preview"
      >
        <X size={20} />
      </button>
      <div className="max-w-[90vw] max-h-[85vh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {!url ? (
          <div className="text-slate-300 text-sm">Preview unavailable.</div>
        ) : kind === 'video' ? (
          <video src={url} controls autoPlay className="max-w-[90vw] max-h-[80vh] rounded-lg shadow-2xl" />
        ) : kind === 'audio' ? (
          <div className="p-8 bg-[#0f1826] rounded-lg shadow-2xl min-w-[320px]">
            <audio src={url} controls autoPlay className="w-full" />
          </div>
        ) : (
          <img src={url} alt={asset?.name ?? 'preview'} className="max-w-[90vw] max-h-[80vh] rounded-lg shadow-2xl object-contain" />
        )}
        {asset?.name && <div className="text-slate-200 text-sm truncate max-w-[80vw]">{asset.name}</div>}
      </div>
    </div>
  );
}
