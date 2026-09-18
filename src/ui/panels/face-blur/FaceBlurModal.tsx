import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, ShieldAlert, Loader2, AlertCircle, Check, Eye, Plus } from 'lucide-react';
import { useFaceBlurStore } from '../../../store/faceBlur';
import { useEditorStore } from '../../../store/editor';
import { useProjectStore } from '../../../project-system/hooks/useProjectStore';
import { useMediaPoolStore } from '../../../store/mediaPool';
import { mediaAssetManager } from '../../../engine/media/assetManager';
import { detectFaces, faceDetectionAvailable } from '../../../engine/face-blur/detect';
import { renderFaceBlur, makePreviewBitmap } from '../../../engine/face-blur/treatment';
import { autoSelect, invertSelection, type FaceBox, type Treatment } from '../../../engine/face-blur/faceMask';

// Face Blur: detect faces once, let the user pick exactly which to redact, choose the treatment, and
// preview live before baking. Detection is best-effort (Shape Detection API) + manual regions; the
// bake composites on a 2D canvas -> new PNG asset + layer (original untouched). Mask geometry +
// strength normalization are pure + harnessed (verify:face-mask); detection + canvas are browser-gated.

const TREATMENTS: { id: Treatment; label: string }[] = [
  { id: 'gaussian', label: 'Gaussian' }, { id: 'pixelate', label: 'Pixelate' }, { id: 'solid', label: 'Solid' },
];

