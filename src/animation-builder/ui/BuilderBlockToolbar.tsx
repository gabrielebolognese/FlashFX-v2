import { useCallback } from 'react';
import { useAnimationBuilderStore } from '../store';
import { useEditorStore } from '../../store/editor';
import { discoverProperties } from '../propertyDiscovery';
import { PRESETS } from '../presets';
import { uid } from '../../core/factory';
import type { Block, BlockType } from '../types';
import type { InterpolationType } from '../../core/types';
import {
  ArrowDown, Zap, Clock, Repeat, ArrowLeftRight,
  Diamond, Shuffle, Sparkles
} from 'lucide-react';

interface ToolbarBlock {
  type: BlockType;
  label: string;
  icon: React.ReactNode;
  color: string;
}

const TOOLBAR_BLOCKS: ToolbarBlock[] = [
  { type: 'animate', label: 'Animate', icon: <ArrowDown size={11} />, color: '#3b82f6' },
  { type: 'relativeAnimate', label: 'Relative', icon: <ArrowDown size={11} />, color: '#8b5cf6' },
  { type: 'instantSet', label: 'Set', icon: <Zap size={11} />, color: '#f59e0b' },
  { type: 'wait', label: 'Wait', icon: <Clock size={11} />, color: '#6b7280' },
  { type: 'loop', label: 'Loop', icon: <Repeat size={11} />, color: '#06b6d4' },
  { type: 'pingPong', label: 'Ping Pong', icon: <ArrowLeftRight size={11} />, color: '#14b8a6' },
  { type: 'condition', label: 'If/Else', icon: <Diamond size={11} />, color: '#eab308' },
  { type: 'random', label: 'Random', icon: <Shuffle size={11} />, color: '#a855f7' },
];

export function BuilderBlockToolbar() {
  const activeChartId = useAnimationBuilderStore((s) => s.activeChartId);
  const chart = useAnimationBuilderStore((s) => s.flowCharts.find((c) => c.id === s.activeChartId));
  const addBlock = useAnimationBuilderStore((s) => s.addBlock);
  const addConnection = useAnimationBuilderStore((s) => s.addConnection);
  const composition = useEditorStore((s) => s.composition);

  const layer = chart ? composition.layers.find((l) => l.id === chart.layerId) : null;
  const properties = layer ? discoverProperties(layer) : [];

  const handleAdd = useCallback((type: BlockType) => {
    if (!activeChartId || !chart) return;

    const existingBlocks = Object.values(chart.blocks);
    const maxY = existingBlocks.reduce((max, b) => Math.max(max, b.position.y), 0);
    const defaultProperty = properties[0]?.path ?? 'transform.position';
    const defaultValue = properties[0]?.defaultValue ?? 0;
    const blockId = uid();

    let newBlock: Block;
    switch (type) {
      case 'animate':
        newBlock = { id: blockId, type: 'animate', position: { x: 300, y: maxY + 90 },
          property: defaultProperty, targetValue: typeof defaultValue === 'number' ? defaultValue : defaultValue as [number, number],
          duration: 0.5, interpolation: 'bezier' as InterpolationType };
        break;
      case 'relativeAnimate':
        newBlock = { id: blockId, type: 'relativeAnimate', position: { x: 300, y: maxY + 90 },
          property: defaultProperty, delta: typeof defaultValue === 'number' ? 0 : [0, 0],
          duration: 0.5, interpolation: 'bezier' as InterpolationType };
        break;
      case 'instantSet':
        newBlock = { id: blockId, type: 'instantSet', position: { x: 300, y: maxY + 90 },
          property: defaultProperty, value: typeof defaultValue === 'number' ? defaultValue : defaultValue as [number, number] };
        break;
      case 'wait':
        newBlock = { id: blockId, type: 'wait', position: { x: 300, y: maxY + 90 }, duration: 1.0 };
        break;
      case 'loop':
        newBlock = { id: blockId, type: 'loop', position: { x: 300, y: maxY + 90 }, iterations: 3, children: [] };
        break;
      case 'pingPong':
        newBlock = { id: blockId, type: 'pingPong', position: { x: 300, y: maxY + 90 }, iterations: 2, children: [] };
        break;
      case 'condition':
        newBlock = { id: blockId, type: 'condition', position: { x: 300, y: maxY + 90 }, conditionExpression: 'composition.width > 1080', trueBranch: [], falseBranch: [] };
        break;
      case 'random':
        newBlock = { id: blockId, type: 'random', position: { x: 300, y: maxY + 90 },
          property: defaultProperty, min: 0, max: 100, duration: 0.5, interpolation: 'bezier' as InterpolationType };
        break;
      default:
        return;
    }

    addBlock(activeChartId, newBlock);

    const endBlock = existingBlocks.find((b) => b.type === 'end');
    if (endBlock) {
      const connToEnd = chart.connections.find((c) => c.to === endBlock.id);
      if (connToEnd) {
        addConnection(activeChartId, connToEnd.from, blockId, 'bottom', 'top');
        addConnection(activeChartId, blockId, endBlock.id, 'bottom', 'top');
      }
    }
  }, [activeChartId, chart, addBlock, addConnection, properties]);

  const handleApplyPreset = useCallback((presetId: string) => {
    if (!layer) return;
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const chart = preset.buildChart(layer.id, 'transform.opacity');
    const store = useAnimationBuilderStore.getState();
    useAnimationBuilderStore.setState({
      flowCharts: [...store.flowCharts, chart],
      activeChartId: chart.id,
    });
    setTimeout(() => useAnimationBuilderStore.getState().compileAndApply(chart.id), 0);
  }, [layer]);

  return (
    <div className="h-[32px] min-h-[32px] flex items-center px-2 gap-0.5 border-b border-[#1a2a42] bg-[#0c0e14] overflow-x-auto scrollbar-hide">
      {TOOLBAR_BLOCKS.map((tb) => (
        <button
          key={tb.type}
          onClick={() => handleAdd(tb.type)}
          disabled={!activeChartId}
          className="flex items-center gap-1 px-2 py-1 rounded text-[9px] whitespace-nowrap
            border border-transparent hover:border-[#2a3044] hover:bg-[#16294a]
            transition-colors disabled:opacity-30 disabled:pointer-events-none group"
          title={tb.label}
        >
          <span style={{ color: tb.color }} className="opacity-70 group-hover:opacity-100 transition-opacity">{tb.icon}</span>
          <span className="text-slate-500 group-hover:text-slate-300 transition-colors">{tb.label}</span>
        </button>
      ))}

      <div className="w-px h-4 bg-[#1a2a42] mx-1 flex-shrink-0" />

      {/* Quick presets */}
      <div className="relative group/presets">
        <button
          disabled={!layer}
          className="flex items-center gap-1 px-2 py-1 rounded text-[9px] whitespace-nowrap
            border border-transparent hover:border-amber-500/20 hover:bg-amber-500/5
            transition-colors disabled:opacity-30 disabled:pointer-events-none"
        >
          <Sparkles size={10} className="text-amber-500/70" />
          <span className="text-slate-500 group-hover/presets:text-amber-400 transition-colors">Presets</span>
        </button>
        <div className="absolute top-full left-0 mt-1 z-50 hidden group-hover/presets:block
          bg-[#16294a] border border-[#2a3044] rounded-lg shadow-xl py-1 min-w-[160px]">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handleApplyPreset(preset.id)}
              className="w-full px-3 py-1.5 text-left text-[10px] text-slate-300 hover:bg-[#1c3155] transition-colors"
            >
              {preset.name}
              <span className="text-[8px] text-slate-600 ml-2">{preset.category}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
