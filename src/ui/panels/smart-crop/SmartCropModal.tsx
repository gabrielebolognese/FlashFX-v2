import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Crop, Loader2, AlertCircle, Check, Grid2x2, Images } from 'lucide-react';
import { useSmartCropStore } from '../../../store/smartCrop';
import { useEditorStore } from '../../../store/editor';
import { useProjectStore } from '../../../project-system/hooks/useProjectStore';
import { useMediaPoolStore } from '../../../store/mediaPool';
import { mediaAssetManager } from '../../../engine/media/assetManager';
import { analyzeImage, type AnalysisResult } from '../../../engine/smart-crop/analyze';
import { solveCrop, type CropResult, type FocusMode, type CompositionMode } from '../../../engine/smart-crop/cropSolver';

// Smart Crop: analyze the image ONCE, then re-solve the best crop for any aspect ratio from the same
// detected regions (never re-analyzing). Non-baked preview; Apply bakes the chosen crop to a new PNG
// asset and places it (the AiImageModal apply pattern). Detection is classical + optional Shape
// Detection API (no model download); the crop solver is pure + harnessed (verify:crop-solver).

interface RatioPreset { label: string; value: number | null } // null = Original
const RATIOS: RatioPreset[] = [
  { label: 'Original', value: null },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4 / 5 },
  { label: '3:2', value: 3 / 2 },
  { label: '4:3', value: 4 / 3 },
];
const VARIANT_RATIOS: { label: string; value: number }[] = [
  { label: '16:9', value: 16 / 9 }, { label: '4:5', value: 4 / 5 }, { label: '1:1', value: 1 }, { label: '9:16', value: 9 / 16 },
];
const FOCUS: FocusMode[] = ['auto', 'face', 'subject', 'center'];
const COMPOSITION: CompositionMode[] = ['auto', 'center', 'thirds', 'preserve'];

const TIER_COLOR = { high: '#22c55e', medium: '#eab308', low: '#ef4444' } as const;
const TIER_LABEL = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' } as const;

async function bakeCrop(bitmap: ImageBitmap, rect: { x: number; y: number; w: number; h: number }): Promise<Blob> {
  const w = Math.max(1, Math.round(rect.w)); const h = Math.max(1, Math.round(rect.h));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h);
  return canvas.convertToBlob({ type: 'image/png' });
}

