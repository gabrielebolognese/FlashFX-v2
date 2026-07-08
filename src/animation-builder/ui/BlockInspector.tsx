import { useCallback } from 'react';
import { useAnimationBuilderStore } from '../store';
import { useEditorStore } from '../../store/editor';
import { discoverProperties } from '../propertyDiscovery';
import type { Block, AnimateBlock, RelativeAnimateBlock, InstantSetBlock, WaitBlock, LoopBlock, PingPongBlock, ConditionBlock, RandomBlock } from '../types';
import type { InterpolationType } from '../../core/types';

const INTERPOLATION_OPTIONS: InterpolationType[] = ['linear', 'bezier', 'hold', 'spring'];

export function BlockInspector() {
  const activeChartId = useAnimationBuilderStore((s) => s.activeChartId);
  const chart = useAnimationBuilderStore((s) => s.flowCharts.find((c) => c.id === s.activeChartId));
  const activeBlockId = useAnimationBuilderStore((s) => s.activeBlockId);
  const updateBlock = useAnimationBuilderStore((s) => s.updateBlock);
  const removeBlock = useAnimationBuilderStore((s) => s.removeBlock);
  const composition = useEditorStore((s) => s.composition);

  const block = activeBlockId && chart ? chart.blocks[activeBlockId] : null;
  const layer = chart ? composition.layers.find((l) => l.id === chart.layerId) : null;
  const properties = layer ? discoverProperties(layer) : [];

  const update = useCallback((updates: Partial<Block>) => {
    if (!activeChartId || !activeBlockId) return;
    updateBlock(activeChartId, activeBlockId, updates);
  }, [activeChartId, activeBlockId, updateBlock]);

  const handleDelete = useCallback(() => {
    if (!activeChartId || !activeBlockId) return;
    removeBlock(activeChartId, activeBlockId);
  }, [activeChartId, activeBlockId, removeBlock]);

  if (!block) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0c0e14] px-4">
        <span className="text-[9px] text-slate-700">Select a block to edit properties</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0c0e14]">
      {/* Header */}
      <div className="h-[26px] min-h-[26px] flex items-center px-3 gap-2 border-b border-[#1c3155]">
        <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">
          {block.type.replace(/([A-Z])/g, ' $1').trim()}
        </span>
        {block.type !== 'start' && block.type !== 'end' && (
          <button onClick={handleDelete} className="ml-auto text-[8px] text-slate-600 hover:text-red-400 transition-colors">
            Delete
          </button>
        )}
      </div>

      {/* Properties in horizontal flow */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {/* Label field for all non-terminal blocks */}
          {block.type !== 'start' && block.type !== 'end' && (
            <Field label="Label" width="120px">
              <input type="text" value={block.label ?? ''} onChange={(e) => update({ label: e.target.value || undefined })}
                placeholder="Auto" className="input-field" />
            </Field>
          )}

          {/* Property selector */}
          {('property' in block) && (
            <Field label="Property" width="140px">
              <select value={(block as any).property} onChange={(e) => update({ property: e.target.value } as any)} className="input-field">
                {properties.map((p) => <option key={p.path} value={p.path}>{p.name}</option>)}
              </select>
            </Field>
          )}

          {block.type === 'animate' && <AnimateFields block={block} update={update} />}
          {block.type === 'relativeAnimate' && <RelativeAnimateFields block={block} update={update} />}
          {block.type === 'instantSet' && <InstantSetFields block={block} update={update} />}
          {block.type === 'wait' && <WaitFields block={block} update={update} />}
          {block.type === 'loop' && <LoopFields block={block} update={update} />}
          {block.type === 'pingPong' && <PingPongFields block={block} update={update} />}
          {block.type === 'condition' && <ConditionFields block={block} update={update} />}
          {block.type === 'random' && <RandomFields block={block} update={update} />}
        </div>
      </div>
    </div>
  );
}

