import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Palette, Loader2, AlertCircle, Check, Eye, Plus, Trash2 } from 'lucide-react';
import { useColorMatchStore } from '../../../store/colorMatch';
import { useEditorStore } from '../../../store/editor';
import { useProjectStore } from '../../../project-system/hooks/useProjectStore';
import { useMediaPoolStore } from '../../../store/mediaPool';
import { mediaAssetManager } from '../../../engine/media/assetManager';
import { analyzeBitmap, renderMatch, makePreviewBitmap } from '../../../engine/color-match/imageOps';
import { buildTransform, combineStats, autoReadout, describeLook, type LabStats, type MatchMode } from '../../../engine/color-match/colorTransfer';

// Color Match: match the TARGET's tonal/chromatic character to a REFERENCE (or a weighted set), not
// its pixels. Analyses are cached; changing mode/strength/protection just re-solves the transform.
// Statistical transfer in OKLab (pure + harnessed); per-pixel apply + UI are browser-gated. Apply
// bakes a matched PNG asset + layer (the original is untouched).

interface RefItem { id: string; name: string; url: string | null; stats: LabStats; enabled: boolean }
const MODES: { id: MatchMode; label: string }[] = [{ id: 'natural', label: 'Natural' }, { id: 'creative', label: 'Creative' }, { id: 'exact', label: 'Exact' }];

async function bitmapFor(assetId: string): Promise<ImageBitmap> {
  const b = mediaAssetManager.getImageBitmap(assetId);
  if (b) return b;
  const url = mediaAssetManager.getObjectUrl(assetId);
  if (!url) throw new Error('unavailable');
  return createImageBitmap(await (await fetch(url)).blob());
}

