import { useState, useMemo, useCallback } from 'react';
import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import type { StaggerDirectionMode, StaggerCurveProfile, StaggerGroupExpansion, Layer } from '../../core/types';
import { resolveStaggerTargets } from '../../stagger/resolver';
import { sortByDirection } from '../../stagger/sorting';
import { computeStaggerOffsets } from '../../stagger/timing';
import type { StaggerConfig, BoundingBox } from '../../stagger/types';
import { DEFAULT_STAGGER_CONFIG } from '../../stagger/types';
import { evaluateVec2, evaluateNumber } from '../../core/interpolation';
import { Layers, ArrowRight, ArrowDown, Target, Shuffle, Grid3x3, RotateCcw, Zap } from 'lucide-react';

const DIRECTION_OPTIONS: { value: StaggerDirectionMode; label: string; icon?: React.ReactNode }[] = [
  { value: 'spatialLeftToRight', label: 'Left to Right', icon: <ArrowRight size={10} /> },
  { value: 'spatialRightToLeft', label: 'Right to Left' },
  { value: 'spatialTopToBottom', label: 'Top to Bottom', icon: <ArrowDown size={10} /> },
  { value: 'spatialBottomToTop', label: 'Bottom to Top' },
  { value: 'radialOutward', label: 'Radial Outward', icon: <Target size={10} /> },
  { value: 'radialInward', label: 'Radial Inward' },
  { value: 'gridSnake', label: 'Grid Snake', icon: <Grid3x3 size={10} /> },
  { value: 'layerStackOrder', label: 'Layer Stack Order', icon: <Layers size={10} /> },
  { value: 'selectionClickOrder', label: 'Selection Order' },
  { value: 'randomChaos', label: 'Random', icon: <Shuffle size={10} /> },
];

const CURVE_OPTIONS: { value: StaggerCurveProfile; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'easeIn', label: 'Ease In' },
  { value: 'easeOut', label: 'Ease Out' },
  { value: 'easeInOut', label: 'Ease In-Out' },
  { value: 'elasticSpring', label: 'Elastic' },
];

const EXPANSION_OPTIONS: { value: StaggerGroupExpansion; label: string }[] = [
  { value: 'treatGroupsAsAtomicUnits', label: 'Groups as units' },
  { value: 'expandIntoChildren', label: 'Expand children' },
  { value: 'expandRecursively', label: 'Expand all leaves' },
];

function getLayerBounds(layer: Layer, frame: number): BoundingBox {
  const pos = evaluateVec2(layer.transform.position, frame);
  const scale = evaluateVec2(layer.transform.scale, frame);
  let w = 100;
  let h = 100;
  if (layer.type === 'shape') {
    const shape = layer.shape;
    if (shape.type === 'rectangle') {
      w = evaluateNumber(shape.width, frame);
      h = evaluateNumber(shape.height, frame);
    } else if (shape.type === 'circle') {
      const r = evaluateNumber(shape.radius, frame);
      w = r * 2;
      h = r * 2;
    } else if (shape.type === 'star') {
      const r = evaluateNumber(shape.outerRadius, frame);
      w = r * 2;
      h = r * 2;
    }
  }
  return {
    centerX: pos[0],
    centerY: pos[1],
    width: w * scale[0],
    height: h * scale[1],
  };
}

