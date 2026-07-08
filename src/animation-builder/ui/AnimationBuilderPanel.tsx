import { useCallback, useMemo } from 'react';
import { useAnimationBuilderStore } from '../store';
import { useEditorStore } from '../../store/editor';
import { BuilderCanvas } from './FlowchartCanvas';
import { BlockInspector } from './BlockInspector';
import { BuilderBlockToolbar } from './BuilderBlockToolbar';
import {
  Plus, Trash2, Copy, Play, Link, Unlink
} from 'lucide-react';

export function AnimationBuilderWorkspace() {
  const flowCharts = useAnimationBuilderStore((s) => s.flowCharts);
  const activeChartId = useAnimationBuilderStore((s) => s.activeChartId);
  const setActiveChart = useAnimationBuilderStore((s) => s.setActiveChart);
  const createChart = useAnimationBuilderStore((s) => s.createChart);
  const deleteChart = useAnimationBuilderStore((s) => s.deleteChart);
  const duplicateChart = useAnimationBuilderStore((s) => s.duplicateChart);
  const setChartMode = useAnimationBuilderStore((s) => s.setChartMode);
  const compileAndApply = useAnimationBuilderStore((s) => s.compileAndApply);
  const compiledOutputs = useAnimationBuilderStore((s) => s.compiledOutputs);

  const selection = useEditorStore((s) => s.selection);
  const composition = useEditorStore((s) => s.composition);

  const activeLayer = selection.activeId
    ? composition.layers.find((l) => l.id === selection.activeId)
    : null;

  const activeChart = flowCharts.find((c) => c.id === activeChartId);
  const chartOutput = activeChartId ? compiledOutputs.get(activeChartId) : null;

  const layerCharts = useMemo(() => {
    if (!activeLayer) return [];
    return flowCharts.filter((c) => c.layerId === activeLayer.id);
  }, [flowCharts, activeLayer]);

  const handleCreate = useCallback(() => {
    if (!activeLayer) return;
    createChart(activeLayer.id);
  }, [activeLayer, createChart]);

  const handleDelete = useCallback(() => {
    if (!activeChartId) return;
    deleteChart(activeChartId);
  }, [activeChartId, deleteChart]);

  const handleDuplicate = useCallback(() => {
    if (!activeChartId) return;
    duplicateChart(activeChartId);
  }, [activeChartId, duplicateChart]);

  const handleToggleMode = useCallback(() => {
    if (!activeChart) return;
    setChartMode(activeChart.id, activeChart.mode === 'live' ? 'baked' : 'live');
  }, [activeChart, setChartMode]);

  const handleCompile = useCallback(() => {
    if (!activeChartId) return;
    compileAndApply(activeChartId);
  }, [activeChartId, compileAndApply]);

  return (
    <div className="flex flex-col h-full bg-[#0e1015]">
      {/* Compact header */}
      <div className="h-[30px] min-h-[30px] flex items-center px-2 gap-1 border-b border-[#1c3155] bg-[#0c0e14]">
        <select
          value={activeChartId ?? ''}
          onChange={(e) => setActiveChart(e.target.value || null)}
          className="bg-[#16294a] border border-[#243a5c] rounded px-1.5 py-0.5 text-[9px] text-slate-300 outline-none max-w-[120px]"
        >
          <option value="">{activeLayer ? 'Select Flow...' : 'No layer selected'}</option>
          {layerCharts.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <button onClick={handleCreate} disabled={!activeLayer}
          className="p-0.5 rounded hover:bg-[#1c3155] text-slate-600 hover:text-[#f7b500] transition-colors disabled:opacity-25" title="New Flow">
          <Plus size={11} />
        </button>
        <button onClick={handleDuplicate} disabled={!activeChartId}
          className="p-0.5 rounded hover:bg-[#1c3155] text-slate-600 hover:text-[#f7b500] transition-colors disabled:opacity-25" title="Duplicate">
          <Copy size={10} />
        </button>
        <button onClick={handleDelete} disabled={!activeChartId}
          className="p-0.5 rounded hover:bg-[#1c3155] text-slate-600 hover:text-red-400 transition-colors disabled:opacity-25" title="Delete">
          <Trash2 size={10} />
        </button>

        <div className="w-px h-3 bg-[#1c3155]" />

        {activeChart && (
          <button onClick={handleToggleMode}
            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] border transition-colors ${
              activeChart.mode === 'live'
                ? 'bg-emerald-500/8 border-emerald-500/20 text-emerald-400'
                : 'bg-[#16294a] border-[#243a5c] text-slate-600'
            }`}>
            {activeChart.mode === 'live' ? <Link size={8} /> : <Unlink size={8} />}
            {activeChart.mode === 'live' ? 'Live' : 'Baked'}
          </button>
        )}
        {activeChart?.mode === 'baked' && (
          <button onClick={handleCompile}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] bg-[#f7b500]/8 border border-[#f7b500]/15 text-[#f7b500] hover:bg-[#f7b500]/10 transition-colors">
            <Play size={8} />
            Compile
          </button>
        )}

        <div className="flex-1" />

        {chartOutput && (
          <span className="text-[8px] text-slate-600 font-mono">
            {chartOutput.keyframes.length}kf {chartOutput.errors.length > 0 && <span className="text-red-400">{chartOutput.errors.length}err</span>}
          </span>
        )}
      </div>

      {/* Block toolbar */}
      <BuilderBlockToolbar />

      {/* Chart area - 75% */}
      <div className="flex-1 min-h-0" style={{ height: '75%' }}>
        <BuilderCanvas />
      </div>

      {/* Block Properties - bottom 25% */}
      <div className="border-t border-[#1c3155] overflow-y-auto" style={{ height: '25%', minHeight: 120 }}>
        <BlockInspector />
      </div>
    </div>
  );
}

export { AnimationBuilderWorkspace as AnimationBuilderPanel };
