import { useEditorStore } from '../../store/editor';
import { DragInput } from '../components/DragInput';
import type { LayoutObjectLayer, LayoutParams, MainAxisAlignment, CrossAxisAlignment, ChildLayoutOverride } from '../../core/types';
import {
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  Maximize2, Minus, GripVertical, ArrowRight, ArrowDown, Trash2,
  Grid3x3,
} from 'lucide-react';

interface LayoutPanelProps {
  layer: LayoutObjectLayer;
}

export function LayoutParamsPanel({ layer }: LayoutPanelProps) {
  const updateLayoutParams = useEditorStore((s) => s.updateLayoutParams);
  const p = layer.layoutParams;
  const isHBox = layer.type === 'hbox';
  const isGrid = layer.type === 'grid';

  const setParam = (updates: Partial<LayoutParams>) => updateLayoutParams(layer.id, updates);

  return (
    <div className="space-y-3">
      {/* Direction indicator */}
      <div className="flex items-center gap-2 px-1">
        {isGrid ? <Grid3x3 size={13} className="text-[#f7b500]" /> : isHBox ? <ArrowRight size={13} className="text-[#f7b500]" /> : <ArrowDown size={13} className="text-[#f7b500]" />}
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
          {isGrid ? 'Grid Layout' : isHBox ? 'Horizontal Layout' : 'Vertical Layout'}
        </span>
      </div>

      {/* Grid-specific properties */}
      {isGrid && (
        <Section label="Grid">
          <DragInput label="Columns" value={p.gridColumns ?? 3} onChange={(v) => setParam({ gridColumns: Math.max(1, Math.round(v)) })} min={1} max={12} step={1} precision={0} />
          <DragInput label="H Gap" value={p.gridHGap ?? 20} onChange={(v) => setParam({ gridHGap: Math.max(0, v) })} min={0} max={200} step={1} precision={0} suffix="px" />
          <DragInput label="V Gap" value={p.gridVGap ?? 20} onChange={(v) => setParam({ gridVGap: Math.max(0, v) })} min={0} max={200} step={1} precision={0} suffix="px" />

          <div className="space-y-1">
            <span className="text-[9px] text-slate-500">Horizontal Align</span>
            <div className="flex gap-0.5">
              {(['start', 'center', 'end'] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setParam({ gridHAlign: a })}
                  className={`flex-1 px-1 py-0.5 text-[9px] rounded capitalize transition-colors ${
                    (p.gridHAlign ?? 'start') === a
                      ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30'
                      : 'bg-[#122240] text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {a === 'start' ? 'Left' : a === 'end' ? 'Right' : 'Center'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[9px] text-slate-500">Vertical Align</span>
            <div className="flex gap-0.5">
              {(['start', 'center', 'end'] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setParam({ gridVAlign: a })}
                  className={`flex-1 px-1 py-0.5 text-[9px] rounded capitalize transition-colors ${
                    (p.gridVAlign ?? 'start') === a
                      ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30'
                      : 'bg-[#122240] text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {a === 'start' ? 'Top' : a === 'end' ? 'Bottom' : 'Center'}
                </button>
              ))}
            </div>
          </div>
        </Section>
      )}

      {/* Size */}
      <Section label="Size">
        <SizeControl label="Width" value={p.width} onChange={(v) => setParam({ width: v })} />
        <SizeControl label="Height" value={p.height} onChange={(v) => setParam({ height: v })} />
      </Section>

      {/* Spacing - only for HBox/VBox */}
      {!isGrid && (
        <Section label="Spacing & Padding">
          <DragInput label="Gap" value={p.spacing} onChange={(v) => setParam({ spacing: Math.max(0, v) })} min={0} max={200} step={1} precision={0} suffix="px" />
          <div className="grid grid-cols-2 gap-1">
            <DragInput label="Top" value={p.padding.top} onChange={(v) => setParam({ padding: { ...p.padding, top: Math.max(0, v) } })} min={0} max={200} step={1} precision={0} />
            <DragInput label="Right" value={p.padding.right} onChange={(v) => setParam({ padding: { ...p.padding, right: Math.max(0, v) } })} min={0} max={200} step={1} precision={0} />
            <DragInput label="Bottom" value={p.padding.bottom} onChange={(v) => setParam({ padding: { ...p.padding, bottom: Math.max(0, v) } })} min={0} max={200} step={1} precision={0} />
            <DragInput label="Left" value={p.padding.left} onChange={(v) => setParam({ padding: { ...p.padding, left: Math.max(0, v) } })} min={0} max={200} step={1} precision={0} />
          </div>
        </Section>
      )}

      {/* Padding for grid */}
      {isGrid && (
        <Section label="Padding">
          <div className="grid grid-cols-2 gap-1">
            <DragInput label="Top" value={p.padding.top} onChange={(v) => setParam({ padding: { ...p.padding, top: Math.max(0, v) } })} min={0} max={200} step={1} precision={0} />
            <DragInput label="Right" value={p.padding.right} onChange={(v) => setParam({ padding: { ...p.padding, right: Math.max(0, v) } })} min={0} max={200} step={1} precision={0} />
            <DragInput label="Bottom" value={p.padding.bottom} onChange={(v) => setParam({ padding: { ...p.padding, bottom: Math.max(0, v) } })} min={0} max={200} step={1} precision={0} />
            <DragInput label="Left" value={p.padding.left} onChange={(v) => setParam({ padding: { ...p.padding, left: Math.max(0, v) } })} min={0} max={200} step={1} precision={0} />
          </div>
        </Section>
      )}

      {/* Main Axis Alignment - HBox/VBox only */}
      {!isGrid && (
        <Section label="Main Axis">
          <AlignmentPicker
            options={MAIN_AXIS_OPTIONS}
            value={p.mainAxisAlignment}
            onChange={(v) => setParam({ mainAxisAlignment: v as MainAxisAlignment })}
            isHorizontal={isHBox}
          />
        </Section>
      )}

      {/* Cross Axis Alignment - HBox/VBox only */}
      {!isGrid && (
        <Section label="Cross Axis">
          <AlignmentPicker
            options={CROSS_AXIS_OPTIONS}
            value={p.crossAxisAlignment}
            onChange={(v) => setParam({ crossAxisAlignment: v as CrossAxisAlignment })}
            isHorizontal={!isHBox}
          />
        </Section>
      )}

      {/* Advanced Grid placeholders */}
      {isGrid && (
        <Section label="Advanced">
          <div className="space-y-1">
            {['Uniform Cells', 'Auto Fill', 'Responsive Mode', 'Masonry Mode'].map((feat) => (
              <div key={feat} className="flex items-center justify-between px-1 py-1 opacity-40">
                <span className="text-[9px] text-slate-400">{feat}</span>
                <span className="text-[8px] text-slate-600 bg-white/[0.03] px-1.5 py-0.5 rounded">Coming soon</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Visual */}
      <Section label="Visual">
        <DragInput label="Radius" value={p.borderRadius} onChange={(v) => setParam({ borderRadius: Math.max(0, v) })} min={0} max={100} step={1} precision={0} suffix="px" />
        <DragInput label="Border" value={p.borderWidth} onChange={(v) => setParam({ borderWidth: Math.max(0, v) })} min={0} max={20} step={0.5} precision={1} suffix="px" />
        <DragInput label="Opacity" value={p.opacity * 100} onChange={(v) => setParam({ opacity: Math.max(0, Math.min(100, v)) / 100 })} min={0} max={100} step={1} precision={0} suffix="%" />
      </Section>

      {/* Overflow */}
      <Section label="Overflow">
        <div className="flex gap-0.5">
          {(['visible', 'clip', 'scroll'] as const).map((o) => (
            <button
              key={o}
              onClick={() => setParam({ overflowBehavior: o })}
              className={`flex-1 px-1 py-0.5 text-[9px] rounded capitalize transition-colors ${
                p.overflowBehavior === o
                  ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30'
                  : 'bg-[#122240] text-slate-500 hover:text-slate-300'
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      </Section>

      {/* Children list */}
      <Section label={`Children (${layer.children.length})`}>
        <ChildrenList layer={layer} />
      </Section>
    </div>
  );
}

interface ChildLayoutOverridePanelProps {
  layoutId: string;
  childId: string;
  override: ChildLayoutOverride;
}

export function ChildLayoutOverridePanel({ layoutId, childId, override }: ChildLayoutOverridePanelProps) {
  const updateChildOverride = useEditorStore((s) => s.updateChildOverride);
  const setOverride = (updates: Partial<ChildLayoutOverride>) => updateChildOverride(layoutId, childId, updates);

  return (
    <div className="space-y-2 border-t border-[#1a2a42] pt-2 mt-2">
      <div className="flex items-center gap-2 px-1">
        <GripVertical size={11} className="text-[#f7b500]" />
        <span className="text-[9px] uppercase tracking-wider text-slate-500 font-medium">Layout Child</span>
      </div>

      <div className="flex gap-1">
        <DragInput label="Grow" value={override.grow} onChange={(v) => setOverride({ grow: Math.max(0, v) })} min={0} max={10} step={0.1} precision={1} className="flex-1" />
        <DragInput label="Shrink" value={override.shrink} onChange={(v) => setOverride({ shrink: Math.max(0, Math.min(1, v)) })} min={0} max={1} step={0.1} precision={1} className="flex-1" />
      </div>

      <div className="grid grid-cols-2 gap-1">
        <DragInput label="Min W" value={override.minWidth ?? 0} onChange={(v) => setOverride({ minWidth: v > 0 ? v : undefined })} min={0} max={2000} step={1} precision={0} />
        <DragInput label="Max W" value={override.maxWidth ?? 9999} onChange={(v) => setOverride({ maxWidth: v < 9999 ? v : undefined })} min={0} max={9999} step={1} precision={0} />
        <DragInput label="Min H" value={override.minHeight ?? 0} onChange={(v) => setOverride({ minHeight: v > 0 ? v : undefined })} min={0} max={2000} step={1} precision={0} />
        <DragInput label="Max H" value={override.maxHeight ?? 9999} onChange={(v) => setOverride({ maxHeight: v < 9999 ? v : undefined })} min={0} max={9999} step={1} precision={0} />
      </div>

      <div className="space-y-1">
        <span className="text-[9px] text-slate-500">Margin</span>
        <div className="grid grid-cols-2 gap-1">
          <DragInput label="T" value={override.margin.top} onChange={(v) => setOverride({ margin: { ...override.margin, top: Math.max(0, v) } })} min={0} max={100} step={1} precision={0} />
          <DragInput label="R" value={override.margin.right} onChange={(v) => setOverride({ margin: { ...override.margin, right: Math.max(0, v) } })} min={0} max={100} step={1} precision={0} />
          <DragInput label="B" value={override.margin.bottom} onChange={(v) => setOverride({ margin: { ...override.margin, bottom: Math.max(0, v) } })} min={0} max={100} step={1} precision={0} />
          <DragInput label="L" value={override.margin.left} onChange={(v) => setOverride({ margin: { ...override.margin, left: Math.max(0, v) } })} min={0} max={100} step={1} precision={0} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-[9px] text-slate-500 w-16">Visibility</label>
        <div className="flex gap-0.5 flex-1">
          {(['visible', 'invisible', 'gone'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setOverride({ layoutVisibility: v })}
              className={`flex-1 px-1 py-0.5 text-[8px] rounded capitalize transition-colors ${
                override.layoutVisibility === v
                  ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30'
                  : 'bg-[#122240] text-slate-500 hover:text-slate-300'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Align Self */}
      <div className="flex items-center gap-2">
        <label className="text-[9px] text-slate-500 w-16">Align Self</label>
        <div className="flex gap-0.5 flex-1">
          {(['start', 'center', 'end', 'stretch'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setOverride({ alignSelf: override.alignSelf === v ? undefined : v })}
              className={`flex-1 px-1 py-0.5 text-[8px] rounded capitalize transition-colors ${
                override.alignSelf === v
                  ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30'
                  : 'bg-[#122240] text-slate-500 hover:text-slate-300'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Subcomponents ───

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-[9px] text-slate-500 uppercase tracking-wider px-1">{label}</span>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function SizeControl({ label, value, onChange }: {
  label: string;
  value: { type: string; value?: number; fraction?: number };
  onChange: (v: { type: 'fixed'; value: number } | { type: 'wrapContent' } | { type: 'fillParent'; fraction?: number }) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[9px] text-slate-500 w-10">{label}</span>
      <div className="flex gap-0.5 flex-1">
        <button
          onClick={() => onChange({ type: 'fixed', value: value.type === 'fixed' ? (value.value ?? 200) : 200 })}
          className={`px-1.5 py-0.5 text-[8px] rounded transition-colors ${
            value.type === 'fixed' ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30' : 'bg-[#122240] text-slate-500 hover:text-slate-300'
          }`}
        >
          Fixed
        </button>
        <button
          onClick={() => onChange({ type: 'wrapContent' })}
          className={`px-1.5 py-0.5 text-[8px] rounded transition-colors ${
            value.type === 'wrapContent' ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30' : 'bg-[#122240] text-slate-500 hover:text-slate-300'
          }`}
        >
          Wrap
        </button>
        <button
          onClick={() => onChange({ type: 'fillParent' })}
          className={`px-1.5 py-0.5 text-[8px] rounded transition-colors ${
            value.type === 'fillParent' ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30' : 'bg-[#122240] text-slate-500 hover:text-slate-300'
          }`}
        >
          Fill
        </button>
      </div>
      {value.type === 'fixed' && (
        <DragInput label="" value={value.value ?? 200} onChange={(v) => onChange({ type: 'fixed', value: Math.max(1, v) })} min={1} max={4000} step={1} precision={0} suffix="px" className="w-16" />
      )}
    </div>
  );
}

const MAIN_AXIS_OPTIONS = [
  { value: 'start', icon: AlignStartHorizontal, label: 'Start' },
  { value: 'center', icon: AlignCenterHorizontal, label: 'Center' },
  { value: 'end', icon: AlignEndHorizontal, label: 'End' },
  { value: 'spaceBetween', icon: Maximize2, label: 'Between' },
  { value: 'spaceAround', icon: Minus, label: 'Around' },
  { value: 'spaceEvenly', icon: Minus, label: 'Evenly' },
];

const CROSS_AXIS_OPTIONS = [
  { value: 'start', icon: AlignStartVertical, label: 'Start' },
  { value: 'center', icon: AlignCenterVertical, label: 'Center' },
  { value: 'end', icon: AlignEndVertical, label: 'End' },
  { value: 'stretch', icon: Maximize2, label: 'Stretch' },
];

function AlignmentPicker({ options, value, onChange }: {
  options: { value: string; icon: any; label: string }[];
  value: string;
  onChange: (v: string) => void;
  isHorizontal: boolean;
}) {
  return (
    <div className="flex gap-0.5">
      {options.map((opt) => {
        const Icon = opt.icon;
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex-1 flex flex-col items-center gap-0.5 px-1 py-1 rounded transition-colors ${
              isActive
                ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30'
                : 'bg-[#0c1018] text-slate-500 hover:text-slate-300 hover:bg-[#122240]'
            }`}
            title={opt.label}
          >
            <Icon size={12} />
            <span className="text-[7px]">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ChildrenList({ layer }: { layer: LayoutObjectLayer }) {
  const composition = useEditorStore((s) => s.composition);
  const removeChildFromLayout = useEditorStore((s) => s.removeChildFromLayout);
  const selectLayer = useEditorStore((s) => s.selectLayer);

  if (layer.children.length === 0) {
    return (
      <div className="px-2 py-3 text-center text-[10px] text-slate-500 border border-dashed border-[#1c3155] rounded">
        No children. Drag layers here or use "Add to Layout" in context menu.
      </div>
    );
  }

  return (
    <div className="rounded border border-[#1c3155] bg-[#0d1f38] overflow-hidden max-h-[200px] overflow-y-auto">
      {layer.children.map((childId, idx) => {
        const child = composition.layers.find((l) => l.id === childId);
        if (!child) return null;
        return (
          <div
            key={childId}
            className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[#1c3155] last:border-b-0 hover:bg-[#162a4a] cursor-pointer transition-colors"
            onClick={() => selectLayer(childId, false, 'inspector')}
          >
            <GripVertical size={9} className="text-slate-600" />
            <span className="flex-1 text-[10px] text-slate-300 truncate">{child.name}</span>
            <span className="text-[8px] text-slate-600 capitalize">{child.type}</span>
            <button
              onClick={(e) => { e.stopPropagation(); removeChildFromLayout(layer.id, childId); }}
              className="p-0.5 rounded hover:bg-red-500/20 text-slate-600 hover:text-red-400 transition-colors"
            >
              <Trash2 size={9} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