export function FaceBlurModal() {
  const open = useFaceBlurStore((s) => s.open);
  const assetId = useFaceBlurStore((s) => s.assetId);
  const close = useFaceBlurStore((s) => s.close);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const addImageFromAsset = useEditorStore((s) => s.addImageFromAsset);
  const onRefresh = useMediaPoolStore((s) => s.onRefresh);

  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [preview, setPreview] = useState<ImageBitmap | null>(null);
  const [faces, setFaces] = useState<FaceBox[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'ready' | 'error'>('idle');
  const [treatment, setTreatment] = useState<Treatment>('gaussian');
  const [strength, setStrength] = useState(72);
  const [coverage, setCoverage] = useState(110);
  const [feather, setFeather] = useState(8);
  const [solidOpacity, setSolidOpacity] = useState(100);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [applying, setApplying] = useState(false);
  const manualCount = useRef(0);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const srcUrlRef = useRef<string | null>(null);

  const srcW = bitmap?.width ?? 0; const srcH = bitmap?.height ?? 0;

  // Detect once on open.
  useEffect(() => {
    if (!open || !assetId) return;
    let cancelled = false;
    manualCount.current = 0;
    setStatus('analyzing'); setFaces([]); setSelected([]); setPreviewUrl(null);
    (async () => {
      try {
        let bmp = mediaAssetManager.getImageBitmap(assetId);
        if (!bmp) {
          const url = mediaAssetManager.getObjectUrl(assetId);
          if (!url) throw new Error('unavailable');
          bmp = await createImageBitmap(await (await fetch(url)).blob());
        }
        const detected = await detectFaces(bmp);
        const prev = await makePreviewBitmap(bmp, 1000);
        if (cancelled) return;
        setBitmap(bmp); setPreview(prev); setFaces(detected); setSelected(autoSelect(detected)); setStatus('ready');
      } catch { if (!cancelled) setStatus('error'); }
    })();
    return () => { cancelled = true; };
  }, [open, assetId]);

  const selectedFaces = useMemo(() => faces.filter((f) => selected.includes(f.id)), [faces, selected]);
  const selKey = selected.join(',') + '|' + faces.map((f) => f.id).join(',');

  // Live preview (debounced) on the downscaled bitmap.
  useEffect(() => {
    if (!preview || status !== 'ready') return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const blob = await renderFaceBlur(preview, selectedFaces, {
          treatment, strength, coverage: coverage / 100, feather, solidOpacity: solidOpacity / 100,
        });
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = url; setPreviewUrl(url);
      } catch { /* keep the previous preview */ }
    }, 120);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [preview, status, selKey, treatment, strength, coverage, feather, solidOpacity, selectedFaces]);

  // Keep an object URL for the ORIGINAL (before/after).
  useEffect(() => {
    if (!assetId) return;
    srcUrlRef.current = mediaAssetManager.getObjectUrl(assetId);
  }, [assetId]);

  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); }, []);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allIds = faces.map((f) => f.id);

  const norm = (e: React.PointerEvent) => {
    const r = areaRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const onAreaDown = (e: React.PointerEvent) => {
    if (!drawMode) return;
    e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drawStart.current = norm(e); setDraft({ ...drawStart.current, w: 0, h: 0 });
  };
  const onAreaMove = (e: React.PointerEvent) => {
    if (!drawMode || !drawStart.current) return;
    const p = norm(e); const s = drawStart.current;
    setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };
  const onAreaUp = () => {
    if (!drawMode || !draft) { drawStart.current = null; return; }
    if (draft.w > 0.01 && draft.h > 0.01) {
      const id = `manual-${manualCount.current++}`;
      const box: FaceBox = { id, x: draft.x, y: draft.y, w: draft.w, h: draft.h, confidence: 1, manual: true };
      setFaces((f) => [...f, box]); setSelected((s) => [...s, id]);
    }
    drawStart.current = null; setDraft(null); setDrawMode(false);
  };

  const handleApply = useCallback(async () => {
    if (!bitmap || !activeProjectId || selectedFaces.length === 0) return;
    setApplying(true);
    try {
      const blob = await renderFaceBlur(bitmap, selectedFaces, {
        treatment, strength, coverage: coverage / 100, feather, solidOpacity: solidOpacity / 100,
      });
      const name = (mediaAssetManager.getAsset(assetId!)?.name?.replace(/\.[^.]+$/, '')) || 'image';
      const file = new File([blob], `${name}-redacted.png`, { type: 'image/png' });
      const { assetId: newId } = await mediaAssetManager.importImage(file, activeProjectId);
      const comp = useEditorStore.getState().composition.settings;
      addImageFromAsset(newId, Math.round(comp.width / 2), Math.round(comp.height / 2));
      onRefresh?.(); close();
    } finally { setApplying(false); }
  }, [bitmap, activeProjectId, selectedFaces, treatment, strength, coverage, feather, solidOpacity, assetId, addImageFromAsset, onRefresh, close]);

  if (!open || !assetId) return null;
  const busy = status === 'analyzing' || applying;
  const displayUrl = showOriginal ? srcUrlRef.current : (previewUrl ?? srcUrlRef.current);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => !busy && close()}>
      <div className="w-[min(94vw,900px)] max-h-[90vh] overflow-auto bg-[#0d1526] border border-hairline rounded-xl shadow-overlay p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-accent-hover">
            <ShieldAlert size={16} />
            <span className="text-sm font-semibold">Face Blur</span>
            {status === 'ready' && <span className="text-[10px] text-slate-500">· {faces.length} detected, {selected.length} selected</span>}
          </div>
          <button className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-40" onClick={() => close()} disabled={busy} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-[1fr_240px] gap-4 max-md:grid-cols-1">
          {/* Preview */}
          <div className="relative min-h-[300px] rounded-lg overflow-hidden bg-[#070b13] flex items-center justify-center">
            {status === 'analyzing' && <div className="flex flex-col items-center gap-2 text-slate-500"><Loader2 size={22} className="animate-spin" /><span className="text-[11px]">Detecting faces…</span></div>}
            {status === 'error' && <div className="flex flex-col items-center gap-2 text-red-400"><AlertCircle size={22} /><span className="text-[11px]">Could not load this image</span></div>}
            {status === 'ready' && (
              <div
                ref={areaRef}
                className={`relative ${drawMode ? 'cursor-crosshair' : ''}`}
                style={{ aspectRatio: `${srcW} / ${srcH}`, width: '100%', maxHeight: '62vh' }}
                onPointerDown={onAreaDown} onPointerMove={onAreaMove} onPointerUp={onAreaUp}
              >
                {displayUrl && <img src={displayUrl} alt="preview" className="absolute inset-0 w-full h-full object-contain select-none" draggable={false} />}
                {!showOriginal && faces.map((f) => {
                  const on = selected.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      onClick={(e) => { e.stopPropagation(); if (!drawMode) toggle(f.id); }}
                      className={`absolute rounded-sm transition-colors ${on ? 'border-2 border-[#f7b500] bg-[#f7b500]/10' : 'border border-white/40 hover:border-white/80'}`}
                      style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}
                      title={f.manual ? 'Manual region' : on ? 'Selected' : 'Click to select'}
                    />
                  );
                })}
                {draft && <div className="absolute border-2 border-dashed border-[#f7b500]" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%` }} />}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-3 text-slate-200">
            <div className="flex items-center gap-1">
              <MiniBtn onClick={() => setSelected(allIds)}>All</MiniBtn>
              <MiniBtn onClick={() => setSelected([])}>None</MiniBtn>
              <MiniBtn onClick={() => setSelected((s) => invertSelection(s, allIds))}>Invert</MiniBtn>
            </div>
            {faces.length === 0 && (
              <p className="text-[10px] leading-relaxed text-slate-500">
                {faceDetectionAvailable() ? 'No faces detected.' : 'Automatic detection is not available in this browser.'} Use Add region to mark faces manually.
              </p>
            )}

            <Group label="Effect">
              <div className="grid grid-cols-3 gap-1">{TREATMENTS.map((t) => <Chip key={t.id} active={t.id === treatment} onClick={() => setTreatment(t.id)}>{t.label}</Chip>)}</div>
            </Group>
            {treatment !== 'solid' ? (
              <Group label={`Strength  ${strength}%`}><input type="range" min={0} max={100} value={strength} onChange={(e) => setStrength(+e.target.value)} className="w-full accent-[#f7b500]" /></Group>
            ) : (
              <Group label={`Opacity  ${solidOpacity}%`}><input type="range" min={0} max={100} value={solidOpacity} onChange={(e) => setSolidOpacity(+e.target.value)} className="w-full accent-[#f7b500]" /></Group>
            )}
            <Group label={`Coverage  ${coverage}%`}><input type="range" min={50} max={150} value={coverage} onChange={(e) => setCoverage(+e.target.value)} className="w-full accent-[#f7b500]" /></Group>
            <Group label={`Feather  ${feather}`}><input type="range" min={0} max={100} value={feather} onChange={(e) => setFeather(+e.target.value)} className="w-full accent-[#f7b500]" /></Group>

            <button onClick={() => setDrawMode((d) => !d)} className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] border ${drawMode ? 'bg-accent text-on-accent border-accent' : 'bg-surface-3 border-hairline text-slate-300 hover:bg-surface-4'}`}>
              <Plus size={13} /> {drawMode ? 'Draw a region…' : 'Add region'}
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] bg-surface-4 hover:bg-surface-5 text-slate-200 disabled:opacity-40 select-none"
            onPointerDown={() => setShowOriginal(true)} onPointerUp={() => setShowOriginal(false)} onPointerLeave={() => setShowOriginal(false)}
            disabled={status !== 'ready'} title="Hold to see the original"
          >
            <Eye size={13} /> Before / After
          </button>
          <button
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[11px] bg-accent-wash hover:bg-accent-wash border border-accent-dim text-accent-hover disabled:opacity-40"
            onClick={handleApply} disabled={status !== 'ready' || busy || selectedFaces.length === 0 || !activeProjectId}
          >
            {applying ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Apply
          </button>
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
function MiniBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className="flex-1 px-1.5 py-1 rounded text-[10px] font-medium bg-surface-3 text-slate-300 hover:bg-surface-4">{children}</button>;
}
