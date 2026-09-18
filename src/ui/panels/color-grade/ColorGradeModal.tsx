import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, SlidersHorizontal, Loader2, AlertCircle, Check, Upload } from 'lucide-react';
import { useColorGradeStore } from '../../../store/colorGrade';
import { useEditorStore } from '../../../store/editor';
import { useProjectStore } from '../../../project-system/hooks/useProjectStore';
import { useMediaPoolStore } from '../../../store/mediaPool';
import { mediaAssetManager } from '../../../engine/media/assetManager';
import { renderGrade, makePreviewBitmap } from '../../../engine/color-grade/colorGrade';
import { parseCube, type LUT3D } from '../../../core/effects/lut';
import { GRADE_PRESETS, type GradePreset } from '../../../core/effects/gradePresets';

// Color Grade: film-look presets (tone curves + saturation) and/or a loaded .cube 3D LUT, blended by
// intensity. The curve/LUT engine is pure + harnessed; the per-pixel bake is browser-only. Apply
// bakes a new PNG asset + layer (original untouched). The live per-layer GPU LUT is B15-gpu.

export function ColorGradeModal() {
  const open = useColorGradeStore((s) => s.open);
  const assetId = useColorGradeStore((s) => s.assetId);
  const close = useColorGradeStore((s) => s.close);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const addImageFromAsset = useEditorStore((s) => s.addImageFromAsset);
  const onRefresh = useMediaPoolStore((s) => s.onRefresh);

  const [full, setFull] = useState<ImageBitmap | null>(null);
  const [preview, setPreview] = useState<ImageBitmap | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [presetName, setPresetName] = useState('none');
  const [lut, setLut] = useState<LUT3D | null>(null);
  const [lutName, setLutName] = useState<string | null>(null);
  const [intensity, setIntensity] = useState(100);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const sourceUrl = assetId ? mediaAssetManager.getObjectUrl(assetId) : null;
  const assetName = (assetId && mediaAssetManager.getAsset(assetId)?.name?.replace(/\.[^.]+$/, '')) || 'image';
  const preset = useMemo<GradePreset | null>(() => GRADE_PRESETS.find((p) => p.name === presetName) ?? null, [presetName]);
  const settings = useMemo(() => ({ preset, lut, intensity: intensity / 100 }), [preset, lut, intensity]);

  useEffect(() => {
    if (!open || !assetId) return;
    let cancelled = false;
    setStatus('loading'); setFull(null); setPreview(null); setPreviewUrl(null); setLut(null); setLutName(null); setPresetName('none'); setIntensity(100);
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

  // Live preview (debounced).
  useEffect(() => {
    if (!preview || status !== 'ready') return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const blob = await renderGrade(preview, settings);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = url; setPreviewUrl(url);
      } catch { /* keep previous */ }
    }, 110);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [preview, status, settings]);

  const onLoadLut = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseCube(text);
      if (parsed) { setLut(parsed); setLutName(file.name); }
      else { setLut(null); setLutName('Invalid .cube'); }
    } catch { setLut(null); setLutName('Could not read file'); }
  }, []);

  const handleApply = useCallback(async () => {
    if (!full || !activeProjectId) return;
    setApplying(true);
    try {
      const blob = await renderGrade(full, settings);
      const file = new File([blob], `${assetName}-graded.png`, { type: 'image/png' });
      const { assetId: newId } = await mediaAssetManager.importImage(file, activeProjectId);
      const comp = useEditorStore.getState().composition.settings;
      addImageFromAsset(newId, Math.round(comp.width / 2), Math.round(comp.height / 2));
      onRefresh?.(); close();
    } finally { setApplying(false); }
  }, [full, activeProjectId, settings, assetName, addImageFromAsset, onRefresh, close]);

  if (!open || !assetId) return null;
  const busy = status === 'loading' || applying;
  const srcW = full?.width ?? 1, srcH = full?.height ?? 1;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => !busy && close()}>
      <div className="w-[min(94vw,880px)] max-h-[90vh] overflow-auto bg-[#0d1526] border border-hairline rounded-xl shadow-overlay p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-accent-hover"><SlidersHorizontal size={16} /><span className="text-sm font-semibold">Color Grade</span></div>
          <button className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-40" onClick={() => close()} disabled={busy} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-[1fr_240px] gap-4 max-md:grid-cols-1">
          <div className="relative min-h-[300px] rounded-lg overflow-hidden bg-[#070b13] flex items-center justify-center">
            {status === 'loading' && <Loader2 size={22} className="animate-spin text-slate-500" />}
            {status === 'error' && <div className="flex flex-col items-center gap-2 text-red-400"><AlertCircle size={22} /><span className="text-[11px]">Could not load this image</span></div>}
            {status === 'ready' && (
              <div className="relative" style={{ aspectRatio: `${srcW} / ${srcH}`, width: '100%', maxHeight: '62vh' }}>
                {(previewUrl ?? sourceUrl) && <img src={previewUrl ?? sourceUrl ?? ''} alt="preview" className="absolute inset-0 w-full h-full object-contain" />}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 text-slate-200">
            <Group label="Film look">
              <div className="grid grid-cols-2 gap-1">
                {GRADE_PRESETS.map((p) => (
                  <button key={p.name} onClick={() => setPresetName(p.name)}
                    className={`px-1.5 py-1 rounded text-[10px] font-medium text-center transition-colors ${p.name === presetName ? 'bg-accent text-on-accent' : 'bg-surface-3 text-slate-300 hover:bg-surface-4'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </Group>

            <Group label="LUT (.cube)">
              <div className="flex items-center gap-1.5">
                <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] bg-surface-3 border border-hairline text-slate-300 hover:bg-surface-4">
                  <Upload size={13} /> Load
                </button>
                {lut && <button onClick={() => { setLut(null); setLutName(null); }} className="text-[10px] text-slate-500 hover:text-red-400">clear</button>}
                <input ref={fileRef} type="file" accept=".cube" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onLoadLut(f); e.target.value = ''; }} />
              </div>
              {lutName && <div className={`mt-1 text-[9px] truncate ${lut ? 'text-slate-400' : 'text-red-400'}`}>{lut ? `${lutName} · ${lut.size}³` : lutName}</div>}
            </Group>

            <Group label={`Intensity  ${intensity}%`}>
              <input type="range" min={0} max={100} value={intensity} onChange={(e) => setIntensity(+e.target.value)} className="w-full accent-[#f7b500]" />
            </Group>
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
