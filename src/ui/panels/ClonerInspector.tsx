import { useEditorStore } from '../../store/editor';
import type { ClonerLayer, ClonerEffector, ClonerDistribution, EffectorBlendMode, EffectorWaveform, EasingCurve } from '../../cloner/types';
import { createGridDistribution, createRadialDistribution, createPathDistribution } from '../../cloner/factory';
import { DragInput } from '../components/DragInput';
import { Boxes, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';

// M16 — Cloner authoring UI. Reads the active cloner layer and edits its params through the
// store: scalar/vector/enum via updateLayerProperty dot-paths (deepSet walks array indices +
// nested objects), the effector array via the dedicated add/remove/reorder actions. Mirrors
// FieldSamplingPanel (no props, self-selects the active layer). NOTE: the renderer does not
// draw cloner instances yet — this makes the cloner authorable + persistable; visible output
// is the separate GPU chunk. (DragInput owns the per-drag undo entry via commitLabel.)

const SOURCE_TYPES = new Set(['shape', 'text', 'image', 'video', 'lottieIcon']);

type SetFn = (path: string, value: number | string | boolean) => void;

// ── small local UI helpers (Inspector's Section/etc. are not exported) ──
function Sec({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border-b border-hairline">
      <div className="px-3 py-1.5 bg-surface-sunken flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{title}</span>
        {right}
      </div>
      <div className="px-3 py-2 space-y-1.5">{children}</div>
    </div>
  );
}

function Seg<T extends string>({ label, value, opts, onChange }: { label?: string; value: T; opts: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-2">
      {label && <label className="text-[10px] text-slate-500 w-14 flex-shrink-0">{label}</label>}
      <div className="flex flex-1 rounded border border-hairline overflow-hidden">
        {opts.map((o) => (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className={`flex-1 text-[9px] py-1 transition-colors ${value === o.v ? 'bg-accent-wash text-accent' : 'bg-surface-3 text-slate-400 hover:text-slate-200'}`}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Num({ label, value, onChange, commitLabel, ...rest }: { label: string; value: number; onChange: (v: number) => void; commitLabel: string; min?: number; max?: number; step?: number; precision?: number; suffix?: string }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] text-slate-500 w-14 flex-shrink-0">{label}</label>
      <div className="flex-1"><DragInput value={value} onChange={onChange} commitLabel={commitLabel} {...rest} /></div>
    </div>
  );
}

const BLEND_OPTS: { v: EffectorBlendMode; l: string }[] = [{ v: 'add', l: 'Add' }, { v: 'multiply', l: 'Mult' }, { v: 'override', l: 'Over' }];
const WAVE_OPTS: { v: EffectorWaveform; l: string }[] = [{ v: 'sine', l: 'Sin' }, { v: 'triangle', l: 'Tri' }, { v: 'square', l: 'Sqr' }, { v: 'sawtooth', l: 'Saw' }];
const CURVE_OPTS: { v: EasingCurve; l: string }[] = [{ v: 'linear', l: 'Lin' }, { v: 'easeIn', l: 'In' }, { v: 'easeOut', l: 'Out' }, { v: 'easeInOut', l: 'IO' }];
const EFFECTOR_TYPES: ClonerEffector['type'][] = ['random', 'falloff', 'step', 'time', 'target'];

export function ClonerInspector() {
  const composition = useEditorStore((s) => s.composition);
  const selection = useEditorStore((s) => s.selection);
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const addClonerEffector = useEditorStore((s) => s.addClonerEffector);
  const removeClonerEffector = useEditorStore((s) => s.removeClonerEffector);
  const reorderClonerEffector = useEditorStore((s) => s.reorderClonerEffector);

  const layer = composition.layers.find((l) => l.id === selection.activeId);
  if (!layer || layer.type !== 'cloner') {
    return <div className="px-3 py-4 text-[10px] text-slate-600">Select a Cloner layer to edit its distribution and effectors.</div>;
  }
  const c = layer as ClonerLayer;
  const id = c.id;
  const set: SetFn = (path, value) => updateLayerProperty(id, path, value);

  const sources = composition.layers.filter((l) => l.id !== id && SOURCE_TYPES.has(l.type));
  const motionPaths = composition.motionPaths ?? [];
  const dist = c.distribution;

  const switchDist = (type: ClonerDistribution['type']) => {
    if (type === dist.type) return;
    let next: ClonerDistribution;
    if (type === 'grid') next = createGridDistribution();
    else if (type === 'radial') next = createRadialDistribution();
    else if (type === 'path') { if (motionPaths.length === 0) return; next = createPathDistribution(motionPaths[0].id); }
    else return;
    updateLayerProperty(id, 'distribution', next);
  };

  return (
    <div>
      <div className="px-3 py-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
        <Boxes size={12} className="text-accent" /> Cloner
      </div>

      <Sec title="Source">
        <select
          value={c.sourceRef.type === 'layer' ? c.sourceRef.layerId : ''}
          onChange={(e) => updateLayerProperty(id, 'sourceRef', { type: 'layer', layerId: e.target.value })}
          className="w-full bg-surface-3 text-[11px] text-slate-300 px-1.5 py-1 rounded border border-hairline focus:border-accent-dim outline-none"
        >
          {sources.length === 0 && <option value="">No eligible layers</option>}
          {sources.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </Sec>

      <Sec title="Distribution">
        <Seg
          value={dist.type === 'field' ? 'grid' : dist.type}
          opts={[{ v: 'grid', l: 'Grid' }, { v: 'radial', l: 'Radial' }, { v: 'path', l: 'Path' }]}
          onChange={(v) => switchDist(v as ClonerDistribution['type'])}
        />
        {dist.type === 'grid' && (
          <>
            <Num label="Count X" value={dist.countX} min={1} step={1} precision={0} onChange={(v) => set('distribution.countX', v)} commitLabel="Cloner Count X" />
            <Num label="Count Y" value={dist.countY} min={1} step={1} precision={0} onChange={(v) => set('distribution.countY', v)} commitLabel="Cloner Count Y" />
            <Num label="Space X" value={dist.spacing.x} onChange={(v) => set('distribution.spacing.x', v)} commitLabel="Cloner Spacing X" />
            <Num label="Space Y" value={dist.spacing.y} onChange={(v) => set('distribution.spacing.y', v)} commitLabel="Cloner Spacing Y" />
            <Num label="Row Off" value={dist.rowOffset} onChange={(v) => set('distribution.rowOffset', v)} commitLabel="Cloner Row Offset" />
          </>
        )}
        {dist.type === 'radial' && (
          <>
            <Num label="Count" value={dist.count} min={1} step={1} precision={0} onChange={(v) => set('distribution.count', v)} commitLabel="Cloner Count" />
            <Num label="Radius" value={dist.radius} onChange={(v) => set('distribution.radius', v)} commitLabel="Cloner Radius" />
            <Num label="Arc °" value={dist.arcDegrees} onChange={(v) => set('distribution.arcDegrees', v)} commitLabel="Cloner Arc" />
            <Num label="Start °" value={dist.startAngleDegrees} onChange={(v) => set('distribution.startAngleDegrees', v)} commitLabel="Cloner Start Angle" />
            <Seg label="Orient" value={dist.orientToCenter ? 'on' : 'off'} opts={[{ v: 'off', l: 'Off' }, { v: 'on', l: 'To Center' }]} onChange={(v) => set('distribution.orientToCenter', v === 'on')} />
          </>
        )}
        {dist.type === 'path' && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-slate-500 w-14 flex-shrink-0">Path</label>
              <select
                value={dist.pathRef}
                onChange={(e) => set('distribution.pathRef', e.target.value)}
                className="flex-1 bg-surface-3 text-[11px] text-slate-300 px-1.5 py-0.5 rounded border border-hairline outline-none"
              >
                {motionPaths.map((p, idx) => <option key={p.id} value={p.id}>Path {idx + 1}</option>)}
              </select>
            </div>
            <Num label="Count" value={dist.count} min={1} step={1} precision={0} onChange={(v) => set('distribution.count', v)} commitLabel="Cloner Count" />
            <Seg label="Orient" value={dist.orientToPath ? 'on' : 'off'} opts={[{ v: 'off', l: 'Off' }, { v: 'on', l: 'To Path' }]} onChange={(v) => set('distribution.orientToPath', v === 'on')} />
          </>
        )}
      </Sec>

      <Sec title="Instances">
        <Num label="Max" value={c.renderCount} min={1} max={2000} step={1} precision={0} onChange={(v) => set('renderCount', v)} commitLabel="Cloner Max Instances" />
        <div className="text-[9px] text-slate-600">Hard cap on rendered instances.</div>
      </Sec>

      <Sec title="Stagger">
        <Num label="Delay" value={c.stagger.delaySeconds} step={0.05} suffix="s" onChange={(v) => set('stagger.delaySeconds', v)} commitLabel="Cloner Stagger" />
        <Seg label="Curve" value={c.stagger.curve ?? 'linear'} opts={CURVE_OPTS} onChange={(v) => set('stagger.curve', v)} />
      </Sec>

      <Sec
        title="Effectors"
        right={
          <div className="flex gap-0.5">
            {EFFECTOR_TYPES.map((t) => (
              <button key={t} title={`Add ${t} effector`} onClick={() => addClonerEffector(id, t)} className="text-[8px] px-1 py-0.5 rounded bg-surface-3 text-slate-400 hover:text-accent border border-hairline capitalize">
                <Plus size={7} className="inline" />{t}
              </button>
            ))}
          </div>
        }
      >
        {c.effectors.length === 0 && <div className="text-[9px] text-slate-600">No effectors. Add one above to modulate the clones.</div>}
        {c.effectors.map((eff, i) => (
          <div key={i} className="rounded border border-hairline p-1.5 space-y-1 bg-[#0a1628]/50">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-300 capitalize font-medium">{eff.type}</span>
              <div className="flex gap-0.5">
                <button onClick={() => reorderClonerEffector(id, i, 'up')} disabled={i === 0} className="text-slate-500 hover:text-slate-200 disabled:opacity-30"><ChevronUp size={12} /></button>
                <button onClick={() => reorderClonerEffector(id, i, 'down')} disabled={i === c.effectors.length - 1} className="text-slate-500 hover:text-slate-200 disabled:opacity-30"><ChevronDown size={12} /></button>
                <button onClick={() => removeClonerEffector(id, i)} className="text-slate-500 hover:text-red-400"><Trash2 size={11} /></button>
              </div>
            </div>
            <Num label="Strength" value={eff.strength} step={0.05} onChange={(v) => set(`effectors.${i}.strength`, v)} commitLabel="Effector Strength" />
            <Seg label="Blend" value={eff.blendMode} opts={BLEND_OPTS} onChange={(v) => set(`effectors.${i}.blendMode`, v)} />
            <EffectorParams eff={eff} i={i} set={set} />
          </div>
        ))}
      </Sec>
    </div>
  );
}

function EffectorParams({ eff, i, set }: { eff: ClonerEffector; i: number; set: SetFn }) {
  const p = `effectors.${i}`;
  if (eff.type === 'random') {
    return (
      <>
        <Num label="Seed" value={eff.seed} step={1} precision={0} onChange={(v) => set(`${p}.seed`, v)} commitLabel="Effector Seed" />
        <Num label="Pos X" value={eff.positionAmount.x} onChange={(v) => set(`${p}.positionAmount.x`, v)} commitLabel="Effector Pos X" />
        <Num label="Pos Y" value={eff.positionAmount.y} onChange={(v) => set(`${p}.positionAmount.y`, v)} commitLabel="Effector Pos Y" />
        <Num label="Rot Z" value={eff.rotationAmount.z} onChange={(v) => set(`${p}.rotationAmount.z`, v)} commitLabel="Effector Rot Z" />
        <Num label="Scale" value={eff.scaleAmount} step={0.05} onChange={(v) => set(`${p}.scaleAmount`, v)} commitLabel="Effector Scale" />
        <Num label="Opacity" value={eff.opacityAmount} step={0.05} onChange={(v) => set(`${p}.opacityAmount`, v)} commitLabel="Effector Opacity" />
      </>
    );
  }
  if (eff.type === 'falloff') {
    return (
      <>
        {eff.shape.type === 'radial' && (
          <>
            <Num label="Inner R" value={eff.shape.innerRadius} onChange={(v) => set(`${p}.shape.innerRadius`, v)} commitLabel="Falloff Inner" />
            <Num label="Outer R" value={eff.shape.outerRadius} onChange={(v) => set(`${p}.shape.outerRadius`, v)} commitLabel="Falloff Outer" />
          </>
        )}
        <Num label="Curve" value={eff.curveExponent} step={0.1} onChange={(v) => set(`${p}.curveExponent`, v)} commitLabel="Falloff Curve" />
        <Num label="Scale Δ" value={eff.scaleDelta} step={0.05} onChange={(v) => set(`${p}.scaleDelta`, v)} commitLabel="Falloff Scale" />
        <Num label="Opac Δ" value={eff.opacityDelta} step={0.05} onChange={(v) => set(`${p}.opacityDelta`, v)} commitLabel="Falloff Opacity" />
      </>
    );
  }
  if (eff.type === 'step' || eff.type === 'time') {
    return (
      <>
        <Seg label="Wave" value={eff.waveform} opts={WAVE_OPTS} onChange={(v) => set(`${p}.waveform`, v)} />
        <Num label="Freq" value={eff.frequency} step={0.1} onChange={(v) => set(`${p}.frequency`, v)} commitLabel="Effector Frequency" />
        <Num label="Phase" value={eff.phase} step={0.05} onChange={(v) => set(`${p}.phase`, v)} commitLabel="Effector Phase" />
        <Num label="Pos Y" value={eff.positionAmount.y} onChange={(v) => set(`${p}.positionAmount.y`, v)} commitLabel="Effector Pos Y" />
        <Num label="Rot Z" value={eff.rotationAmount.z} onChange={(v) => set(`${p}.rotationAmount.z`, v)} commitLabel="Effector Rot Z" />
        <Num label="Scale" value={eff.scaleAmount} step={0.05} onChange={(v) => set(`${p}.scaleAmount`, v)} commitLabel="Effector Scale" />
      </>
    );
  }
  // target
  return (
    <>
      <Num label="Target X" value={eff.target.x} onChange={(v) => set(`${p}.target.x`, v)} commitLabel="Effector Target X" />
      <Num label="Target Y" value={eff.target.y} onChange={(v) => set(`${p}.target.y`, v)} commitLabel="Effector Target Y" />
    </>
  );
}
