import { useState } from 'react';
import { useEditorStore } from '../../store/editor';
import type { AnchorEdge, AnchorPropertyType, AnchorTransferType, AnchorPhysicsType, AnchorTemporalGateType } from '../../core/types';
import { Link2, Unlink, Plus, ChevronDown, ChevronRight, Zap, Clock, Activity } from 'lucide-react';

const EMPTY_EDGES: AnchorEdge[] = [];

const PROPERTY_OPTIONS: { value: AnchorPropertyType; label: string }[] = [
  { value: 'positionX', label: 'Position X' },
  { value: 'positionY', label: 'Position Y' },
  { value: 'rotation', label: 'Rotation' },
  { value: 'scaleX', label: 'Scale X' },
  { value: 'scaleY', label: 'Scale Y' },
  { value: 'opacity', label: 'Opacity' },
];

const TRANSFER_OPTIONS: { value: AnchorTransferType; label: string }[] = [
  { value: 'direct', label: 'Direct' },
  { value: 'mirror', label: 'Mirror' },
  { value: 'scale', label: 'Scale' },
  { value: 'remap', label: 'Remap' },
];

const PHYSICS_OPTIONS: { value: AnchorPhysicsType | 'none'; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'spring', label: 'Spring' },
  { value: 'rope', label: 'Rope' },
  { value: 'magnetic', label: 'Magnetic' },
];

const TEMPORAL_OPTIONS: { value: AnchorTemporalGateType | 'none'; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'doAfter', label: 'Do After' },
  { value: 'doWhile', label: 'Do While' },
  { value: 'doUntil', label: 'Do Until' },
  { value: 'doFasterSlower', label: 'Speed Factor' },
];

