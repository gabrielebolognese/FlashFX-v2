import { create } from 'zustand';
import type { FlowChart, Block, Connection, MacroDefinition, CompilerOutput, GeneratedKeyframe, PortSide } from './types';
import { compile, deduplicateKeyframes } from './compiler';
import { getPropertyDefaultMap } from './propertyDiscovery';
import { useEditorStore } from '../store/editor';
import { uid } from '../core/factory';
import { createKeyframe } from '../core/factory';
import type { Layer, AnimatableProperty } from '../core/types';

interface AnimationBuilderState {
  flowCharts: FlowChart[];
  macros: MacroDefinition[];
  activeChartId: string | null;
  activeBlockId: string | null;
  workspace: 'editor' | 'builder';
  compiledOutputs: Map<string, CompilerOutput>;
  executionHighlight: string | null;

  setWorkspace: (ws: 'editor' | 'builder') => void;
  setActiveChart: (id: string | null) => void;
  setActiveBlock: (id: string | null) => void;

  createChart: (layerId: string, name?: string) => string;
  deleteChart: (chartId: string) => void;
  duplicateChart: (chartId: string) => string;

  addBlock: (chartId: string, block: Block) => void;
  updateBlock: (chartId: string, blockId: string, updates: Partial<Block>) => void;
  removeBlock: (chartId: string, blockId: string) => void;
  moveBlock: (chartId: string, blockId: string, position: { x: number; y: number }) => void;
  addChildToContainer: (chartId: string, containerId: string, childId: string) => void;
  insertChildInContainer: (chartId: string, containerId: string, block: Block, index: number) => void;
  removeChildFromContainer: (chartId: string, containerId: string, childId: string) => void;

  addConnection: (chartId: string, from: string, to: string, fromPort?: PortSide | 'true' | 'false', toPort?: PortSide) => void;
  removeConnection: (chartId: string, connectionId: string) => void;
  insertBlockOnConnection: (chartId: string, connectionId: string, block: Block) => void;

  setChartMode: (chartId: string, mode: 'live' | 'baked') => void;
  compileChart: (chartId: string) => void;
  compileAndApply: (chartId: string) => void;
  compileAll: () => void;

  saveMacro: (macro: MacroDefinition) => void;
  deleteMacro: (macroId: string) => void;
  collapseToMacro: (chartId: string, blockIds: string[], name: string) => string;

  setExecutionHighlight: (blockId: string | null) => void;
}

function getChart(state: AnimationBuilderState, chartId: string): FlowChart | undefined {
  return state.flowCharts.find((c) => c.id === chartId);
}

function updateChart(charts: FlowChart[], chartId: string, updater: (chart: FlowChart) => FlowChart): FlowChart[] {
  return charts.map((c) => (c.id === chartId ? updater(c) : c));
}

