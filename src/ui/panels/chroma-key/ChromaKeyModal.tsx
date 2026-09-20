import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, ScanLine, Loader2, AlertCircle, Check, Pipette } from 'lucide-react';
import { useChromaKeyStore } from '../../../store/chromaKey';
import { useEditorStore } from '../../../store/editor';
import { useProjectStore } from '../../../project-system/hooks/useProjectStore';
import { useMediaPoolStore } from '../../../store/mediaPool';
import { mediaAssetManager } from '../../../engine/media/assetManager';
import { renderChromaKey, makePreviewBitmap, sampleBitmapColor, DEFAULT_KEY_OPTIONS, type KeyOptions } from '../../../engine/chroma-key/chromaKey';

// Chroma Key: knock a green/blue backing out of an image to transparency (YCbCr chroma key + despill +
// edge choke/feather). The keying math is pure + harnessed (verify:keying); the per-pixel bake +
// eyedropper are browser-only. Apply bakes a new transparent PNG asset + layer (original untouched).
// The live per-layer GPU keyer is B28-gpu.

const CHECKER = 'conic-gradient(#2a2a2a 0% 25%, #1e1e1e 0% 50%, #2a2a2a 0% 75%, #1e1e1e 0% 100%)';

const toHex = (c: [number, number, number]) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const fromHex = (h: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return [0, 177, 64];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export function ChromaKeyModal() {
  const open = useChromaKeyStore((s) => s.open);
  const assetId = useChromaKeyStore((s) => s.assetId);
  const close = useChromaKeyStore((s) => s.close);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const addImageFromAsset = useEditorStore((s) => s.addImageFromAsset);
  const onRefresh = useMediaPoolStore((s) => s.onRefresh);

  const [full, setFull] = useState<ImageBitmap | null>(null);
  const [preview, setPreview] = useState<ImageBitmap | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [keyColor, setKeyColor] = useState<[number, number, number]>(DEFAULT_KEY_OPTIONS.keyColor);
  const [tolerance, setTolerance] = useState(Math.round(DEFAULT_KEY_OPTIONS.tolerance * 100));
  const [softness, setSoftness] = useState(Math.round(DEFAULT_KEY_OPTIONS.softness * 100));
  const [despill, setDespill] = useState(Math.round(DEFAULT_KEY_OPTIONS.despill * 100));
  const [choke, setChoke] = useState(DEFAULT_KEY_OPTIONS.choke);
  const [feather, setFeather] = useState(DEFAULT_KEY_OPTIONS.feather);
  const [eyedropper, setEyedropper] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const previewUrlRef = useRef<string | null>(null);

  const assetName = (assetId && mediaAssetManager.getAsset(assetId)?.name?.replace(/\.[^.]+$/, '')) || 'image';

  useEffect(() => {
    if (!open || !assetId) return;
    let cancelled = false;
    setStatus('loading'); setFull(null); setPreview(null); setPreviewUrl(null); setEyedropper(false);
    setKeyColor(DEFAULT_KEY_OPTIONS.keyColor);
    setTolerance(Math.round(DEFAULT_KEY_OPTIONS.tolerance * 100));
    setSoftness(Math.round(DEFAULT_KEY_OPTIONS.softness * 100));
    setDespill(Math.round(DEFAULT_KEY_OPTIONS.despill * 100));
    setChoke(DEFAULT_KEY_OPTIONS.choke); setFeather(DEFAULT_KEY_OPTIONS.feather);
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

  const opts = useMemo<KeyOptions>(() => ({ keyColor, tolerance: tolerance / 100, softness: softness / 100, despill: despill / 100, choke, feather }), [keyColor, tolerance, softness, despill, choke, feather]);

  // Live preview (debounced) on the downscaled bitmap.
  useEffect(() => {
    if (!preview || status !== 'ready') return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const blob = await renderChromaKey(preview, opts);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = url; setPreviewUrl(url);
      } catch { /* keep previous */ }
    }, 110);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [preview, status, opts]);

  const onPickColor = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!eyedropper || !full) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const u = (e.clientX - rect.left) / rect.width;
    const v = (e.clientY - rect.top) / rect.height;
    const c = sampleBitmapColor(full, u, v);
    if (c) setKeyColor(c);
    setEyedropper(false);
  }, [eyedropper, full]);

  const handleApply = useCallback(async () => {
    if (!full || !activeProjectId) return;
    setApplying(true);
    try {
      const blob = await renderChromaKey(full, opts);
      const file = new File([blob], `${assetName}-keyed.png`, { type: 'image/png' });
      const { assetId: newId } = await mediaAssetManager.importImage(file, activeProjectId);
      const comp = useEditorStore.getState().composition.settings;
      addImageFromAsset(newId, Math.round(comp.width / 2), Math.round(comp.height / 2));
      onRefresh?.(); close();
    } finally { setApplying(false); }
  }, [full, activeProjectId, opts, assetName, addImageFromAsset, onRefresh, close]);

  if (!open || !assetId) return null;
  const busy = status === 'loading' || applying;
  const srcW = full?.width ?? preview?.width ?? 1, srcH = full?.height ?? preview?.height ?? 1;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => !busy && close()}>
      <div className="w-[min(94vw,880px)] max-h-[90vh] overflow-auto bg-[#0d1526] border border-hairline rounded-xl shadow-overlay p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-accent-hover"><ScanLine size={16} /><span className="text-sm font-semibold">Chroma Key</span></div>
          <button className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-40" onClick={() => close()} disabled={busy} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-[1fr_240px] gap-4 max-md:grid-cols-1">
          <div className="relative min-h-[300px] rounded-lg overflow-hidden flex items-center justify-center" style={{ background: CHECKER }}>
            {status === 'loading' && <Loader2 size={22} className="animate-spin text-slate-500" />}
            {status === 'error' && <div className="flex flex-col items-center gap-2 text-red-400"><AlertCircle size={22} /><span className="text-[11px]">Could not load this image</span></div>}
            {status === 'ready' && (
              <div className="relative" style={{ aspectRatio: `${srcW} / ${srcH}`, width: '100%', maxHeight: '62vh', cursor: eyedropper ? 'crosshair' : 'default' }} onClick={onPickColor}>
                {previewUrl && <img src={previewUrl} alt="preview" className="absolute inset-0 w-full h-full object-contain" draggable={false} />}
                {eyedropper && <div className="absolute inset-0 flex items-start justify-center pt-2 pointer-events-none"><span className="text-[10px] bg-black/70 text-slate-200 rounded px-2 py-0.5">Click the backing to sample the key colour</span></div>}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 text-slate-200">
            <Group label="Key colour">
              <div className="flex items-center gap-2">
                <input type="color" value={toHex(keyColor)} onChange={(e) => setKeyColor(fromHex(e.target.value))} className="h-7 w-9 rounded bg-transparent" aria-label="Key colour" />
                <button
                  onClick={() => setEyedropper((v) => !v)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] border transition-colors ${eyedropper ? 'bg-accent text-on-accent border-accent' : 'bg-surface-3 border-hairline text-slate-300 hover:bg-surface-4'}`}
                  title="Sample the key colour from the image"
                ><Pipette size={13} /> Pick</button>
              </div>
            </Group>
            <Group label={`Tolerance  ${tolerance}`}><input type="range" min={0} max={100} value={tolerance} onChange={(e) => setTolerance(+e.target.value)} className="w-full accent-[#f7b500]" /></Group>
            <Group label={`Softness  ${softness}`}><input type="range" min={0} max={100} value={softness} onChange={(e) => setSoftness(+e.target.value)} className="w-full accent-[#f7b500]" /></Group>
            <Group label={`Despill  ${despill}`}><input type="range" min={0} max={100} value={despill} onChange={(e) => setDespill(+e.target.value)} className="w-full accent-[#f7b500]" /></Group>
            <Group label={`Choke  ${choke}`}><input type="range" min={0} max={100} value={choke} onChange={(e) => setChoke(+e.target.value)} className="w-full accent-[#f7b500]" /></Group>
            <Group label={`Feather  ${feather}`}><input type="range" min={0} max={100} value={feather} onChange={(e) => setFeather(+e.target.value)} className="w-full accent-[#f7b500]" /></Group>
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
