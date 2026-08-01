import { useEditorStore } from '../../store/editor';
import type { LayoutContainerLayer, ContainerShapeType, ContainerDistributionMode } from '../../core/types';
import { Container, Circle, Square, Spline } from 'lucide-react';

interface Props {
  layer: LayoutContainerLayer;
}

const SHAPE_OPTIONS: { value: ContainerShapeType; label: string; icon: typeof Circle }[] = [
  { value: 'rectangle', label: 'Rectangle', icon: Square },
  { value: 'circle', label: 'Circle', icon: Circle },
  { value: 'customVector', label: 'Custom Vector', icon: Spline },
];

const DISTRIBUTION_OPTIONS: { value: ContainerDistributionMode; label: string }[] = [
  { value: 'evenDistribution', label: 'Even Distribution' },
  { value: 'border', label: 'Border' },
  { value: 'interior', label: 'Interior' },
  { value: 'center', label: 'Center' },
  { value: 'vertices', label: 'Vertices' },
];

export function LayoutContainerPanel({ layer }: Props) {
  const updateLayoutContainer = useEditorStore((s) => s.updateLayoutContainer);

  return (
    <div className="border-t border-[#1a2a42]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#0a1628]">
        <Container size={14} className="text-cyan-400" />
        <span className="text-[11px] font-medium text-slate-200 uppercase tracking-wider">
          Layout Container
        </span>
      </div>

      <div className="px-3 py-2 space-y-3">
        {/* Container Type */}
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">
            Container Type
          </label>
          <div className="flex gap-1">
            {SHAPE_OPTIONS.map((opt) => {
              const active = layer.containerShape.type === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => updateLayoutContainer(layer.id, { containerShape: { ...layer.containerShape, type: opt.value } })}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[10px] transition-colors ${
                    active
                      ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                      : 'bg-[#0d1b2a] text-slate-400 border border-[#1a2a42] hover:border-slate-500'
                  }`}
                >
                  <opt.icon size={11} />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Shape Dimensions */}
        {layer.containerShape.type === 'rectangle' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500 mb-0.5 block">Width</label>
              <input
                type="number"
                value={layer.containerShape.width}
                onChange={(e) => updateLayoutContainer(layer.id, { containerShape: { ...layer.containerShape, width: Number(e.target.value) || 100 } })}
                className="w-full bg-[#0d1b2a] border border-[#1a2a42] rounded px-2 py-1 text-[11px] text-slate-200 focus:border-cyan-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-0.5 block">Height</label>
              <input
                type="number"
                value={layer.containerShape.height}
                onChange={(e) => updateLayoutContainer(layer.id, { containerShape: { ...layer.containerShape, height: Number(e.target.value) || 100 } })}
                className="w-full bg-[#0d1b2a] border border-[#1a2a42] rounded px-2 py-1 text-[11px] text-slate-200 focus:border-cyan-500/50 focus:outline-none"
              />
            </div>
          </div>
        )}

        {layer.containerShape.type === 'circle' && (
          <div>
            <label className="text-[10px] text-slate-500 mb-0.5 block">Radius</label>
            <input
              type="number"
              value={layer.containerShape.radius}
              onChange={(e) => updateLayoutContainer(layer.id, { containerShape: { ...layer.containerShape, radius: Number(e.target.value) || 50 } })}
              className="w-full bg-[#0d1b2a] border border-[#1a2a42] rounded px-2 py-1 text-[11px] text-slate-200 focus:border-cyan-500/50 focus:outline-none"
            />
          </div>
        )}

        {layer.containerShape.type === 'customVector' && (
          <div className="bg-[#0d1b2a] border border-[#1a2a42] rounded p-2">
            <p className="text-[10px] text-slate-400">
              Uses the vector path from a connected shape layer. Assign a polygon/path layer as the source.
            </p>
            <p className="text-[10px] text-cyan-400/70 mt-1">
              {layer.containerShape.vertices.length} vertices defined
            </p>
          </div>
        )}

        {/* Distribution Mode */}
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">
            Distribution Mode
          </label>
          <select
            value={layer.distributionMode}
            onChange={(e) => updateLayoutContainer(layer.id, { distributionMode: e.target.value as ContainerDistributionMode })}
            className="w-full bg-[#0d1b2a] border border-[#1a2a42] rounded px-2 py-1.5 text-[11px] text-slate-200 focus:border-cyan-500/50 focus:outline-none"
          >
            {DISTRIBUTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Spacing & Padding */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-slate-500 mb-0.5 block">Spacing</label>
            <input
              type="number"
              value={layer.spacing}
              onChange={(e) => updateLayoutContainer(layer.id, { spacing: Number(e.target.value) || 0 })}
              className="w-full bg-[#0d1b2a] border border-[#1a2a42] rounded px-2 py-1 text-[11px] text-slate-200 focus:border-cyan-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 mb-0.5 block">Padding</label>
            <input
              type="number"
              value={layer.padding}
              onChange={(e) => updateLayoutContainer(layer.id, { padding: Number(e.target.value) || 0 })}
              className="w-full bg-[#0d1b2a] border border-[#1a2a42] rounded px-2 py-1 text-[11px] text-slate-200 focus:border-cyan-500/50 focus:outline-none"
            />
          </div>
        </div>

        {/* Rotation Offset */}
        <div>
          <label className="text-[10px] text-slate-500 mb-0.5 block">Rotation Offset</label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={layer.rotationOffset}
              onChange={(e) => updateLayoutContainer(layer.id, { rotationOffset: Number(e.target.value) })}
              className="flex-1 h-1 accent-cyan-500"
            />
            <input
              type="number"
              value={layer.rotationOffset}
              onChange={(e) => updateLayoutContainer(layer.id, { rotationOffset: Number(e.target.value) || 0 })}
              className="w-14 bg-[#0d1b2a] border border-[#1a2a42] rounded px-2 py-1 text-[11px] text-slate-200 text-right focus:border-cyan-500/50 focus:outline-none"
            />
          </div>
        </div>

        {/* Follow Path Rotation */}
        <button
          onClick={() => updateLayoutContainer(layer.id, { followPathRotation: !layer.followPathRotation })}
          className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-[10px] transition-colors border ${
            layer.followPathRotation
              ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
              : 'bg-[#0d1b2a] text-slate-400 border-[#1a2a42] hover:border-slate-500'
          }`}
          title="Rotate children to follow the container path's local tangent"
        >
          <span>Follow Path Rotation</span>
          <span className={`w-7 h-3.5 rounded-full relative transition-colors ${layer.followPathRotation ? 'bg-cyan-500/50' : 'bg-[#1a2a42]'}`}>
            <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all ${layer.followPathRotation ? 'left-4' : 'left-0.5'}`} />
          </span>
        </button>

        {/* Children count */}
        <div className="bg-[#0d1b2a] border border-[#1a2a42] rounded p-2 flex items-center justify-between">
          <span className="text-[10px] text-slate-400">Children</span>
          <span className="text-[11px] text-slate-200 font-mono">{layer.children.length}</span>
        </div>
      </div>
    </div>
  );
}
