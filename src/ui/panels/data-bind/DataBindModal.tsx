import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Database, Check, AlertCircle, Upload } from 'lucide-react';
import { useDataBindStore } from '../../../store/dataBind';
import { useEditorStore } from '../../../store/editor';
import { createKeyframe } from '../../../core/factory';
import {
  parseCSV, columnValues, parseJSONSeries, toNumbers, mapSeries, buildDataTrack,
  type ReactTarget,
} from '../../../core/dataBinding/dataBinding';

// Data Bind (B31-data): drive a layer property from a column of a CSV / a field of a JSON array. Bakes
// ordinary keyframes via the pure dataBinding math (parse -> numeric series -> normalise -> keyframes
// spread across the clip's frame span), so it plays + exports frame-purely. Fully synchronous - no decode.
// Mirrors AudioReactModal. Spectrum/FFT visualiser is B31-viz.

type Format = 'csv' | 'json';

interface TargetDef { id: string; label: string; path: string; kind: ReactTarget }
const TARGETS: TargetDef[] = [
  { id: 'scale', label: 'Scale', path: 'transform.scale', kind: 'vec2-uniform' },
  { id: 'opacity', label: 'Opacity', path: 'transform.opacity', kind: 'number' },
  { id: 'rotation', label: 'Rotation', path: 'transform.rotation', kind: 'number' },
  { id: 'posX', label: 'Position X', path: 'transform.position', kind: 'vec2-x' },
  { id: 'posY', label: 'Position Y', path: 'transform.position', kind: 'vec2-y' },
];
// Sensible default output range per target (position ranges are relative to the layer's base position).
function defaultRange(id: string, base: [number, number]): [number, number] {
  if (id === 'scale') return [0.5, 1.5];
  if (id === 'opacity') return [0, 1];
  if (id === 'rotation') return [0, 360];
  if (id === 'posX') return [base[0] - 150, base[0] + 150];
  if (id === 'posY') return [base[1] - 150, base[1] + 150];
  return [0, 1];
}

