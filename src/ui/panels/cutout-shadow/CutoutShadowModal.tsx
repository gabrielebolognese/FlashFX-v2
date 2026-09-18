import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Layers2, Loader2, AlertCircle, Check } from 'lucide-react';
import { useCutoutShadowStore } from '../../../store/cutoutShadow';
import { useEditorStore } from '../../../store/editor';
import { useProjectStore } from '../../../project-system/hooks/useProjectStore';
import { useMediaPoolStore } from '../../../store/mediaPool';
import { mediaAssetManager } from '../../../engine/media/assetManager';
import { extractCutout, downscaleCutout, renderCutoutShadow, type Cutout, type ShadowType } from '../../../engine/cutout-shadow/cutoutShadow';

// Cutout + Shadow: reuse the Background Removal cutout + alpha mask, then cast a ground or drop shadow
// derived from that mask (no second segmentation). Shadow geometry is pure + harnessed; the cutout +
// composite are browser-only. Apply bakes a new PNG asset + layer (original untouched).

const CHECKER = 'conic-gradient(#2a2a2a 0% 25%, #1e1e1e 0% 50%, #2a2a2a 0% 75%, #1e1e1e 0% 100%)';
const TYPES: { id: ShadowType; label: string }[] = [{ id: 'ground', label: 'Ground' }, { id: 'drop', label: 'Drop' }];