export const useAnimationBuilderStore = create<AnimationBuilderState>((set, get) => ({
  flowCharts: [],
  macros: [],
  activeChartId: null,
  activeBlockId: null,
  workspace: 'editor',
  compiledOutputs: new Map(),
  executionHighlight: null,

  setWorkspace: (ws) => set({ workspace: ws }),
  setActiveChart: (id) => set({ activeChartId: id, activeBlockId: null }),
  setActiveBlock: (id) => set({ activeBlockId: id }),

  createChart: (layerId, name) => {
    const id = uid();
    const startBlock: Block = { id: uid(), type: 'start', position: { x: 300, y: 50 } };
    const endBlock: Block = { id: uid(), type: 'end', position: { x: 300, y: 200 } };
    const connection: Connection = { id: uid(), from: startBlock.id, to: endBlock.id, fromPort: 'bottom', toPort: 'top' };

    const chart: FlowChart = {
      id,
      name: name ?? 'Animation Flow',
      layerId,
      blocks: { [startBlock.id]: startBlock, [endBlock.id]: endBlock },
      connections: [connection],
      mode: 'live',
      seed: Math.floor(Math.random() * 2147483647),
      anchorMode: 'clipStart',
    };

    set((s) => ({ flowCharts: [...s.flowCharts, chart], activeChartId: id }));
    return id;
  },

  deleteChart: (chartId) => {
    set((s) => ({
      flowCharts: s.flowCharts.filter((c) => c.id !== chartId),
      activeChartId: s.activeChartId === chartId ? null : s.activeChartId,
    }));
  },

  duplicateChart: (chartId) => {
    const chart = get().flowCharts.find((c) => c.id === chartId);
    if (!chart) return '';
    const newId = uid();
    const newChart: FlowChart = { ...chart, id: newId, name: chart.name + ' (Copy)' };
    set((s) => ({ flowCharts: [...s.flowCharts, newChart], activeChartId: newId }));
    return newId;
  },

  addBlock: (chartId, block) => {
    set((s) => ({
      flowCharts: updateChart(s.flowCharts, chartId, (c) => ({
        ...c,
        blocks: { ...c.blocks, [block.id]: block },
      })),
    }));
    const chart = get().flowCharts.find((c) => c.id === chartId);
    if (chart?.mode === 'live') get().compileAndApply(chartId);
  },

  updateBlock: (chartId, blockId, updates) => {
    set((s) => ({
      flowCharts: updateChart(s.flowCharts, chartId, (c) => ({
        ...c,
        blocks: {
          ...c.blocks,
          [blockId]: { ...c.blocks[blockId], ...updates } as Block,
        },
      })),
    }));
    const chart = get().flowCharts.find((c) => c.id === chartId);
    if (chart?.mode === 'live') get().compileAndApply(chartId);
  },

  removeBlock: (chartId, blockId) => {
    set((s) => ({
      flowCharts: updateChart(s.flowCharts, chartId, (c) => {
        const block = c.blocks[blockId];
        const idsToRemove = new Set([blockId]);
        // Cascade-delete children of loop/pingPong containers
        if (block && (block.type === 'loop' || block.type === 'pingPong')) {
          for (const childId of block.children) {
            idsToRemove.add(childId);
          }
        }
        const remaining: Record<string, Block> = {};
        for (const [id, b] of Object.entries(c.blocks)) {
          if (!idsToRemove.has(id)) remaining[id] = b;
        }
        return {
          ...c,
          blocks: remaining,
          connections: c.connections.filter((conn) => !idsToRemove.has(conn.from) && !idsToRemove.has(conn.to)),
        };
      }),
    }));
    const chart = get().flowCharts.find((c) => c.id === chartId);
    if (chart?.mode === 'live') get().compileAndApply(chartId);
  },

  moveBlock: (chartId, blockId, position) => {
    set((s) => ({
      flowCharts: updateChart(s.flowCharts, chartId, (c) => ({
        ...c,
        blocks: {
          ...c.blocks,
          [blockId]: { ...c.blocks[blockId], position },
        },
      })),
    }));
  },

  addChildToContainer: (chartId, containerId, childId) => {
    set((s) => ({
      flowCharts: updateChart(s.flowCharts, chartId, (c) => {
        const container = c.blocks[containerId];
        if (!container) return c;
        if (container.type === 'loop' || container.type === 'pingPong') {
          return {
            ...c,
            blocks: {
              ...c.blocks,
              [containerId]: { ...container, children: [...container.children, childId] },
            },
          };
        }
        return c;
      }),
    }));
    const chart = get().flowCharts.find((c) => c.id === chartId);
    if (chart?.mode === 'live') get().compileAndApply(chartId);
  },

  insertChildInContainer: (chartId, containerId, block, index) => {
    set((s) => ({
      flowCharts: updateChart(s.flowCharts, chartId, (c) => {
        const container = c.blocks[containerId];
        if (!container) return c;
        if (container.type === 'loop' || container.type === 'pingPong') {
          const newChildren = [...container.children];
          newChildren.splice(index, 0, block.id);
          return {
            ...c,
            blocks: {
              ...c.blocks,
              [block.id]: block,
              [containerId]: { ...container, children: newChildren },
            },
          };
        }
        return c;
      }),
    }));
    set({ activeBlockId: block.id });
    const chart = get().flowCharts.find((c) => c.id === chartId);
    if (chart?.mode === 'live') get().compileAndApply(chartId);
  },

  removeChildFromContainer: (chartId, containerId, childId) => {
    set((s) => ({
      flowCharts: updateChart(s.flowCharts, chartId, (c) => {
        const container = c.blocks[containerId];
        if (!container) return c;
        if (container.type === 'loop' || container.type === 'pingPong') {
          return {
            ...c,
            blocks: {
              ...c.blocks,
              [containerId]: { ...container, children: container.children.filter((id) => id !== childId) },
            },
          };
        }
        return c;
      }),
    }));
    const chart = get().flowCharts.find((c) => c.id === chartId);
    if (chart?.mode === 'live') get().compileAndApply(chartId);
  },

  addConnection: (chartId, from, to, fromPort = 'bottom', toPort = 'top') => {
    const conn: Connection = { id: uid(), from, to, fromPort, toPort };
    set((s) => ({
      flowCharts: updateChart(s.flowCharts, chartId, (c) => ({
        ...c,
        connections: [...c.connections, conn],
      })),
    }));
    const chart = get().flowCharts.find((c) => c.id === chartId);
    if (chart?.mode === 'live') get().compileAndApply(chartId);
  },

  removeConnection: (chartId, connectionId) => {
    set((s) => ({
      flowCharts: updateChart(s.flowCharts, chartId, (c) => ({
        ...c,
        connections: c.connections.filter((conn) => conn.id !== connectionId),
      })),
    }));
  },

  insertBlockOnConnection: (chartId, connectionId, block) => {
    set((s) => ({
      flowCharts: updateChart(s.flowCharts, chartId, (c) => {
        const conn = c.connections.find((cn) => cn.id === connectionId);
        if (!conn) return c;

        const fromBlock = c.blocks[conn.from];
        const toBlock = c.blocks[conn.to];
        if (!fromBlock || !toBlock) return c;

        // Position new block midway between from and to
        const midX = (fromBlock.position.x + toBlock.position.x) / 2;
        const midY = (fromBlock.position.y + toBlock.position.y) / 2;
        const positionedBlock = { ...block, position: { x: Math.round(midX / 20) * 20, y: Math.round(midY / 20) * 20 } };

        // Push all blocks at or below the insertion Y down to make room
        const insertY = positionedBlock.position.y;
        const shiftAmount = 80;
        const updatedBlocks = { ...c.blocks };
        for (const [id, b] of Object.entries(updatedBlocks)) {
          if (b.position.y >= insertY && id !== block.id) {
            updatedBlocks[id] = { ...b, position: { x: b.position.x, y: b.position.y + shiftAmount } };
          }
        }
        updatedBlocks[block.id] = positionedBlock;

        // Remove old connection, add two new ones
        const newConnections = c.connections.filter((cn) => cn.id !== connectionId);
        newConnections.push(
          { id: uid(), from: conn.from, to: block.id, fromPort: conn.fromPort, toPort: 'top' },
          { id: uid(), from: block.id, to: conn.to, fromPort: 'bottom', toPort: conn.toPort }
        );

        return { ...c, blocks: updatedBlocks, connections: newConnections };
      }),
    }));
    set({ activeBlockId: block.id });
    const chart = get().flowCharts.find((c) => c.id === chartId);
    if (chart?.mode === 'live') get().compileAndApply(chartId);
  },

  setChartMode: (chartId, mode) => {
    set((s) => ({
      flowCharts: updateChart(s.flowCharts, chartId, (c) => ({ ...c, mode })),
    }));
  },

  compileChart: (chartId) => {
    const chart = get().flowCharts.find((c) => c.id === chartId);
    if (!chart) return;

    const editorState = useEditorStore.getState();
    const layer = editorState.composition.layers.find((l) => l.id === chart.layerId);
    if (!layer) return;

    const propertyDefaults = getPropertyDefaultMap(layer);
    const macroMap = new Map(get().macros.map((m) => [m.id, m]));

    const conditionContext: Record<string, unknown> = {
      'layer.width': editorState.composition.settings.width,
      'layer.height': editorState.composition.settings.height,
      'composition.width': editorState.composition.settings.width,
      'composition.height': editorState.composition.settings.height,
      'composition.frameRate': editorState.composition.settings.frameRate,
      'composition.duration': editorState.composition.settings.durationFrames,
    };

    const output = compile(
      chart,
      editorState.composition.settings.frameRate,
      propertyDefaults,
      macroMap,
      conditionContext
    );

    output.keyframes = deduplicateKeyframes(output.keyframes);

    set((s) => {
      const newOutputs = new Map(s.compiledOutputs);
      newOutputs.set(chartId, output);
      return { compiledOutputs: newOutputs };
    });
  },

  compileAndApply: (chartId) => {
    get().compileChart(chartId);
    const output = get().compiledOutputs.get(chartId);
    const chart = get().flowCharts.find((c) => c.id === chartId);
    if (!output || !chart) return;

    const editorState = useEditorStore.getState();
    const layer = editorState.composition.layers.find((l) => l.id === chart.layerId);
    if (!layer) return;

    const frameOffset = chart.anchorMode === 'clipStart' ? layer.inPoint : 0;

    applyKeyframesToLayer(chart.layerId, output.keyframes, frameOffset);
  },

  compileAll: () => {
    const state = get();
    for (const chart of state.flowCharts) {
      if (chart.mode === 'live') {
        get().compileAndApply(chart.id);
      }
    }
  },

  saveMacro: (macro) => {
    set((s) => ({
      macros: [...s.macros.filter((m) => m.id !== macro.id), macro],
    }));
  },

  deleteMacro: (macroId) => {
    set((s) => ({
      macros: s.macros.filter((m) => m.id !== macroId),
    }));
  },

  collapseToMacro: (chartId, blockIds, name) => {
    const chart = get().flowCharts.find((c) => c.id === chartId);
    if (!chart) return '';

    const macroId = uid();
    const selectedBlocks: Record<string, Block> = {};
    for (const id of blockIds) {
      if (chart.blocks[id]) selectedBlocks[id] = chart.blocks[id];
    }

    const internalConnections = chart.connections.filter(
      (c) => blockIds.includes(c.from) && blockIds.includes(c.to)
    );

    const macro: MacroDefinition = {
      id: macroId,
      name,
      description: '',
      parameters: [],
      blocks: selectedBlocks,
      connections: internalConnections,
    };

    get().saveMacro(macro);
    return macroId;
  },

  setExecutionHighlight: (blockId) => set({ executionHighlight: blockId }),
}));

