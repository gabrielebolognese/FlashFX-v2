import {
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
  Monitor, X,
} from 'lucide-react';
import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import { computeAlignment, computeDistribution, computeCenterToCanvas, type AlignAxis, type DistributeMode } from '../../core/align';

/**
 * Top-bar "Object → Align" popover. Reuses the existing alignment engine
 * (core/align, also used by the MultiSelect inspector) and applies the results
 * through `applyAlignResults`. Align axes are relative to the selection's
 * bounding box; "Center to Canvas" is relative to the composition.
 */
export function AlignPanel({ onClose }: { onClose: () => void }) {
  const composition = useEditorStore((s) => s.composition);
  const selection = useEditorStore((s) => s.selection);
  const applyAlignResults = useEditorStore((s) => s.applyAlignResults);

  const layers = composition.layers.filter((l) => selection.selectedIds.includes(l.id));
  const { width, height } = composition.settings;
  const canAlign = layers.length >= 1;
  const canDistribute = layers.length >= 3;

  const align = (axis: AlignAxis, label: string) => {
    const frame = useTimelineStore.getState().currentFrame;
    applyAlignResults(computeAlignment(axis, layers, frame), label);
  };
  const distribute = (mode: DistributeMode, label: string) => {
    const frame = useTimelineStore.getState().currentFrame;
    applyAlignResults(computeDistribution(mode, layers, frame), label);
  };
  const centerCanvas = () => {
    const frame = useTimelineStore.getState().currentFrame;
    applyAlignResults(computeCenterToCanvas(layers, frame, width, height), 'Center to Canvas');
  };

  const Btn = ({ icon: Icon, label, onClick, disabled }: { icon: typeof Monitor; label: string; onClick: () => void; disabled?: boolean }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${
        disabled ? 'text-slate-700 cursor-default' : 'text-slate-300 hover:bg-white/[0.06] hover:text-slate-100'
      }`}
    >
      <Icon size={15} strokeWidth={1.5} />
    </button>
  );

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute top-[52px] left-[300px] z-50 bg-[#0e1c32] border border-[#1a2a42] rounded-lg p-3 shadow-2xl">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Align &amp; Distribute</span>
          <button className="p-0.5 rounded hover:bg-white/10 text-slate-500" onClick={onClose}><X size={13} /></button>
        </div>

        {!canAlign && <div className="text-[10px] text-slate-600 py-2">Select one or more layers.</div>}

        {canAlign && (
          <div className="space-y-2">
            <div>
              <div className="text-[9px] text-slate-600 mb-1">Align (to selection)</div>
              <div className="flex gap-0.5">
                <Btn icon={AlignStartVertical} label="Align Left" onClick={() => align('left', 'Align Left')} />
                <Btn icon={AlignCenterVertical} label="Align Center" onClick={() => align('centerH', 'Align Center')} />
                <Btn icon={AlignEndVertical} label="Align Right" onClick={() => align('right', 'Align Right')} />
                <div className="w-px bg-[#1a2a42] mx-1" />
                <Btn icon={AlignStartHorizontal} label="Align Top" onClick={() => align('top', 'Align Top')} />
                <Btn icon={AlignCenterHorizontal} label="Align Middle" onClick={() => align('centerV', 'Align Middle')} />
                <Btn icon={AlignEndHorizontal} label="Align Bottom" onClick={() => align('bottom', 'Align Bottom')} />
              </div>
            </div>
            <div>
              <div className="text-[9px] text-slate-600 mb-1">Distribute {!canDistribute && '(needs 3+)'}</div>
              <div className="flex gap-0.5">
                <Btn icon={AlignHorizontalDistributeCenter} label="Distribute Horizontally" onClick={() => distribute('horizontalCenters', 'Distribute Horizontally')} disabled={!canDistribute} />
                <Btn icon={AlignVerticalDistributeCenter} label="Distribute Vertically" onClick={() => distribute('verticalCenters', 'Distribute Vertically')} disabled={!canDistribute} />
              </div>
            </div>
            <div>
              <div className="text-[9px] text-slate-600 mb-1">Canvas</div>
              <div className="flex gap-0.5">
                <Btn icon={Monitor} label="Center to Canvas" onClick={centerCanvas} />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