export function DataBindModal() {
  const open = useDataBindStore((s) => s.open);
  const layerId = useDataBindStore((s) => s.layerId);
  const close = useDataBindStore((s) => s.close);
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);

  const [format, setFormat] = useState<Format>('csv');
  const [text, setText] = useState('');
  const [csvColumn, setCsvColumn] = useState('');
  const [jsonField, setJsonField] = useState('');
  const [targetId, setTargetId] = useState('scale');
  const [min, setMin] = useState(0.5);
  const [max, setMax] = useState(1.5);
  const [invert, setInvert] = useState(false);
  const [startFrame, setStartFrame] = useState(0);
  const [endFrame, setEndFrame] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const tgt = TARGETS.find((t) => t.id === targetId) ?? TARGETS[0];
  const layer = useMemo(() => useEditorStore.getState().composition.layers.find((l) => l.id === layerId), [layerId]);
  const base = useMemo<[number, number]>(() => {
    const p = layer && 'transform' in layer ? (layer.transform.position.defaultValue as [number, number]) : [0, 0];
    return [p[0] ?? 0, p[1] ?? 0];
  }, [layer]);

  // On open: reset the form and default the frame span to the clip's in/out range.
  useEffect(() => {
    if (!open) return;
    const l = useEditorStore.getState().composition.layers.find((x) => x.id === layerId);
    const inP = l && 'inPoint' in l ? (l as { inPoint: number }).inPoint : 0;
    const outP = l && 'outPoint' in l ? (l as { outPoint: number }).outPoint : useEditorStore.getState().composition.settings.durationFrames;
    setFormat('csv'); setText(''); setCsvColumn(''); setJsonField('');
    setTargetId('scale'); setMin(0.5); setMax(1.5); setInvert(false);
    setStartFrame(inP); setEndFrame(outP); setError(null);
  }, [open, layerId]);

  // Reset the value range to the target's sensible defaults when the driven property changes.
  useEffect(() => {
    const [dMin, dMax] = defaultRange(targetId, base);
    setMin(dMin); setMax(dMax);
  }, [targetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsedCsv = useMemo(() => (format === 'csv' && text ? parseCSV(text) : null), [format, text]);

  // The numeric series the current picker selects - shared by the preview count and Apply.
  const series = useMemo<number[]>(() => {
    if (!text.trim()) return [];
    if (format === 'csv') {
      const p = parsedCsv ?? parseCSV(text);
      if (!p.headers.length) return [];
      const col = csvColumn || p.headers[0];
      return toNumbers(columnValues(p, col));
    }
    return parseJSONSeries(text, jsonField.trim() || undefined);
  }, [format, text, parsedCsv, csvColumn, jsonField]);

  const readFile = useCallback((file: File) => {
    const isJson = /\.json$/i.test(file.name);
    file.text().then((t) => {
      setText(t);
      setFormat(isJson ? 'json' : 'csv');
      setCsvColumn(''); setJsonField('');
      setError(null);
    }).catch(() => setError('Could not read that file.'));
  }, []);

  const handleApply = useCallback(() => {
    if (!layerId) return;
    if (!series.length) { setError('No numeric values found in that column/field.'); return; }
    const mapped = mapSeries(series, { min, max, invert });
    const track = buildDataTrack(mapped, { propertyPath: tgt.path, target: tgt.kind, startFrame, endFrame, base });
    if (!track.keyframes.length) { setError('Nothing to apply.'); return; }
    const kf = track.keyframes.map((k) => createKeyframe(k.frame, k.value, 'linear'));
    updateLayerProperty(layerId, `${track.propertyPath}.keyframes`, kf);
    close();
  }, [layerId, series, min, max, invert, tgt, startFrame, endFrame, base, updateLayerProperty, close]);

  if (!open || !layerId) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => close()}>
      <div className="w-[min(94vw,460px)] max-h-[90vh] overflow-auto bg-[#0d1526] border border-hairline rounded-xl shadow-overlay p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-accent-hover"><Database size={16} /><span className="text-sm font-semibold">Data Bind</span></div>
          <button className="p-1 rounded hover:bg-white/10 text-slate-400" onClick={() => close()} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="flex flex-col gap-3 text-slate-200">
          <Group label="Format">
            <div className="grid grid-cols-2 gap-1">
              <Chip active={format === 'csv'} onClick={() => setFormat('csv')}>CSV</Chip>
              <Chip active={format === 'json'} onClick={() => setFormat('json')}>JSON</Chip>
            </div>
          </Group>

          <Group label="Data">
            <label className="flex items-center gap-1.5 mb-1 px-2 py-1 rounded bg-surface-3 hover:bg-surface-4 text-[11px] text-slate-300 cursor-pointer w-max">
              <Upload size={12} /> Load file…
              <input type="file" accept=".csv,.json,.txt,text/csv,application/json,text/plain" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ''; }} />
            </label>
            <textarea value={text} onChange={(e) => { setText(e.target.value); setError(null); }}
              placeholder={format === 'csv' ? 'name,value\nA,10\nB,42\n…' : '[1, 4, 9, …]  or  [{"v":1}, {"v":4}]'}
              rows={4}
              className="w-full px-1.5 py-1 rounded bg-surface-sunken border border-hairline text-[11px] font-mono text-slate-200 focus:outline-none resize-y" />
          </Group>

          {format === 'csv' ? (
            <Group label="Column">
              <select value={csvColumn} onChange={(e) => setCsvColumn(e.target.value)}
                className="w-full h-7 px-1.5 rounded bg-surface-sunken border border-hairline text-[12px] text-slate-200 focus:outline-none">
                {(parsedCsv?.headers.length ? parsedCsv.headers : ['(load CSV)']).map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </Group>
          ) : (
            <Group label="Field path (blank = array of numbers)">
              <input type="text" value={jsonField} onChange={(e) => setJsonField(e.target.value)} placeholder="e.g. value  or  stats.score" spellCheck={false}
                className="w-full h-7 px-1.5 rounded bg-surface-sunken border border-hairline text-[12px] text-slate-200 focus:outline-none" />
            </Group>
          )}

          <Group label="Drive">
            <div className="grid grid-cols-3 gap-1">
              {TARGETS.map((t) => <Chip key={t.id} active={t.id === targetId} onClick={() => setTargetId(t.id)}>{t.label}</Chip>)}
            </div>
          </Group>

          <div className="grid grid-cols-2 gap-2">
            <Group label="Min"><NumInput value={min} onChange={setMin} /></Group>
            <Group label="Max"><NumInput value={max} onChange={setMax} /></Group>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Group label="Start frame"><NumInput value={startFrame} onChange={setStartFrame} /></Group>
            <Group label="End frame"><NumInput value={endFrame} onChange={setEndFrame} /></Group>
          </div>

          <Group label="Direction">
            <div className="grid grid-cols-2 gap-1">
              <Chip active={!invert} onClick={() => setInvert(false)}>Normal</Chip>
              <Chip active={invert} onClick={() => setInvert(true)}>Invert</Chip>
            </div>
          </Group>

          {error ? (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-400"><AlertCircle size={13} /> {error}</div>
          ) : (
            <div className="text-[11px] text-slate-500">{series.length} value{series.length === 1 ? '' : 's'} → keyframes across frames {startFrame}–{endFrame}</div>
          )}

          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[11px] bg-accent-wash hover:bg-accent-wash border border-accent-dim text-accent-hover disabled:opacity-40"
              onClick={handleApply} disabled={!series.length}
            ><Check size={13} /> Apply</button>
          </div>
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
function NumInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <input type="number" value={Number.isFinite(value) ? +value.toFixed(3) : 0} step="any" onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(v); }}
    className="w-full h-7 px-1.5 rounded bg-surface-sunken border border-hairline text-[12px] text-slate-200 focus:outline-none" />;
}
