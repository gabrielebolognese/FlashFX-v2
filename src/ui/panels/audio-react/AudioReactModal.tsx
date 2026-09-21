import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, AudioLines, Loader2, Check, AlertCircle } from 'lucide-react';
import { useAudioReactStore } from '../../../store/audioReact';
import { useEditorStore } from '../../../store/editor';
import { createKeyframe } from '../../../core/factory';
import { generateAudioReactiveTrack, type ReactMode } from '../../../engine/audio/audioReactive';
import type { ReactTarget } from '../../../core/audioReactive/audioReactive';

// Audio React: drive a layer property (scale / opacity / rotation / position) from an audio track -
// either its amplitude envelope or beat pulses. Bakes ordinary keyframes (via the pure audioReactive
// math), so it plays + exports frame-purely. Decode is browser-only. Bar/spectrum visualisers (FFT) are
// B31-viz; data binding is B31-data.

interface TargetDef { id: string; label: string; path: string; kind: ReactTarget; min: number; max: number }
const TARGETS: TargetDef[] = [
  { id: 'scale', label: 'Scale', path: 'transform.scale', kind: 'vec2-uniform', min: 0.8, max: 1.35 },
  { id: 'opacity', label: 'Opacity', path: 'transform.opacity', kind: 'number', min: 0.15, max: 1 },
  { id: 'rotation', label: 'Rotation', path: 'transform.rotation', kind: 'number', min: -8, max: 8 },
  { id: 'posY', label: 'Position Y', path: 'transform.position', kind: 'vec2-y', min: 0, max: 0 },
];