export function ColorMatchModal() {
  const open = useColorMatchStore((s) => s.open);
  const targetId = useColorMatchStore((s) => s.targetId);
  const close = useColorMatchStore((s) => s.close);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const addImageFromAsset = useEditorStore((s) => s.addImageFromAsset);
  const onRefresh = useMediaPoolStore((s) => s.onRefresh);

  const [targetBitmap, setTargetBitmap] = useState<ImageBitmap | null>(null);
  const [targetPreview, setTargetPreview] = useState<ImageBitmap | null>(null);
  const [targetStats, setTargetStats] = useState<LabStats | null>(null);
  const [refs, setRefs] = useState<RefItem[]>([]);
  const [mode, setMode] = useState<MatchMode>('natural');
  const [strength, setStrength] = useState(80);
  const [protectSkin, setProtectSkin] = useState(true);
  const [protectNeutral, setProtectNeutral] = useState(true);
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'ready' | 'error'>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  const srcUrlRef = useRef<string | null>(null);

  const srcW = targetBitmap?.width ?? 0; const srcH = targetBitmap?.height ?? 0;

  useEffect(() => {
    if (!open || !targetId) return;
    let cancelled = false;
    setStatus('analyzing'); setRefs([]); setPreviewUrl(null);
    srcUrlRef.current = mediaAssetManager.getObjectUrl(targetId);
    (async () => {
      try {
        const bmp = await bitmapFor(targetId);
        const [prev, stats] = [await makePreviewBitmap(bmp, 900), analyzeBitmap(bmp)];
        if (cancelled) return;
        setTargetBitmap(bmp); setTargetPreview(prev); setTargetStats(stats); setStatus('ready');
      } catch { if (!cancelled) setStatus('error'); }
    })();
    return () => { cancelled = true; };
  }, [open, targetId]);

  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); }, []);

  const combinedRef = useMemo(() => combineStats(refs.filter((r) => r.enabled).map((r) => ({ stats: r.stats, weight: 1 }))), [refs]);
  const hasRef = combinedRef.count > 0;
  const transform = useMemo(() => (targetStats && hasRef ? buildTransform(targetStats, combinedRef, mode) : null), [targetStats, combinedRef, hasRef, mode]);
  const readout = useMemo(() => (targetStats && hasRef ? autoReadout(targetStats, combinedRef) : null), [targetStats, combinedRef, hasRef]);
  const look = useMemo(() => (hasRef ? describeLook(combinedRef) : null), [combinedRef, hasRef]);

  // Live preview (debounced).
  useEffect(() => {
    if (!targetPreview || status !== 'ready') return;
    if (!transform) { setPreviewUrl(null); return; }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const blob = await renderMatch(targetPreview, transform, strength / 100, { skin: protectSkin, neutral: protectNeutral });
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = url; setPreviewUrl(url);
      } catch { /* keep previous */ }
    }, 120);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [targetPreview, status, transform, strength, protectSkin, protectNeutral]);

  const projectImages = useMemo(() => {
    if (!pickerOpen) return [];
    return mediaAssetManager.getAllAssets()
      .filter((a) => a.imageMetadata != null && a.id !== targetId && !refs.some((r) => r.id === a.id))
      .map((a) => ({ id: a.id, name: a.name, url: mediaAssetManager.getObjectUrl(a.id) }));
  }, [pickerOpen, targetId, refs]);

  const addReference = useCallback(async (assetId: string, name: string) => {
    setPickerOpen(false);
    try {
      const bmp = await bitmapFor(assetId);
      const stats = analyzeBitmap(bmp);
      setRefs((r) => [...r, { id: assetId, name, url: mediaAssetManager.getObjectUrl(assetId), stats, enabled: true }]);
    } catch { /* ignore a bad asset */ }
  }, []);

  const handleApply = useCallback(async () => {
    if (!targetBitmap || !transform || !activeProjectId) return;
    setApplying(true);
    try {
      const blob = await renderMatch(targetBitmap, transform, strength / 100, { skin: protectSkin, neutral: protectNeutral });
      const name = (targetId && mediaAssetManager.getAsset(targetId)?.name?.replace(/\.[^.]+$/, '')) || 'image';
      const file = new File([blob], `${name}-matched.png`, { type: 'image/png' });
      const { assetId: newId } = await mediaAssetManager.importImage(file, activeProjectId);
      const comp = useEditorStore.getState().composition.settings;
      addImageFromAsset(newId, Math.round(comp.width / 2), Math.round(comp.height / 2));
      onRefresh?.(); close();
    } finally { setApplying(false); }
  }, [targetBitmap, transform, activeProjectId, strength, protectSkin, protectNeutral, targetId, addImageFromAsset, onRefresh, close]);

  if (!open || !targetId) return null;
  const busy = status === 'analyzing' || applying;
  const displayUrl = showOriginal || !previewUrl ? srcUrlRef.current : previewUrl;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => !busy && close()}>
      <div className="w-[min(94vw,920px)] max-h-[90vh] overflow-auto bg-[#0d1526] border border-hairline rounded-xl shadow-overlay p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-accent-hover"><Palette size={16} /><span className="text-sm font-semibold">Color Match</span></div>
          <button className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-40" onClick={() => close()} disabled={busy} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-[1fr_260px] gap-4 max-md:grid-cols-1">
          {/* Target preview */}
          <div className="relative min-h-[300px] rounded-lg overflow-hidden bg-[#070b13] flex items-center justify-center">
            {status === 'analyzing' && <div className="flex flex-col items-center gap-2 text-slate-500"><Loader2 size={22} className="animate-spin" /><span className="text-[11px]">Analyzing…</span></div>}
            {status === 'error' && <div className="flex flex-col items-center gap-2 text-red-400"><AlertCircle size={22} /><span className="text-[11px]">Could not load this image</span></div>}
            {status === 'ready' && displayUrl && (
              <div className="relative" style={{ aspectRatio: `${srcW} / ${srcH}`, width: '100%', maxHeight: '62vh' }}>
                <img src={displayUrl} alt="target" className="absolute inset-0 w-full h-full object-contain" />
                {!hasRef && <div className="absolute inset-x-0 bottom-0 p-2 text-center text-[10px] text-slate-400 bg-black/50">Add a reference image to match its look</div>}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-3 text-slate-200">
            <Group label="Reference">
              <div className="flex flex-col gap-1">
                {refs.map((r) => (
                  <div key={r.id} className="flex items-center gap-1.5 rounded bg-surface-3 px-1.5 py-1">
                    <input type="checkbox" checked={r.enabled} onChange={() => setRefs((list) => list.map((x) => x.id === r.id ? { ...x, enabled: !x.enabled } : x))} className="accent-[#f7b500]" />
                    {r.url && <img src={r.url} alt="" className="w-7 h-7 rounded object-cover" />}
                    <span className="flex-1 truncate text-[10px] text-slate-300">{r.name}</span>
                    <button onClick={() => setRefs((list) => list.filter((x) => x.id !== r.id))} className="p-0.5 rounded text-slate-500 hover:text-red-400"><Trash2 size={12} /></button>
                  </div>
                ))}
                <button onClick={() => setPickerOpen((v) => !v)} className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] bg-surface-3 border border-hairline text-slate-300 hover:bg-surface-4">
                  <Plus size={13} /> Add reference
                </button>
                {pickerOpen && (
                  <div className="max-h-40 overflow-auto grid grid-cols-3 gap-1 p-1 rounded bg-[#0a1220] border border-hairline">
                    {projectImages.length === 0 && <div className="col-span-3 text-center text-[10px] text-slate-600 py-2">No other images in the project</div>}
                    {projectImages.map((a) => (
                      <button key={a.id} onClick={() => addReference(a.id, a.name)} title={a.name} className="aspect-square rounded overflow-hidden border border-transparent hover:border-accent">
                        {a.url && <img src={a.url} alt={a.name} className="w-full h-full object-cover" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Group>

            {look && (
              <div className="rounded bg-surface-3 px-2 py-1.5 text-[10px] text-slate-400 leading-relaxed">
                <div className="uppercase tracking-wider text-slate-500 font-medium mb-0.5">Reference look</div>
                {look.temperature} · {look.contrast} contrast · {look.saturation} saturation
              </div>
            )}

            <Group label="Match mode">
              <div className="grid grid-cols-3 gap-1">{MODES.map((m) => <Chip key={m.id} active={m.id === mode} onClick={() => setMode(m.id)}>{m.label}</Chip>)}</div>
            </Group>
            <Group label={`Match strength  ${strength}%`}>
              <input type="range" min={0} max={100} value={strength} onChange={(e) => setStrength(+e.target.value)} className="w-full accent-[#f7b500]" />
            </Group>

            {readout && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
                <div className="col-span-2 uppercase tracking-wider text-slate-500 font-medium">Auto correction</div>
                <Read label="Exposure" v={readout.exposure} /><Read label="Temp" v={readout.temperature} />
                <Read label="Tint" v={readout.tint} /><Read label="Contrast" v={readout.contrast} suffix="%" />
                <Read label="Saturation" v={readout.saturation} suffix="%" />
              </div>
            )}

            <Group label="Protection">
              <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer"><input type="checkbox" checked={protectSkin} onChange={(e) => setProtectSkin(e.target.checked)} className="accent-[#f7b500]" /> Skin</label>
              <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer mt-1"><input type="checkbox" checked={protectNeutral} onChange={(e) => setProtectNeutral(e.target.checked)} className="accent-[#f7b500]" /> Neutrals</label>
            </Group>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] bg-surface-4 hover:bg-surface-5 text-slate-200 disabled:opacity-40 select-none"
            onPointerDown={() => setShowOriginal(true)} onPointerUp={() => setShowOriginal(false)} onPointerLeave={() => setShowOriginal(false)}
            disabled={status !== 'ready' || !hasRef} title="Hold to see the original"
          ><Eye size={13} /> Before / After</button>
          <button
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[11px] bg-accent-wash hover:bg-accent-wash border border-accent-dim text-accent-hover disabled:opacity-40"
            onClick={handleApply} disabled={status !== 'ready' || busy || !transform || !activeProjectId}
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
function Read({ label, v, suffix }: { label: string; v: number; suffix?: string }) {
  const s = v > 0 ? `+${v}` : `${v}`;
  return <div className="flex justify-between"><span>{label}</span><span className="tabular-nums text-slate-300">{s}{suffix ?? ''}</span></div>;
}