function EdgeItem({ edge }: { edge: AnchorEdge }) {
  const [expanded, setExpanded] = useState(false);
  const layers = useEditorStore((s) => s.composition.layers);
  const updateAnchorEdge = useEditorStore((s) => s.updateAnchorEdge);
  const removeAnchorEdge = useEditorStore((s) => s.removeAnchorEdge);

  const sourceName = layers.find((l) => l.id === edge.sourceLayerId)?.name ?? 'Unknown';
  const targetName = layers.find((l) => l.id === edge.targetLayerId)?.name ?? 'Unknown';

  return (
    <div className="border border-[#1a2a42] rounded-md overflow-hidden">
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 bg-[#0a1628] cursor-pointer hover:bg-[#0d1d35]"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Link2 size={12} className="text-cyan-400" />
        <span className="text-[11px] text-slate-300 truncate flex-1">
          {sourceName} → {targetName}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); updateAnchorEdge(edge.id, { enabled: !edge.enabled }); }}
          className={`w-4 h-4 rounded flex items-center justify-center ${edge.enabled ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-700/40 text-slate-500'}`}
        >
          <Zap size={9} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); removeAnchorEdge(edge.id); }}
          className="w-4 h-4 rounded flex items-center justify-center hover:bg-red-500/20 text-slate-500 hover:text-red-400"
        >
          <Unlink size={9} />
        </button>
      </div>

      {expanded && (
        <div className="px-2 py-2 space-y-2 bg-[#060f1c]">
          {/* Mappings */}
          <div className="space-y-1.5">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Mappings</div>
            {edge.mappings.map((mapping, idx) => (
              <div key={idx} className="flex items-center gap-1 text-[10px]">
                <select
                  value={mapping.sourceProperty}
                  onChange={(e) => {
                    const newMappings = [...edge.mappings];
                    newMappings[idx] = { ...mapping, sourceProperty: e.target.value as AnchorPropertyType };
                    updateAnchorEdge(edge.id, { mappings: newMappings });
                  }}
                  className="bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-slate-300 flex-1"
                >
                  {PROPERTY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <span className="text-slate-600">→</span>
                <select
                  value={mapping.targetProperty}
                  onChange={(e) => {
                    const newMappings = [...edge.mappings];
                    newMappings[idx] = { ...mapping, targetProperty: e.target.value as AnchorPropertyType };
                    updateAnchorEdge(edge.id, { mappings: newMappings });
                  }}
                  className="bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-slate-300 flex-1"
                >
                  {PROPERTY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select
                  value={mapping.transfer.type}
                  onChange={(e) => {
                    const newMappings = [...edge.mappings];
                    newMappings[idx] = { ...mapping, transfer: { ...mapping.transfer, type: e.target.value as AnchorTransferType } };
                    updateAnchorEdge(edge.id, { mappings: newMappings });
                  }}
                  className="bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-slate-300 w-14"
                >
                  {TRANSFER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button
                  onClick={() => {
                    const newMappings = edge.mappings.filter((_, i) => i !== idx);
                    updateAnchorEdge(edge.id, { mappings: newMappings });
                  }}
                  className="text-slate-600 hover:text-red-400"
                >
                  x
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                const newMapping = {
                  sourceProperty: 'positionX' as AnchorPropertyType,
                  targetProperty: 'positionX' as AnchorPropertyType,
                  transfer: { type: 'direct' as AnchorTransferType, scale: 1, offset: 0, clampMin: -Infinity, clampMax: Infinity },
                };
                updateAnchorEdge(edge.id, { mappings: [...edge.mappings, newMapping] });
              }}
              className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5"
            >
              <Plus size={9} /> Add Mapping
            </button>
          </div>

          {/* Physics */}
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Activity size={10} className="text-slate-500" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Physics</span>
            </div>
            <select
              value={edge.physics?.type ?? 'none'}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'none') {
                  updateAnchorEdge(edge.id, { physics: undefined });
                } else {
                  const type = val as AnchorPhysicsType;
                  const physics = {
                    type,
                    ...(type === 'spring' ? { spring: { stiffness: 180, damping: 12, mass: 1 } } : {}),
                    ...(type === 'rope' ? { rope: { length: 100, stiffness: 200, gravity: 0 } } : {}),
                    ...(type === 'magnetic' ? { magnetic: { strength: 1, falloff: 2, maxDistance: 500 } } : {}),
                  };
                  updateAnchorEdge(edge.id, { physics });
                }
              }}
              className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-0.5 text-[10px] text-slate-300"
            >
              {PHYSICS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {edge.physics?.type === 'spring' && edge.physics.spring && (
              <div className="grid grid-cols-3 gap-1">
                <label className="text-[9px] text-slate-500">
                  Stiff
                  <input type="number" value={edge.physics.spring.stiffness}
                    onChange={(e) => updateAnchorEdge(edge.id, { physics: { ...edge.physics!, spring: { ...edge.physics!.spring!, stiffness: +e.target.value } } })}
                    className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
                  />
                </label>
                <label className="text-[9px] text-slate-500">
                  Damp
                  <input type="number" value={edge.physics.spring.damping}
                    onChange={(e) => updateAnchorEdge(edge.id, { physics: { ...edge.physics!, spring: { ...edge.physics!.spring!, damping: +e.target.value } } })}
                    className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
                  />
                </label>
                <label className="text-[9px] text-slate-500">
                  Mass
                  <input type="number" value={edge.physics.spring.mass}
                    onChange={(e) => updateAnchorEdge(edge.id, { physics: { ...edge.physics!, spring: { ...edge.physics!.spring!, mass: +e.target.value } } })}
                    className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
                  />
                </label>
              </div>
            )}
            {edge.physics?.type === 'rope' && edge.physics.rope && (
              <div className="grid grid-cols-3 gap-1">
                <label className="text-[9px] text-slate-500">
                  Length
                  <input type="number" value={edge.physics.rope.length}
                    onChange={(e) => updateAnchorEdge(edge.id, { physics: { ...edge.physics!, rope: { ...edge.physics!.rope!, length: +e.target.value } } })}
                    className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
                  />
                </label>
                <label className="text-[9px] text-slate-500">
                  Stiff
                  <input type="number" value={edge.physics.rope.stiffness}
                    onChange={(e) => updateAnchorEdge(edge.id, { physics: { ...edge.physics!, rope: { ...edge.physics!.rope!, stiffness: +e.target.value } } })}
                    className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
                  />
                </label>
                <label className="text-[9px] text-slate-500">
                  Gravity
                  <input type="number" value={edge.physics.rope.gravity}
                    onChange={(e) => updateAnchorEdge(edge.id, { physics: { ...edge.physics!, rope: { ...edge.physics!.rope!, gravity: +e.target.value } } })}
                    className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
                  />
                </label>
              </div>
            )}
            {edge.physics?.type === 'magnetic' && edge.physics.magnetic && (
              <div className="grid grid-cols-3 gap-1">
                <label className="text-[9px] text-slate-500">
                  Strength
                  <input type="number" value={edge.physics.magnetic.strength} step={0.1}
                    onChange={(e) => updateAnchorEdge(edge.id, { physics: { ...edge.physics!, magnetic: { ...edge.physics!.magnetic!, strength: +e.target.value } } })}
                    className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
                  />
                </label>
                <label className="text-[9px] text-slate-500">
                  Falloff
                  <input type="number" value={edge.physics.magnetic.falloff} step={0.1}
                    onChange={(e) => updateAnchorEdge(edge.id, { physics: { ...edge.physics!, magnetic: { ...edge.physics!.magnetic!, falloff: +e.target.value } } })}
                    className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
                  />
                </label>
                <label className="text-[9px] text-slate-500">
                  MaxDist
                  <input type="number" value={edge.physics.magnetic.maxDistance}
                    onChange={(e) => updateAnchorEdge(edge.id, { physics: { ...edge.physics!, magnetic: { ...edge.physics!.magnetic!, maxDistance: +e.target.value } } })}
                    className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Temporal Gate */}
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Clock size={10} className="text-slate-500" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Temporal</span>
            </div>
            <select
              value={edge.temporal?.type ?? 'none'}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'none') {
                  updateAnchorEdge(edge.id, { temporal: undefined });
                } else {
                  const type = val as AnchorTemporalGateType;
                  const temporal = {
                    type,
                    ...(type === 'doAfter' ? { delayFrames: 10 } : {}),
                    ...(type === 'doFasterSlower' ? { speedFactor: 1.5 } : {}),
                    ...(type === 'doWhile' || type === 'doUntil' ? { triggerProperty: 'opacity' as const, threshold: 0.5 } : {}),
                  };
                  updateAnchorEdge(edge.id, { temporal });
                }
              }}
              className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-0.5 text-[10px] text-slate-300"
            >
              {TEMPORAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {edge.temporal?.type === 'doAfter' && (
              <label className="text-[9px] text-slate-500 block">
                Delay (frames)
                <input type="number" value={edge.temporal.delayFrames ?? 0}
                  onChange={(e) => updateAnchorEdge(edge.id, { temporal: { ...edge.temporal!, delayFrames: +e.target.value } })}
                  className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
                />
              </label>
            )}
            {edge.temporal?.type === 'doFasterSlower' && (
              <label className="text-[9px] text-slate-500 block">
                Speed Factor
                <input type="number" value={edge.temporal.speedFactor ?? 1} step={0.1}
                  onChange={(e) => updateAnchorEdge(edge.id, { temporal: { ...edge.temporal!, speedFactor: +e.target.value } })}
                  className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
                />
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AnchoringPanel() {
  const layers = useEditorStore((s) => s.composition.layers);
  const anchorEdges = useEditorStore((s) => s.composition.anchorEdges) ?? EMPTY_EDGES;
  const selectedIds = useEditorStore((s) => s.selection.selectedIds);
  const addAnchorEdge = useEditorStore((s) => s.addAnchorEdge);

  const [targetLayerId, setTargetLayerId] = useState<string>('');
  const activeLayerId = selectedIds[0] ?? null;

  const availableTargets = layers.filter(
    (l) => l.id !== activeLayerId && l.type !== 'group' && l.type !== 'audio'
  );

  const relevantEdges = anchorEdges.filter(
    (e) => e.sourceLayerId === activeLayerId || e.targetLayerId === activeLayerId
  );

  return (
    <div className="px-2 py-2 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium text-slate-300 flex items-center gap-1.5">
          <Link2 size={12} className="text-cyan-400" />
          Anchoring
        </h3>
        <span className="text-[9px] text-slate-600">{relevantEdges.length} edge{relevantEdges.length !== 1 ? 's' : ''}</span>
      </div>

      {activeLayerId && (
        <div className="flex items-center gap-1">
          <select
            value={targetLayerId}
            onChange={(e) => setTargetLayerId(e.target.value)}
            className="flex-1 bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-1 text-[10px] text-slate-300"
          >
            <option value="">Select target...</option>
            {availableTargets.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <button
            onClick={() => {
              if (activeLayerId && targetLayerId) {
                addAnchorEdge(activeLayerId, targetLayerId);
                setTargetLayerId('');
              }
            }}
            disabled={!targetLayerId}
            className="px-1.5 py-1 bg-cyan-500/10 text-cyan-400 rounded text-[10px] hover:bg-cyan-500/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-0.5"
          >
            <Plus size={9} /> Link
          </button>
        </div>
      )}

      {relevantEdges.length === 0 && (
        <div className="text-[10px] text-slate-600 text-center py-3">
          No anchor edges. Select a layer and link it to another to create dependency constraints.
        </div>
      )}

      <div className="space-y-1.5">
        {relevantEdges.map((edge) => (
          <EdgeItem key={edge.id} edge={edge} />
        ))}
      </div>
    </div>
  );
}