function AnimateFields({ block, update }: { block: AnimateBlock; update: (u: Partial<Block>) => void }) {
  return (
    <>
      <Field label="Target">
        <ValueInput value={block.targetValue} onChange={(v) => update({ targetValue: v } as any)} />
      </Field>
      <Field label="Duration" width="80px">
        <input type="number" value={block.duration} onChange={(e) => update({ duration: Math.max(0.01, Number(e.target.value)) } as any)}
          step={0.1} min={0.01} className="input-field" />
      </Field>
      <Field label="Easing" width="90px">
        <select value={block.interpolation} onChange={(e) => update({ interpolation: e.target.value as InterpolationType } as any)} className="input-field">
          {INTERPOLATION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </Field>
    </>
  );
}

function RelativeAnimateFields({ block, update }: { block: RelativeAnimateBlock; update: (u: Partial<Block>) => void }) {
  return (
    <>
      <Field label="Delta">
        <ValueInput value={block.delta} onChange={(v) => update({ delta: v } as any)} />
      </Field>
      <Field label="Duration" width="80px">
        <input type="number" value={block.duration} onChange={(e) => update({ duration: Math.max(0.01, Number(e.target.value)) } as any)}
          step={0.1} min={0.01} className="input-field" />
      </Field>
      <Field label="Easing" width="90px">
        <select value={block.interpolation} onChange={(e) => update({ interpolation: e.target.value as InterpolationType } as any)} className="input-field">
          {INTERPOLATION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </Field>
    </>
  );
}

function InstantSetFields({ block, update }: { block: InstantSetBlock; update: (u: Partial<Block>) => void }) {
  return (
    <Field label="Value">
      <ValueInput value={block.value} onChange={(v) => update({ value: v } as any)} />
    </Field>
  );
}

function WaitFields({ block, update }: { block: WaitBlock; update: (u: Partial<Block>) => void }) {
  return (
    <Field label="Duration" width="80px">
      <input type="number" value={block.duration} onChange={(e) => update({ duration: Math.max(0, Number(e.target.value)) } as any)}
        step={0.1} min={0} className="input-field" />
    </Field>
  );
}

function LoopFields({ block, update }: { block: LoopBlock; update: (u: Partial<Block>) => void }) {
  return (
    <Field label="Iterations" width="80px">
      <input type="number" value={block.iterations} onChange={(e) => update({ iterations: Math.max(1, Math.round(Number(e.target.value))) } as any)}
        step={1} min={1} className="input-field" />
    </Field>
  );
}

function PingPongFields({ block, update }: { block: PingPongBlock; update: (u: Partial<Block>) => void }) {
  return (
    <Field label="Iterations" width="80px">
      <input type="number" value={block.iterations} onChange={(e) => update({ iterations: Math.max(1, Math.round(Number(e.target.value))) } as any)}
        step={1} min={1} className="input-field" />
    </Field>
  );
}

function ConditionFields({ block, update }: { block: ConditionBlock; update: (u: Partial<Block>) => void }) {
  return (
    <Field label="Expression" width="200px">
      <input type="text" value={block.conditionExpression} onChange={(e) => update({ conditionExpression: e.target.value } as any)}
        placeholder="e.g. composition.width > 1080" className="input-field" />
    </Field>
  );
}

function RandomFields({ block, update }: { block: RandomBlock; update: (u: Partial<Block>) => void }) {
  return (
    <>
      <Field label="Min" width="70px">
        <input type="number" value={block.min} onChange={(e) => update({ min: Number(e.target.value) } as any)} step={1} className="input-field" />
      </Field>
      <Field label="Max" width="70px">
        <input type="number" value={block.max} onChange={(e) => update({ max: Number(e.target.value) } as any)} step={1} className="input-field" />
      </Field>
      <Field label="Duration" width="80px">
        <input type="number" value={block.duration} onChange={(e) => update({ duration: Math.max(0.01, Number(e.target.value)) } as any)}
          step={0.1} min={0.01} className="input-field" />
      </Field>
      <Field label="Easing" width="90px">
        <select value={block.interpolation} onChange={(e) => update({ interpolation: e.target.value as InterpolationType } as any)} className="input-field">
          {INTERPOLATION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </Field>
    </>
  );
}

function Field({ label, children, width }: { label: string; children: React.ReactNode; width?: string }) {
  return (
    <div className="flex flex-col gap-0.5" style={{ width: width ?? 'auto', minWidth: width ?? 60 }}>
      <label className="text-[8px] text-slate-600 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function ValueInput({ value, onChange }: { value: number | [number, number]; onChange: (v: number | [number, number]) => void }) {
  if (typeof value === 'number') {
    return <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} step={1} className="input-field" />;
  }
  return (
    <div className="flex gap-1">
      <input type="number" value={value[0]} onChange={(e) => onChange([Number(e.target.value), value[1]])} step={1} className="input-field" placeholder="X" />
      <input type="number" value={value[1]} onChange={(e) => onChange([value[0], Number(e.target.value)])} step={1} className="input-field" placeholder="Y" />
    </div>
  );
}
