import { X, RotateCcw } from 'lucide-react';
import { useEditorStore } from '../../store/editor';
import type { Vec2 } from '../../core/types';

/**
 * Top-bar "Object → Transform" dialog: numeric entry for the active layer's base
 * transform. Writes to each property's `defaultValue` (the same target the
 * Inspector's numeric transform inputs use), so it's consistent with the rest of
 * the app. Scale and opacity are shown as percentages.
 */
export function TransformDialog({ onClose }: { onClose: () => void }) {
  const composition = useEditorStore((s) => s.composition);
  const selection = useEditorStore((s) => s.selection);
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const resetTransformAll = useEditorStore((s) => s.resetTransformAll);
  const layer = composition.layers.find((l) => l.id === selection.activeId);

  const hasTransform = !!layer && 'transform' in layer && !!layer.transform;

  return (
    <>
      <div className="fixed inset-0 z-[90]" onClick={onClose} />
      <div className="fixed left-1/2 top-24 -translate-x-1/2 z-[91] w-[280px] bg-[#0e1c32] border border-[#1a2a42] rounded-lg p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-semibold text-slate-200">Transform</span>
          <button className="p-0.5 rounded hover:bg-white/10 text-slate-500" onClick={onClose}><X size={14} /></button>
        </div>

        {!hasTransform || !layer ? (
          <div className="text-[11px] text-slate-500 py-3">Select a layer to edit its transform.</div>
        ) : (() => {
          const t = layer.transform;
          const pos = t.position.defaultValue as Vec2;
          const scale = t.scale.defaultValue as Vec2;
          const rotation = t.rotation.defaultValue as number;
          const opacity = t.opacity.defaultValue as number;
          const set = (path: string, value: unknown) => updateLayerProperty(layer.id, path, value);

          return (
            <div className="space-y-2.5">
              <Pair label="Position">
                <Num value={pos[0]} onCommit={(v) => set('transform.position.defaultValue', [v, pos[1]])} suffix="X" />
                <Num value={pos[1]} onCommit={(v) => set('transform.position.defaultValue', [pos[0], v])} suffix="Y" />
              </Pair>
              <Pair label="Scale %">
                <Num value={scale[0] * 100} onCommit={(v) => set('transform.scale.defaultValue', [v / 100, scale[1]])} suffix="X" />
                <Num value={scale[1] * 100} onCommit={(v) => set('transform.scale.defaultValue', [scale[0], v / 100])} suffix="Y" />
              </Pair>
              <Pair label="Rotation">
                <Num value={rotation} onCommit={(v) => set('transform.rotation.defaultValue', v)} suffix="°" />
              </Pair>
              <Pair label="Opacity %">
                <Num value={opacity * 100} onCommit={(v) => set('transform.opacity.defaultValue', Math.max(0, Math.min(1, v / 100)))} suffix="%" />
              </Pair>

              <button
                onClick={() => resetTransformAll(layer.id)}
                className="mt-1 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] bg-[#16294a] hover:bg-[#1c3155] text-slate-300"
              >
                <RotateCcw size={12} /> Reset All
              </button>
            </div>
          );
        })()}
      </div>
    </>
  );
}

function Pair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-slate-400 flex-shrink-0">{label}</span>
      <span className="flex items-center gap-1.5">{children}</span>
    </div>
  );
}

function Num({ value, onCommit, suffix }: { value: number; onCommit: (v: number) => void; suffix?: string }) {
  return (
    <span className="flex items-center gap-0.5">
      <input
        type="number"
        defaultValue={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onCommit(v); }}
        className="w-16 bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-0.5 text-[11px] text-slate-200 text-right outline-none focus:border-[#2a4a7c]"
      />
      {suffix && <span className="text-slate-600 text-[9px] w-2.5">{suffix}</span>}
    </span>
  );
}