export function StaggerPanel() {
  const composition = useEditorStore((s) => s.composition);
  const selection = useEditorStore((s) => s.selection);
  const addStaggerBinding = useEditorStore((s) => s.addStaggerBinding);
  const applyStaggerOffsets = useEditorStore((s) => s.applyStaggerOffsets);
  const currentFrame = useTimelineStore((s) => s.currentFrame);

  const [config, setConfig] = useState<StaggerConfig>({ ...DEFAULT_STAGGER_CONFIG });

  const selectedIds = selection.selectedIds;
  const layers = composition.layers;

  const resolvedTargets = useMemo(() => {
    return resolveStaggerTargets(selectedIds, layers, config.groupExpansion);
  }, [selectedIds, layers, config.groupExpansion]);

  const getBounds = useCallback((id: string): BoundingBox => {
    const layer = layers.find((l) => l.id === id);
    if (!layer) return { centerX: 0, centerY: 0, width: 100, height: 100 };
    return getLayerBounds(layer, currentFrame);
  }, [layers, currentFrame]);

  const layerStackOrder = useMemo(() => layers.map((l) => l.id), [layers]);

  const sortedTargets = useMemo(() => {
    if (resolvedTargets.length === 0) return [];
    return sortByDirection(resolvedTargets, config, getBounds, layerStackOrder);
  }, [resolvedTargets, config, getBounds, layerStackOrder]);

  const offsets = useMemo(() => {
    if (sortedTargets.length === 0) return new Map<string, number>();
    return computeStaggerOffsets(sortedTargets, config);
  }, [sortedTargets, config]);

  const totalSpanFrames = useMemo(() => {
    let max = 0;
    for (const v of offsets.values()) {
      if (v > max) max = v;
    }
    return max;
  }, [offsets]);

  const handleApply = () => {
    if (offsets.size === 0) return;
    const bindingId = `stagger_${Date.now()}`;
    const bindingDef = {
      id: bindingId,
      targetLayerIds: sortedTargets,
      directionMode: config.directionMode,
      invertOrder: config.invertOrder,
      gapFrames: config.gapFrames,
      totalDurationLock: config.totalDurationLock,
      curveProfile: config.curveProfile,
      curveIntensity: config.curveIntensity,
      randomSeed: config.randomSeed,
      groupExpansion: config.groupExpansion,
      liveReindexing: config.liveReindexing,
      rowToleranceFraction: config.rowToleranceFraction,
      radialCenterMode: config.radialCenterMode,
      radialMasterLayerId: config.radialMasterLayerId,
    };
    addStaggerBinding(sortedTargets, bindingDef);
    applyStaggerOffsets(bindingId, offsets);
  };

  const handleReroll = () => {
    setConfig({ ...config, randomSeed: Math.floor(Math.random() * 100000) });
  };

  return (
    <div className="px-2 py-2 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium text-slate-300 flex items-center gap-1.5">
          <Layers size={12} className="text-amber-400" />
          Smart Stagger
        </h3>
        <span className="text-[9px] text-slate-600">
          {resolvedTargets.length} item{resolvedTargets.length !== 1 ? 's' : ''}
        </span>
      </div>

      {selectedIds.length < 2 && (
        <div className="text-[10px] text-slate-600 text-center py-3">
          Select 2 or more layers to apply stagger timing. Use Shift+Click or marquee select.
        </div>
      )}

      {selectedIds.length >= 2 && (
        <div className="space-y-2.5">
          {/* Direction Mode */}
          <div>
            <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Direction</div>
            <select
              value={config.directionMode}
              onChange={(e) => setConfig({ ...config, directionMode: e.target.value as StaggerDirectionMode })}
              className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-1 text-[10px] text-slate-300"
            >
              {DIRECTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <label className="flex items-center gap-1 text-[9px] text-slate-500 mt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={config.invertOrder}
                onChange={(e) => setConfig({ ...config, invertOrder: e.target.checked })}
                className="w-3 h-3 rounded"
              />
              Invert order
            </label>
            {config.directionMode === 'randomChaos' && (
              <button onClick={handleReroll} className="mt-1 text-[9px] text-amber-400 hover:text-amber-300 flex items-center gap-0.5">
                <RotateCcw size={9} /> Reroll
              </button>
            )}
          </div>

          {/* Timing */}
          <div>
            <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Timing</div>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="text-[9px] text-slate-500">
                Gap (frames)
                <input
                  type="number"
                  value={config.gapFrames}
                  min={0}
                  step={1}
                  disabled={config.totalDurationLock.enabled}
                  onChange={(e) => setConfig({ ...config, gapFrames: Math.max(0, +e.target.value) })}
                  className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5 disabled:opacity-40"
                />
              </label>
              <label className="text-[9px] text-slate-500">
                Total span
                <input
                  type="number"
                  value={config.totalDurationLock.enabled ? config.totalDurationLock.totalFrames : totalSpanFrames}
                  min={1}
                  step={1}
                  onChange={(e) => setConfig({ ...config, totalDurationLock: { enabled: true, totalFrames: Math.max(1, +e.target.value) } })}
                  className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
                />
              </label>
            </div>
            <label className="flex items-center gap-1 text-[9px] text-slate-500 mt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={config.totalDurationLock.enabled}
                onChange={(e) => setConfig({ ...config, totalDurationLock: { ...config.totalDurationLock, enabled: e.target.checked } })}
                className="w-3 h-3 rounded"
              />
              Lock total duration
            </label>
          </div>

          {/* Curve */}
          <div>
            <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Easing Curve</div>
            <select
              value={config.curveProfile}
              onChange={(e) => setConfig({ ...config, curveProfile: e.target.value as StaggerCurveProfile })}
              className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-1 text-[10px] text-slate-300"
            >
              {CURVE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {config.curveProfile !== 'linear' && (
              <label className="text-[9px] text-slate-500 mt-1 block">
                Intensity: {config.curveIntensity}%
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={config.curveIntensity}
                  onChange={(e) => setConfig({ ...config, curveIntensity: +e.target.value })}
                  className="w-full h-1 mt-0.5"
                />
              </label>
            )}
          </div>

          {/* Group Expansion */}
          <div>
            <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Group Handling</div>
            <select
              value={config.groupExpansion}
              onChange={(e) => setConfig({ ...config, groupExpansion: e.target.value as StaggerGroupExpansion })}
              className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-1 text-[10px] text-slate-300"
            >
              {EXPANSION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Advanced */}
          {config.directionMode === 'gridSnake' && (
            <div>
              <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Grid Detection</div>
              <label className="text-[9px] text-slate-500">
                Row tolerance: {(config.rowToleranceFraction * 100).toFixed(0)}%
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={config.rowToleranceFraction * 100}
                  onChange={(e) => setConfig({ ...config, rowToleranceFraction: +e.target.value / 100 })}
                  className="w-full h-1 mt-0.5"
                />
              </label>
            </div>
          )}

          {/* Live Reindexing */}
          <label className="flex items-center gap-1.5 text-[9px] text-slate-500 cursor-pointer">
            <input
              type="checkbox"
              checked={config.liveReindexing}
              onChange={(e) => setConfig({ ...config, liveReindexing: e.target.checked })}
              className="w-3 h-3 rounded"
            />
            Live spatial re-indexing
          </label>

          {/* Preview */}
          {sortedTargets.length > 0 && (
            <div className="bg-[#0a1628] border border-[#1a2a42] rounded p-2">
              <div className="text-[9px] text-slate-500 mb-1">Order Preview</div>
              <div className="flex flex-wrap gap-0.5">
                {sortedTargets.slice(0, 20).map((id, idx) => {
                  const layer = layers.find((l) => l.id === id);
                  const offset = offsets.get(id) ?? 0;
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-0.5 bg-[#081220] rounded px-1 py-0.5"
                      title={`${layer?.name ?? id} (offset: ${offset}f)`}
                    >
                      <span className="text-[8px] text-amber-400 font-mono">{idx + 1}</span>
                      <span className="text-[8px] text-slate-400 truncate max-w-[50px]">{layer?.name ?? '?'}</span>
                      <span className="text-[8px] text-slate-600">+{offset}f</span>
                    </div>
                  );
                })}
                {sortedTargets.length > 20 && (
                  <span className="text-[8px] text-slate-600">+{sortedTargets.length - 20} more</span>
                )}
              </div>
            </div>
          )}

          {/* Apply */}
          <button
            onClick={handleApply}
            disabled={offsets.size === 0}
            className="w-full py-1.5 bg-amber-500/10 text-amber-400 rounded text-[10px] font-medium hover:bg-amber-500/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1"
          >
            <Zap size={10} /> Apply Stagger ({totalSpanFrames}f total)
          </button>
        </div>
      )}
    </div>
  );
}