export function AudioReactModal() {
  const open = useAudioReactStore((s) => s.open);
  const layerId = useAudioReactStore((s) => s.layerId);
  const close = useAudioReactStore((s) => s.close);
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);

  const [targetId, setTargetId] = useState('scale');
  const [mode, setMode] = useState<ReactMode>('amplitude');
  const [sourceAssetId, setSourceAssetId] = useState<string>('');
  const [min, setMin] = useState(0.8);
  const [max, setMax] = useState(1.35);
  const [gain, setGain] = useState(120);       // %
  const [smoothness, setSmoothness] = useState(45); // 0..100
  const [threshold, setThreshold] = useState(8);    // 0..100
  const [decay, setDecay] = useState(6);        // frames (beat mode)
  const [beatSens, setBeatSens] = useState(150); // detectBeats sensitivity *100
  const [applying, setApplying] = useState(false);
  // Audio sources (audio layers + video layers' embedded audio, de-duped) captured when the modal opens.
  const [sources, setSources] = useState<{ assetId: string; name: string }[]>([]);

  const tgt = TARGETS.find((t) => t.id === targetId) ?? TARGETS[0];
  const layer = useMemo(() => useEditorStore.getState().composition.layers.find((l) => l.id === layerId), [layerId]);
  const base = useMemo<[number, number]>(() => {
    const p = layer && 'transform' in layer ? (layer.transform.position.defaultValue as [number, number]) : [0, 0];
    return [p[0] ?? 0, p[1] ?? 0];
  }, [layer]);

  useEffect(() => {
    if (!open) return;
    const comp = useEditorStore.getState().composition;
    const out: { assetId: string; name: string }[] = [];
    const seen = new Set<string>();
    for (const l of comp.layers) {
      const a = l.type === 'audio' ? l.audio?.assetId : l.type === 'video' ? l.video?.assetId : null;
      if (a && !seen.has(a)) { seen.add(a); out.push({ assetId: a, name: l.name }); }
    }
    setSources(out);
    setSourceAssetId(out[0]?.assetId ?? '');
    setTargetId('scale'); setMode('amplitude');
    setMin(0.8); setMax(1.35); setGain(120); setSmoothness(45); setThreshold(8); setDecay(6); setBeatSens(150);
  }, [open]);

  // Reset the value range to the target's sensible defaults when the driven property changes.
  useEffect(() => {
    if (tgt.id === 'posY') { setMin(base[1]); setMax(base[1] - 150); }
    else { setMin(tgt.min); setMax(tgt.max); }
  }, [targetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApply = useCallback(async () => {
    if (!layerId || !sourceAssetId) return;
    const comp = useEditorStore.getState().composition;
    setApplying(true);
    try {
      const track = await generateAudioReactiveTrack(sourceAssetId, {
        mode, propertyPath: tgt.path, target: tgt.kind, base,
        fps: comp.settings.frameRate, frameCount: comp.settings.durationFrames,
        min, max, gain: gain / 100, threshold: threshold / 100,
        attack: 1, release: Math.max(0.05, 1 - (smoothness / 100) * 0.95),
        decayFrames: decay, sensitivity: beatSens / 100,
      });
      if (track && track.keyframes.length) {
        const kf = track.keyframes.map((k) => createKeyframe(k.frame, k.value, 'linear'));
        updateLayerProperty(layerId, `${track.propertyPath}.keyframes`, kf);
      }
      close();
    } finally { setApplying(false); }
  }, [layerId, sourceAssetId, mode, tgt, base, min, max, gain, threshold, smoothness, decay, beatSens, updateLayerProperty, close]);

  if (!open || !layerId) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => !applying && close()}>
      <div className="w-[min(94vw,460px)] max-h-[90vh] overflow-auto bg-[#0d1526] border border-hairline rounded-xl shadow-overlay p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-accent-hover"><AudioLines size={16} /><span className="text-sm font-semibold">Audio React</span></div>
          <button className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-40" onClick={() => close()} disabled={applying} aria-label="Close"><X size={16} /></button>
        </div>

        {sources.length === 0 ? (
          <div className="flex flex-col items-center gap-2 text-slate-400 py-8 text-center">
            <AlertCircle size={22} className="text-amber-400" />
            <span className="text-[12px]">Add an audio or video layer to the timeline first, then react to it.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3 text-slate-200">
            <Group label="Audio source">
              <select value={sourceAssetId} onChange={(e) => setSourceAssetId(e.target.value)} className="w-full h-7 px-1.5 rounded bg-surface-sunken border border-hairline text-[12px] text-slate-200 focus:outline-none">
                {sources.map((s) => <option key={s.assetId} value={s.assetId}>{s.name}</option>)}
              </select>
            </Group>

            <Group label="Drive">
              <div className="grid grid-cols-4 gap-1">
                {TARGETS.map((t) => <Chip key={t.id} active={t.id === targetId} onClick={() => setTargetId(t.id)}>{t.label}</Chip>)}
              </div>
            </Group>

            <Group label="Mode">
              <div className="grid grid-cols-2 gap-1">
                <Chip active={mode === 'amplitude'} onClick={() => setMode('amplitude')}>Amplitude</Chip>
                <Chip active={mode === 'beat'} onClick={() => setMode('beat')}>Beat</Chip>
              </div>
            </Group>

            <div className="grid grid-cols-2 gap-2">
              <Group label={mode === 'beat' ? 'Rest' : 'Min'}><NumInput value={min} onChange={setMin} /></Group>
              <Group label={mode === 'beat' ? 'Peak' : 'Max'}><NumInput value={max} onChange={setMax} /></Group>
            </div>

            {mode === 'amplitude' ? (
              <>
                <Group label={`Sensitivity  ${gain}%`}><input type="range" min={10} max={300} value={gain} onChange={(e) => setGain(+e.target.value)} className="w-full accent-[#f7b500]" /></Group>
                <Group label={`Smoothness  ${smoothness}`}><input type="range" min={0} max={100} value={smoothness} onChange={(e) => setSmoothness(+e.target.value)} className="w-full accent-[#f7b500]" /></Group>
                <Group label={`Threshold  ${threshold}`}><input type="range" min={0} max={100} value={threshold} onChange={(e) => setThreshold(+e.target.value)} className="w-full accent-[#f7b500]" /></Group>
              </>
            ) : (
              <>
                <Group label={`Decay  ${decay} frames`}><input type="range" min={1} max={30} value={decay} onChange={(e) => setDecay(+e.target.value)} className="w-full accent-[#f7b500]" /></Group>
                <Group label={`Beat sensitivity  ${(beatSens / 100).toFixed(2)}`}><input type="range" min={80} max={300} value={beatSens} onChange={(e) => setBeatSens(+e.target.value)} className="w-full accent-[#f7b500]" /></Group>
              </>
            )}

            <div className="mt-1 flex items-center justify-end gap-2">
              <button
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[11px] bg-accent-wash hover:bg-accent-wash border border-accent-dim text-accent-hover disabled:opacity-40"
                onClick={handleApply} disabled={applying || !sourceAssetId}
              >{applying ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Apply</button>
            </div>
          </div>
        )}
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
function NumInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <input type="number" value={Number.isFinite(value) ? +value.toFixed(3) : 0} step="any" onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(v); }}
    className="w-full h-7 px-1.5 rounded bg-surface-sunken border border-hairline text-[12px] text-slate-200 focus:outline-none" />;
}
