import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Feather, Loader2, AlertCircle, Check } from 'lucide-react';
import { useRetouchStore } from '../../../store/retouch';
import { useEditorStore } from '../../../store/editor';
import { useProjectStore } from '../../../project-system/hooks/useProjectStore';
import { useMediaPoolStore } from '../../../store/mediaPool';
import { mediaAssetManager } from '../../../engine/media/assetManager';
import { renderRetouch, makePreviewBitmap, DEFAULT_RETOUCH_OPTIONS, type RetouchOptions } from '../../../engine/retouch/retouch';
import { detectFaces, faceDetectionAvailable } from '../../../engine/face-blur/detect';
import type { FaceBox } from '../../../engine/face-blur/faceMask';

// Retouch: denoise + skin/beauty smoothing that keeps real edges + pore texture (frequency separation),
// optionally limited to detected faces. The cleanup math is pure + harnessed (verify:cleanup); the bake
// + FaceDetector are browser-only. Apply bakes a new PNG asset + layer (original untouched). Temporal
// deflicker (video) is B29-video.

export function RetouchModal() {
  const open = useRetouchStore((s) => s.open);
  const assetId = useRetouchStore((s) => s.assetId);
  const close = useRetouchStore((s) => s.close);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const addImageFromAsset = useEditorStore((s) => s.addImageFromAsset);
  const onRefresh = useMediaPoolStore((s) => s.onRefresh);

  const [full, setFull] = useState<ImageBitmap | null>(null);
  const [preview, setPreview] = useState<ImageBitmap | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [denoise, setDenoise] = useState(DEFAULT_RETOUCH_OPTIONS.denoise);
  const [smooth, setSmooth] = useState(DEFAULT_RETOUCH_OPTIONS.smooth);
  const [detail, setDetail] = useState(DEFAULT_RETOUCH_OPTIONS.detail);
  const [radius, setRadius] = useState(DEFAULT_RETOUCH_OPTIONS.radius);
  const [facesOnly, setFacesOnly] = useState(false);
  const [faces, setFaces] = useState<FaceBox[] | null>(null);
  const [faceState, setFaceState] = useState<'idle' | 'detecting' | 'found' | 'none' | 'unavailable'>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const previewUrlRef = useRef<string | null>(null);

  const assetName = (assetId && mediaAssetManager.getAsset(assetId)?.name?.replace(/\.[^.]+$/, '')) || 'image';

  useEffect(() => {
    if (!open || !assetId) return;
    let cancelled = false;
    setStatus('loading'); setFull(null); setPreview(null); setPreviewUrl(null);
    setDenoise(DEFAULT_RETOUCH_OPTIONS.denoise); setSmooth(DEFAULT_RETOUCH_OPTIONS.smooth);
    setDetail(DEFAULT_RETOUCH_OPTIONS.detail); setRadius(DEFAULT_RETOUCH_OPTIONS.radius);
    setFacesOnly(false); setFaces(null); setFaceState('idle');
    (async () => {
      try {
        let bmp = mediaAssetManager.getImageBitmap(assetId);
        if (!bmp) { const url = mediaAssetManager.getObjectUrl(assetId); if (!url) throw new Error('unavailable'); bmp = await createImageBitmap(await (await fetch(url)).blob()); }
        const prev = await makePreviewBitmap(bmp, 900);
        if (cancelled) return;
        setFull(bmp); setPreview(prev); setStatus('ready');
      } catch { if (!cancelled) setStatus('error'); }
    })();
    return () => { cancelled = true; };
  }, [open, assetId]);

  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); }, []);

  // Detect faces once when "faces only" is first enabled.
  useEffect(() => {
    if (!facesOnly || !full || faces !== null || faceState === 'detecting') return;
    if (!faceDetectionAvailable()) { setFaceState('unavailable'); return; }
    let cancelled = false;
    setFaceState('detecting');
    (async () => {
      try {
        const found = await detectFaces(full);
        if (cancelled) return;
        setFaces(found); setFaceState(found.length > 0 ? 'found' : 'none');
      } catch { if (!cancelled) { setFaces([]); setFaceState('none'); } }
    })();
    return () => { cancelled = true; };
  }, [facesOnly, full, faces, faceState]);

  const activeFaces = useMemo(() => (facesOnly && faces && faces.length > 0 ? faces : null), [facesOnly, faces]);
  const opts = useMemo<RetouchOptions>(() => ({ denoise, smooth, detail, radius, faces: activeFaces }), [denoise, smooth, detail, radius, activeFaces]);

  // Live preview (debounced).
  useEffect(() => {
    if (!preview || status !== 'ready') return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const blob = await renderRetouch(preview, opts);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = url; setPreviewUrl(url);
      } catch { /* keep previous */ }
    }, 140);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [preview, status, opts]);

  const handleApply = useCallback(async () => {
    if (!full || !activeProjectId) return;
    setApplying(true);
    try {
      const blob = await renderRetouch(full, opts);
      const file = new File([blob], `${assetName}-retouched.png`, { type: 'image/png' });
      const { assetId: newId } = await mediaAssetManager.importImage(file, activeProjectId);
      const comp = useEditorStore.getState().composition.settings;
      addImageFromAsset(newId, Math.round(comp.width / 2), Math.round(comp.height / 2));
      onRefresh?.(); close();
    } finally { setApplying(false); }
  }, [full, activeProjectId, opts, assetName, addImageFromAsset, onRefresh, close]);

  if (!open || !assetId) return null;
  const busy = status === 'loading' || applying;
  const srcW = full?.width ?? preview?.width ?? 1, srcH = full?.height ?? preview?.height ?? 1;
  const faceNote = faceState === 'detecting' ? 'Detecting faces...'
    : faceState === 'found' ? `${faces?.length} face(s) - smoothing limited to them`
    : faceState === 'none' ? 'No faces detected - smoothing the whole image'
    : faceState === 'unavailable' ? 'Face detection unavailable here - smoothing the whole image'
    : null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => !busy && close()}>
      <div className="w-[min(94vw,880px)] max-h-[90vh] overflow-auto bg-[#0d1526] border border-hairline rounded-xl shadow-overlay p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-accent-hover"><Feather size={16} /><span className="text-sm font-semibold">Retouch</span></div>
          <button className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-40" onClick={() => close()} disabled={busy} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-[1fr_240px] gap-4 max-md:grid-cols-1">
          <div className="relative min-h-[300px] rounded-lg overflow-hidden bg-[#070b13] flex items-center justify-center">
            {status === 'loading' && <Loader2 size={22} className="animate-spin text-slate-500" />}
            {status === 'error' && <div className="flex flex-col items-center gap-2 text-red-400"><AlertCircle size={22} /><span className="text-[11px]">Could not load this image</span></div>}
            {status === 'ready' && (
              <div className="relative" style={{ aspectRatio: `${srcW} / ${srcH}`, width: '100%', maxHeight: '62vh' }}>
                {previewUrl && <img src={previewUrl} alt="preview" className="absolute inset-0 w-full h-full object-contain" draggable={false} />}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 text-slate-200">
            <Group label={`Denoise  ${denoise}`}><input type="range" min={0} max={100} value={denoise} onChange={(e) => setDenoise(+e.target.value)} className="w-full accent-[#f7b500]" /></Group>
            <Group label={`Skin smooth  ${smooth}`}><input type="range" min={0} max={100} value={smooth} onChange={(e) => setSmooth(+e.target.value)} className="w-full accent-[#f7b500]" /></Group>
            <Group label={`Detail keep  ${detail}`}><input type="range" min={0} max={100} value={detail} onChange={(e) => setDetail(+e.target.value)} className="w-full accent-[#f7b500]" /></Group>
            <Group label={`Radius  ${radius}`}><input type="range" min={0} max={100} value={radius} onChange={(e) => setRadius(+e.target.value)} className="w-full accent-[#f7b500]" /></Group>
            <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
              <input type="checkbox" checked={facesOnly} onChange={(e) => setFacesOnly(e.target.checked)} className="accent-[#f7b500]" /> Faces only
              {facesOnly && faceState === 'detecting' && <Loader2 size={12} className="animate-spin text-slate-400" />}
            </label>
            {facesOnly && faceNote && <div className="text-[9px] text-slate-500 -mt-1">{faceNote}</div>}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[11px] bg-accent-wash hover:bg-accent-wash border border-accent-dim text-accent-hover disabled:opacity-40"
            onClick={handleApply} disabled={status !== 'ready' || busy || !activeProjectId}
          >{applying ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Apply</button>
        </div>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-1">{label}</div>{children}</div>;
}