export function SmartCropModal() {
  const open = useSmartCropStore((s) => s.open);
  const assetId = useSmartCropStore((s) => s.assetId);
  const close = useSmartCropStore((s) => s.close);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const addImageFromAsset = useEditorStore((s) => s.addImageFromAsset);
  const onRefresh = useMediaPoolStore((s) => s.onRefresh);

  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'ready' | 'error'>('idle');
  const [ratioIdx, setRatioIdx] = useState(1);
  const [focus, setFocus] = useState<FocusMode>('auto');
  const [composition, setComposition] = useState<CompositionMode>('auto');
  const [tightness, setTightness] = useState(100); // 60..100 -> solver tightness 0.6..1.0
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [applying, setApplying] = useState(false);
  const [manualCrop, setManualCrop] = useState<{ x: number; y: number } | null>(null); // user-dragged position override
  const areaRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ sx: number; sy: number; bx: number; by: number } | null>(null);

  const sourceUrl = assetId ? mediaAssetManager.getObjectUrl(assetId) : null;
  const assetName = (assetId && mediaAssetManager.getAsset(assetId)?.name?.replace(/\.[^.]+$/, '')) || 'image';

  // Analyze once when the modal opens on an asset.
  useEffect(() => {
    if (!open || !assetId) return;
    let cancelled = false;
    setStatus('analyzing'); setAnalysis(null); setBitmap(null);
    (async () => {
      try {
        let bmp = mediaAssetManager.getImageBitmap(assetId);
        if (!bmp) {
          const url = mediaAssetManager.getObjectUrl(assetId);
          if (!url) throw new Error('Image not available');
          const blob = await (await fetch(url)).blob();
          bmp = await createImageBitmap(blob);
        }
        if (cancelled) return;
        const res = await analyzeImage(bmp);
        if (cancelled) return;
        setBitmap(bmp); setAnalysis(res); setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [open, assetId]);

  const srcW = analysis?.srcW ?? 0;
  const srcH = analysis?.srcH ?? 0;
  const ratio = RATIOS[ratioIdx]?.value ?? (srcH > 0 ? srcW / srcH : 1);

  const crop: CropResult | null = useMemo(() => {
    if (!analysis || srcW <= 0 || srcH <= 0) return null;
    return solveCrop(srcW, srcH, ratio, analysis.regions, { focus, composition, tightness: tightness / 100, steps: 61 });
  }, [analysis, srcW, srcH, ratio, focus, composition, tightness]);

  // The crop the user sees/bakes: the solved size, with the position optionally overridden by a drag.
  const effRect = useMemo(() => (crop ? { x: manualCrop?.x ?? crop.rect.x, y: manualCrop?.y ?? crop.rect.y, w: crop.rect.w, h: crop.rect.h } : null), [crop, manualCrop]);
  // Re-solving (ratio/focus/composition/tightness or a new image) clears the manual override.
  useEffect(() => { setManualCrop(null); }, [ratioIdx, focus, composition, tightness, analysis]);

  const onCropDown = (e: React.PointerEvent) => {
    if (!effRect) return;
    e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { sx: e.clientX, sy: e.clientY, bx: effRect.x, by: effRect.y };
  };
  const onCropMove = (e: React.PointerEvent) => {
    const d = dragRef.current; const area = areaRef.current;
    if (!d || !area || !crop) return;
    const r = area.getBoundingClientRect();
    const dx = ((e.clientX - d.sx) / r.width) * srcW;
    const dy = ((e.clientY - d.sy) / r.height) * srcH;
    setManualCrop({
      x: Math.max(0, Math.min(srcW - crop.rect.w, d.bx + dx)),
      y: Math.max(0, Math.min(srcH - crop.rect.h, d.by + dy)),
    });
  };
  const onCropUp = (e: React.PointerEvent) => { dragRef.current = null; (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); };

  const applyCrop = useCallback(async (targetRatio: number, placeOffset = 0) => {
    if (!bitmap || !analysis || !activeProjectId) return;
    const c = solveCrop(analysis.srcW, analysis.srcH, targetRatio, analysis.regions, { focus, composition, tightness: tightness / 100, steps: 61 });
    const blob = await bakeCrop(bitmap, c.rect);
    const label = `${c.rect.w}x${c.rect.h}`;
    const file = new File([blob], `${assetName}-crop-${label}.png`, { type: 'image/png' });
    const { assetId: newId } = await mediaAssetManager.importImage(file, activeProjectId);
    const comp = useEditorStore.getState().composition.settings;
    addImageFromAsset(newId, Math.round(comp.width / 2) + placeOffset, Math.round(comp.height / 2) + placeOffset);
  }, [bitmap, analysis, activeProjectId, focus, composition, tightness, assetName, addImageFromAsset]);

  const handleApply = useCallback(async () => {
    if (!effRect || !bitmap || !activeProjectId) return;
    setApplying(true);
    try {
      const blob = await bakeCrop(bitmap, effRect);
      const file = new File([blob], `${assetName}-crop-${Math.round(effRect.w)}x${Math.round(effRect.h)}.png`, { type: 'image/png' });
      const { assetId: newId } = await mediaAssetManager.importImage(file, activeProjectId);
      const comp = useEditorStore.getState().composition.settings;
      addImageFromAsset(newId, Math.round(comp.width / 2), Math.round(comp.height / 2));
      onRefresh?.(); close();
    } finally { setApplying(false); }
  }, [effRect, bitmap, activeProjectId, assetName, addImageFromAsset, onRefresh, close]);

  const handleVariants = useCallback(async () => {
    setApplying(true);
    try {
      let off = 0;
      for (const v of VARIANT_RATIOS) { await applyCrop(v.value, off); off += 24; }
      onRefresh?.(); close();
    } finally { setApplying(false); }
  }, [applyCrop, onRefresh, close]);

  if (!open || !assetId) return null;

  const pct = (v: number, total: number) => `${(v / Math.max(1, total)) * 100}%`;
  const busy = status === 'analyzing' || applying;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => !busy && close()}>
      <div className="w-[min(94vw,860px)] max-h-[90vh] overflow-auto bg-[#0d1526] border border-hairline rounded-xl shadow-overlay p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-accent-hover">
            <Crop size={16} />
            <span className="text-sm font-semibold">Smart Crop</span>
            {analysis && <span className="text-[10px] text-slate-500">· {analysis.faceCount > 0 ? `${analysis.faceCount} face${analysis.faceCount > 1 ? 's' : ''}, ` : ''}{analysis.regions.length} region{analysis.regions.length !== 1 ? 's' : ''}</span>}
          </div>
          <button className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-40" onClick={() => close()} disabled={busy} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-[1fr_240px] gap-4 max-md:grid-cols-1">
          {/* Preview */}
          <div className="relative min-h-[280px] rounded-lg overflow-hidden bg-[#070b13] flex items-center justify-center">
            {status === 'analyzing' && <div className="flex flex-col items-center gap-2 text-slate-500"><Loader2 size={22} className="animate-spin" /><span className="text-[11px]">Analyzing…</span></div>}
            {status === 'error' && <div className="flex flex-col items-center gap-2 text-red-400"><AlertCircle size={22} /><span className="text-[11px]">Could not analyze this image</span></div>}
            {status === 'ready' && sourceUrl && (
              <div ref={areaRef} className="relative" style={{ aspectRatio: `${srcW} / ${srcH}`, width: '100%', maxHeight: '60vh' }}>
                <img src={sourceUrl} alt="source" className="absolute inset-0 w-full h-full object-contain select-none" draggable={false} />
                {/* subtle detected regions (only in analysis mode) */}
                {showAnalysis && analysis?.regions.map((r, i) => (
                  <div key={i} className="absolute border rounded-sm" style={{
                    left: pct(r.x * srcW, srcW), top: pct(r.y * srcH, srcH), width: pct(r.w * srcW, srcW), height: pct(r.h * srcH, srcH),
                    borderColor: r.kind === 'face' ? '#38bdf8' : r.kind === 'subject' ? '#a3e635' : 'rgba(248,181,0,0.6)',
                  }} />
                ))}
                {/* crop rectangle with dimmed surround - drag to reposition */}
                {effRect && (
                  <div
                    onPointerDown={onCropDown} onPointerMove={onCropMove} onPointerUp={onCropUp}
                    className="absolute ring-2 ring-[#f7b500] cursor-move"
                    style={{
                      left: pct(effRect.x, srcW), top: pct(effRect.y, srcH), width: pct(effRect.w, srcW), height: pct(effRect.h, srcH),
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.58)', touchAction: 'none',
                    }}>
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40">
                      {Array.from({ length: 9 }).map((_, i) => <div key={i} className="border border-white/25" />)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-3 text-slate-200">
            <Group label="Ratio">
              <div className="grid grid-cols-3 gap-1">
                {RATIOS.map((r, i) => <Chip key={r.label} active={i === ratioIdx} onClick={() => setRatioIdx(i)}>{r.label}</Chip>)}
              </div>
            </Group>
            <Group label="Focus">
              <div className="grid grid-cols-4 gap-1">
                {FOCUS.map((f) => <Chip key={f} active={f === focus} onClick={() => setFocus(f)}>{cap(f)}</Chip>)}
              </div>
            </Group>
            <Group label="Composition">
              <div className="grid grid-cols-4 gap-1">
                {COMPOSITION.map((c) => <Chip key={c} active={c === composition} onClick={() => setComposition(c)}>{cap(c)}</Chip>)}
              </div>
            </Group>
            <Group label={`Tightness  ${tightness}%`}>
              <input type="range" min={60} max={100} value={tightness} onChange={(e) => setTightness(Number(e.target.value))} className="w-full accent-[#f7b500]" />
            </Group>

            {crop && (
              <div className="flex items-center gap-2 text-[11px]">
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: TIER_COLOR[crop.tier] }} />
                <span className="text-slate-300">{TIER_LABEL[crop.tier]}</span>
              </div>
            )}
            {crop && crop.tier === 'low' && (
              <p className="text-[10px] leading-relaxed text-slate-500">No clear focal subject detected. Review the crop manually.</p>
            )}

            <label className="flex items-center gap-2 text-[11px] text-slate-400 select-none cursor-pointer">
              <input type="checkbox" checked={showAnalysis} onChange={(e) => setShowAnalysis(e.target.checked)} className="accent-[#f7b500]" />
              <Grid2x2 size={13} /> Show detected regions
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] bg-surface-4 hover:bg-surface-5 text-slate-200 disabled:opacity-40"
            onClick={handleVariants} disabled={status !== 'ready' || busy || !activeProjectId} title="Bake 16:9, 4:5, 1:1 and 9:16 from the same analysis"
          >
            <Images size={13} /> Generate variants
          </button>
          <button
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[11px] bg-accent-wash hover:bg-accent-wash border border-accent-dim text-accent-hover disabled:opacity-40"
            onClick={handleApply} disabled={status !== 'ready' || busy || !crop || !activeProjectId}
          >
            {applying ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Apply
          </button>
        </div>
      </div>
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-1">{label}</div>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`px-1.5 py-1 rounded text-[10px] font-medium text-center transition-colors ${active ? 'bg-accent text-on-accent' : 'bg-surface-3 text-slate-300 hover:bg-surface-4'}`}>
      {children}
    </button>
  );
}