export function CutoutShadowModal() {
  const open = useCutoutShadowStore((s) => s.open);
  const assetId = useCutoutShadowStore((s) => s.assetId);
  const close = useCutoutShadowStore((s) => s.close);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const addImageFromAsset = useEditorStore((s) => s.addImageFromAsset);
  const onRefresh = useMediaPoolStore((s) => s.onRefresh);

  const [full, setFull] = useState<Cutout | null>(null);
  const [preview, setPreview] = useState<Cutout | null>(null);
  const [status, setStatus] = useState<'idle' | 'downloading' | 'processing' | 'ready' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [type, setType] = useState<ShadowType>('ground');
  const [direction, setDirection] = useState(50);
  const [distance, setDistance] = useState(45);
  const [softness, setSoftness] = useState(40);
  const [opacity, setOpacity] = useState(55);
  const [color, setColor] = useState('#000000');
  const [background, setBackground] = useState('transparent');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const sourceUrl = assetId ? mediaAssetManager.getObjectUrl(assetId) : null;
  const assetName = (assetId && mediaAssetManager.getAsset(assetId)?.name?.replace(/\.[^.]+$/, '')) || 'image';

  // Extract the cutout once on open (runs Background Removal; first run downloads the model).
  useEffect(() => {
    if (!open || !assetId || !sourceUrl) return;
    let cancelled = false;
    setStatus('downloading'); setProgress(0); setFull(null); setPreview(null); setPreviewUrl(null);
    (async () => {
      try {
        const c = await extractCutout(sourceUrl, (key, cur, total) => {
          if (cancelled) return;
          if (key.includes('fetch') || key.includes('download')) { setStatus('downloading'); setProgress(total > 0 ? Math.round((cur / total) * 100) : 0); }
          else setStatus('processing');
        });
        const prev = await downscaleCutout(c, 900);
        if (cancelled) return;
        setFull(c); setPreview(prev); setStatus('ready');
      } catch { if (!cancelled) setStatus('error'); }
    })();
    return () => { cancelled = true; };
  }, [open, assetId, sourceUrl]);

  const opts = useMemo(() => ({ type, direction, distance, softness, opacity: opacity / 100, color, background }), [type, direction, distance, softness, opacity, color, background]);

  // Live preview (debounced) on the downscaled cutout.
  useEffect(() => {
    if (!preview || status !== 'ready') return;
    let cancelled = false; let url: string | null = null;
    const t = window.setTimeout(async () => {
      try {
        const blob = await renderCutoutShadow(preview, opts);
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
      } catch { /* keep previous */ }
    }, 100);
    return () => { cancelled = true; window.clearTimeout(t); if (url) URL.revokeObjectURL(url); };
  }, [preview, status, opts]);

  const handleApply = useCallback(async () => {
    if (!full || !activeProjectId) return;
    setApplying(true);
    try {
      const blob = await renderCutoutShadow(full, opts);
      const file = new File([blob], `${assetName}-shadow.png`, { type: 'image/png' });
      const { assetId: newId } = await mediaAssetManager.importImage(file, activeProjectId);
      const comp = useEditorStore.getState().composition.settings;
      addImageFromAsset(newId, Math.round(comp.width / 2), Math.round(comp.height / 2));
      onRefresh?.(); close();
    } finally { setApplying(false); }
  }, [full, activeProjectId, opts, assetName, addImageFromAsset, onRefresh, close]);

  if (!open || !assetId) return null;
  const busy = status === 'downloading' || status === 'processing' || applying;
  const srcW = full?.w ?? preview?.w ?? 1; const srcH = full?.h ?? preview?.h ?? 1;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => !busy && close()}>
      <div className="w-[min(94vw,880px)] max-h-[90vh] overflow-auto bg-[#0d1526] border border-hairline rounded-xl shadow-overlay p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-accent-hover"><Layers2 size={16} /><span className="text-sm font-semibold">Cutout + Shadow</span></div>
          <button className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-40" onClick={() => close()} disabled={busy} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-[1fr_240px] gap-4 max-md:grid-cols-1">
          <div className="relative min-h-[300px] rounded-lg overflow-hidden flex items-center justify-center" style={{ background: CHECKER }}>
            {(status === 'downloading' || status === 'processing') && (
              <div className="flex flex-col items-center gap-2 text-slate-300">
                <Loader2 size={22} className="animate-spin" />
                <span className="text-[11px]">{status === 'downloading' ? `Preparing cutout… ${progress}%` : 'Cutting out subject…'}</span>
              </div>
            )}
            {status === 'error' && <div className="flex flex-col items-center gap-2 text-red-400"><AlertCircle size={22} /><span className="text-[11px]">Could not cut out this image</span></div>}
            {status === 'ready' && (
              <div className="relative" style={{ aspectRatio: `${srcW} / ${srcH}`, width: '100%', maxHeight: '62vh' }}>
                {previewUrl && <img src={previewUrl} alt="preview" className="absolute inset-0 w-full h-full object-contain" />}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 text-slate-200">
            <Group label="Shadow"><div className="grid grid-cols-2 gap-1">{TYPES.map((t) => <Chip key={t.id} active={t.id === type} onClick={() => setType(t.id)}>{t.label}</Chip>)}</div></Group>
            <Group label={`Direction  ${direction}`}><input type="range" min={0} max={100} value={direction} onChange={(e) => setDirection(+e.target.value)} className="w-full accent-[#f7b500]" /></Group>
            <Group label={`Distance  ${distance}`}><input type="range" min={0} max={100} value={distance} onChange={(e) => setDistance(+e.target.value)} className="w-full accent-[#f7b500]" /></Group>
            <Group label={`Softness  ${softness}`}><input type="range" min={0} max={100} value={softness} onChange={(e) => setSoftness(+e.target.value)} className="w-full accent-[#f7b500]" /></Group>
            <Group label={`Opacity  ${opacity}%`}><input type="range" min={0} max={100} value={opacity} onChange={(e) => setOpacity(+e.target.value)} className="w-full accent-[#f7b500]" /></Group>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[11px] text-slate-400"><span>Shadow</span><input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-6 w-8 rounded bg-transparent" /></label>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <input type="checkbox" checked={background !== 'transparent'} onChange={(e) => setBackground(e.target.checked ? '#ffffff' : 'transparent')} className="accent-[#f7b500]" /> BG
                {background !== 'transparent' && <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} className="h-6 w-8 rounded bg-transparent" />}
              </label>
            </div>
          </div>
        </div>

        {(status === 'downloading') && (
          <div className="mt-3 h-1.5 rounded-full bg-[#12203a] overflow-hidden"><div className="h-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }} /></div>
        )}

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
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`px-1.5 py-1 rounded text-[10px] font-medium text-center transition-colors ${active ? 'bg-accent text-on-accent' : 'bg-surface-3 text-slate-300 hover:bg-surface-4'}`}>{children}</button>;
}