function applyKeyframesToLayer(layerId: string, keyframes: GeneratedKeyframe[], frameOffset: number): void {
  const editorStore = useEditorStore.getState();
  const { composition } = editorStore;
  const layer = composition.layers.find((l) => l.id === layerId);
  if (!layer) return;

  const grouped = new Map<string, GeneratedKeyframe[]>();
  for (const kf of keyframes) {
    const existing = grouped.get(kf.property) ?? [];
    existing.push(kf);
    grouped.set(kf.property, existing);
  }

  for (const [propertyPath, kfs] of grouped) {
    const prop = deepGetProperty(layer, propertyPath);
    if (!prop) continue;

    const generatedKeyframes = kfs.map((kf) =>
      createKeyframe(kf.frame + frameOffset, kf.value, kf.interpolation)
    );

    const manualKeyframes = prop.keyframes.filter(
      (k) => !generatedKeyframes.some((g) => g.frame === k.frame)
    );

    const merged = [...manualKeyframes, ...generatedKeyframes].sort((a, b) => a.frame - b.frame);

    editorStore.updateLayerProperty(layerId, `${propertyPath}.keyframes`, merged);
  }
}

function deepGetProperty(obj: unknown, path: string): AnimatableProperty | null {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[part];
  }
  if (current && typeof current === 'object' && 'keyframes' in current && 'defaultValue' in current) {
    return current as AnimatableProperty;
  }
  return null;
}
