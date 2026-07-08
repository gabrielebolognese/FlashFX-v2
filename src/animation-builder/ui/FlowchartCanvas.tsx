import { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { useAnimationBuilderStore } from '../store';
import { useEditorStore } from '../../store/editor';
import { discoverProperties } from '../propertyDiscovery';
import { uid } from '../../core/factory';
import type { Block, BlockType, LoopBlock, PingPongBlock } from '../types';
import type { InterpolationType } from '../../core/types';
import {
  ArrowDown, Zap, Clock, Repeat, ArrowLeftRight,
  Diamond, Shuffle, Plus, Trash2
} from 'lucide-react';

/* ─── Dark flowgorithm palette (matching reference image) ─── */
const PALETTE = {
  canvasBg: '#2D2B2A',
  wire: '#D6D5D4',
  blockBorder: '#5A5552',
  terminatorFill: '#EAE9E8',
  terminatorText: '#2A2827',
  actionFill: '#F9A176',
  actionText: '#1E1C1B',
  loopFill: '#96D9F7',
  loopText: '#1E1C1B',
  waitFill: '#9BAAB8',
  waitText: '#1E1C1B',
  setFill: '#F7D96E',
  setText: '#1E1C1B',
  randomFill: '#C9A8E8',
  randomText: '#1E1C1B',
  conditionFill: '#B8E8A0',
  conditionText: '#1E1C1B',
  hoverGlow: '#00A2E8',
  selectionOutline: '#ffffff',
};

function getBlockFill(type: string): string {
  switch (type) {
    case 'start': case 'end': return PALETTE.terminatorFill;
    case 'animate': case 'relativeAnimate': return PALETTE.actionFill;
    case 'instantSet': return PALETTE.setFill;
    case 'wait': return PALETTE.waitFill;
    case 'loop': case 'pingPong': return PALETTE.loopFill;
    case 'condition': return PALETTE.conditionFill;
    case 'random': return PALETTE.randomFill;
    default: return PALETTE.actionFill;
  }
}

function getBlockTextColor(type: string): string {
  switch (type) {
    case 'start': case 'end': return PALETTE.terminatorText;
    default: return PALETTE.actionText;
  }
}

/* ─── Helpers ─── */
function getBlockTitle(block: Block): string {
  if (block.label) return block.label;
  switch (block.type) {
    case 'start': return 'Main';
    case 'end': return 'End';
    case 'animate': return `${block.property.split('.').pop()}`;
    case 'relativeAnimate': return `${block.property.split('.').pop()} (rel)`;
    case 'instantSet': return `Set ${block.property.split('.').pop()}`;
    case 'wait': return `Wait ${block.duration}s`;
    case 'loop': return `i = 1 to ${block.iterations}`;
    case 'pingPong': return `PingPong (${block.iterations}x)`;
    case 'condition': return block.conditionExpression;
    case 'random': return `Random`;
    case 'macro': return 'Macro';
    default: return block.type;
  }
}

function getBlockSubtitle(block: Block): string {
  switch (block.type) {
    case 'animate': return `${block.duration}s \u2022 ${block.interpolation}`;
    case 'relativeAnimate': return `${block.duration}s \u2022 delta`;
    case 'random': return `${block.min}\u2013${block.max}`;
    default: return '';
  }
}

/* ─── Insert menu items ─── */
interface InsertMenuItem { type: BlockType; label: string; icon: React.ReactNode; }

const INSERT_ITEMS: InsertMenuItem[] = [
  { type: 'animate', label: 'Animate', icon: <ArrowDown size={12} /> },
  { type: 'relativeAnimate', label: 'Relative', icon: <ArrowDown size={12} /> },
  { type: 'instantSet', label: 'Set', icon: <Zap size={12} /> },
  { type: 'wait', label: 'Wait', icon: <Clock size={12} /> },
  { type: 'random', label: 'Random', icon: <Shuffle size={12} /> },
  { type: 'loop', label: 'Loop', icon: <Repeat size={12} /> },
  { type: 'pingPong', label: 'Ping Pong', icon: <ArrowLeftRight size={12} /> },
  { type: 'condition', label: 'Condition', icon: <Diamond size={12} /> },
];

/* ═══════════════════════════════════════════════════════
   MAIN CANVAS
   ═══════════════════════════════════════════════════════ */

export function BuilderCanvas() {
  const chart = useAnimationBuilderStore((s) => {
    const id = s.activeChartId;
    return id ? s.flowCharts.find((c) => c.id === id) ?? null : null;
  });
  const activeChartId = useAnimationBuilderStore((s) => s.activeChartId);
  const activeBlockId = useAnimationBuilderStore((s) => s.activeBlockId);
  const setActiveBlock = useAnimationBuilderStore((s) => s.setActiveBlock);
  const insertBlockOnConnection = useAnimationBuilderStore((s) => s.insertBlockOnConnection);
  const insertChildInContainer = useAnimationBuilderStore((s) => s.insertChildInContainer);
  const removeBlock = useAnimationBuilderStore((s) => s.removeBlock);
  const removeChildFromContainer = useAnimationBuilderStore((s) => s.removeChildFromContainer);
  const executionHighlight = useAnimationBuilderStore((s) => s.executionHighlight);
  const composition = useEditorStore((s) => s.composition);

  const layer = chart ? composition.layers.find((l) => l.id === chart.layerId) : null;
  const properties = layer ? discoverProperties(layer) : [];

  const [insertMenu, setInsertMenu] = useState<{
    target: { type: 'connection'; connId: string } | { type: 'container'; containerId: string; index: number };
    screenX: number;
    screenY: number;
  } | null>(null);

  const linearOrder = useMemo(() => {
    if (!chart) return [];
    const startBlock = Object.values(chart.blocks).find((b) => b.type === 'start');
    if (!startBlock) return [];
    const order: string[] = [startBlock.id];
    const visited = new Set<string>([startBlock.id]);
    let currentId: string | null = startBlock.id;
    while (currentId) {
      const conn = chart.connections.find((c) => c.from === currentId);
      if (!conn || visited.has(conn.to)) break;
      visited.add(conn.to);
      order.push(conn.to);
      currentId = conn.to;
    }
    return order;
  }, [chart]);

  const getConnectionBetween = useCallback((fromId: string, toId: string): string | null => {
    if (!chart) return null;
    return chart.connections.find((c) => c.from === fromId && c.to === toId)?.id ?? null;
  }, [chart]);

  const handleInsertClick = useCallback((e: React.MouseEvent, target: { type: 'connection'; connId: string } | { type: 'container'; containerId: string; index: number }) => {
    e.stopPropagation();
    setInsertMenu({ target, screenX: e.clientX, screenY: e.clientY });
  }, []);

  const createBlock = useCallback((type: BlockType): Block => {
    const defaultProperty = properties[0]?.path ?? 'transform.position';
    const defaultValue = properties[0]?.defaultValue ?? 0;
    const blockId = uid();
    switch (type) {
      case 'animate':
        return { id: blockId, type: 'animate', position: { x: 0, y: 0 }, property: defaultProperty, targetValue: typeof defaultValue === 'number' ? defaultValue : defaultValue as [number, number], duration: 0.5, interpolation: 'bezier' as InterpolationType };
      case 'relativeAnimate':
        return { id: blockId, type: 'relativeAnimate', position: { x: 0, y: 0 }, property: defaultProperty, delta: typeof defaultValue === 'number' ? 0 : [0, 0], duration: 0.5, interpolation: 'bezier' as InterpolationType };
      case 'instantSet':
        return { id: blockId, type: 'instantSet', position: { x: 0, y: 0 }, property: defaultProperty, value: typeof defaultValue === 'number' ? defaultValue : defaultValue as [number, number] };
      case 'wait':
        return { id: blockId, type: 'wait', position: { x: 0, y: 0 }, duration: 1.0 };
      case 'loop':
        return { id: blockId, type: 'loop', position: { x: 0, y: 0 }, iterations: 3, children: [] };
      case 'pingPong':
        return { id: blockId, type: 'pingPong', position: { x: 0, y: 0 }, iterations: 2, children: [] };
      case 'condition':
        return { id: blockId, type: 'condition', position: { x: 0, y: 0 }, conditionExpression: 'width > 1080', trueBranch: [], falseBranch: [] };
      case 'random':
        return { id: blockId, type: 'random', position: { x: 0, y: 0 }, property: defaultProperty, min: 0, max: 100, duration: 0.5, interpolation: 'bezier' as InterpolationType };
      default:
        return { id: blockId, type: 'wait', position: { x: 0, y: 0 }, duration: 1.0 };
    }
  }, [properties]);

  const handleInsertBlock = useCallback((type: BlockType) => {
    if (!insertMenu || !activeChartId || !chart) return;
    const newBlock = createBlock(type);
    if (insertMenu.target.type === 'connection') {
      insertBlockOnConnection(activeChartId, insertMenu.target.connId, newBlock);
    } else {
      insertChildInContainer(activeChartId, insertMenu.target.containerId, newBlock, insertMenu.target.index);
    }
    setInsertMenu(null);
  }, [insertMenu, activeChartId, chart, createBlock, insertBlockOnConnection, insertChildInContainer]);

  const handleDeleteBlock = useCallback((blockId: string) => {
    if (!activeChartId || !chart) return;
    const block = chart.blocks[blockId];
    if (!block || block.type === 'start' || block.type === 'end') return;
    for (const b of Object.values(chart.blocks)) {
      if ((b.type === 'loop' || b.type === 'pingPong') && b.children.includes(blockId)) {
        removeChildFromContainer(activeChartId, b.id, blockId);
        removeBlock(activeChartId, blockId);
        return;
      }
    }
    const inConn = chart.connections.find((c) => c.to === blockId);
    const outConn = chart.connections.find((c) => c.from === blockId);
    removeBlock(activeChartId, blockId);
    if (inConn && outConn) {
      const { addConnection } = useAnimationBuilderStore.getState();
      addConnection(activeChartId, inConn.from, outConn.to, inConn.fromPort, outConn.toPort);
    }
    setActiveBlock(null);
  }, [activeChartId, chart, removeBlock, removeChildFromContainer, setActiveBlock]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setInsertMenu(null);
    if ((e.key === 'Delete' || e.key === 'Backspace') && activeBlockId) {
      handleDeleteBlock(activeBlockId);
    }
  }, [activeBlockId, handleDeleteBlock]);

  if (!chart) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: PALETTE.canvasBg }}>
        <div className="text-center">
          <div className="text-[12px] font-medium" style={{ color: '#8A8785' }}>No animation flow active</div>
          <div className="text-[10px] mt-1" style={{ color: '#5A5552' }}>Select a layer and create a flow</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full relative overflow-auto focus:outline-none"
      style={{ background: PALETTE.canvasBg }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={() => { setActiveBlock(null); setInsertMenu(null); }}
    >
      <div className="flex flex-col items-center py-10 px-10 min-h-full">
        {linearOrder.map((blockId, idx) => {
          const block = chart.blocks[blockId];
          if (!block) return null;
          const nextBlockId = idx < linearOrder.length - 1 ? linearOrder[idx + 1] : null;
          const connId = nextBlockId ? getConnectionBetween(blockId, nextBlockId) : null;

          return (
            <div key={blockId} className="flex flex-col items-center">
              {(block.type === 'loop' || block.type === 'pingPong') ? (
                <LoopBlockComponent
                  block={block as LoopBlock | PingPongBlock}
                  chart={chart}
                  isActive={activeBlockId === block.id}
                  isHighlighted={executionHighlight === block.id}
                  activeBlockId={activeBlockId}
                  executionHighlight={executionHighlight}
                  onSelect={(e) => { e.stopPropagation(); setActiveBlock(block.id); setInsertMenu(null); }}
                  onDelete={() => handleDeleteBlock(block.id)}
                  onInsertInLoop={handleInsertClick}
                  onSelectChild={(id) => { setActiveBlock(id); setInsertMenu(null); }}
                  onDeleteChild={(id) => handleDeleteBlock(id)}
                />
              ) : (
                <FlowBlock
                  block={block}
                  isActive={activeBlockId === block.id}
                  isHighlighted={executionHighlight === block.id}
                  onSelect={(e) => { e.stopPropagation(); setActiveBlock(block.id); setInsertMenu(null); }}
                  onDelete={() => handleDeleteBlock(block.id)}
                />
              )}

              {connId && (
                <ConnectionWire
                  onClick={(e) => handleInsertClick(e, { type: 'connection', connId })}
                />
              )}
            </div>
          );
        })}
      </div>

      {insertMenu && (
        <InsertMenu
          screenX={insertMenu.screenX}
          screenY={insertMenu.screenY}
          onSelect={handleInsertBlock}
          onClose={() => setInsertMenu(null)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   CONNECTION WIRE (arrow between blocks)
   ═══════════════════════════════════════════════════════ */

function ConnectionWire({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="flex flex-col items-center cursor-pointer group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <svg width="20" height="50" viewBox="0 0 20 50" className="block">
        {/* Vertical wire */}
        <line
          x1={10} y1={0} x2={10} y2={38}
          stroke={hovered ? PALETTE.hoverGlow : PALETTE.wire}
          strokeWidth={3}
          style={{ transition: 'stroke 0.15s' }}
        />
        {/* Arrowhead */}
        <polygon
          points="10,48 5,38 15,38"
          fill={hovered ? PALETTE.hoverGlow : PALETTE.wire}
          style={{ transition: 'fill 0.15s' }}
        />
      </svg>
      {/* Interactive + button */}
      {hovered && (
        <div
          className="absolute flex items-center justify-center w-5 h-5 rounded-full"
          style={{ background: PALETTE.hoverGlow, top: '50%', transform: 'translateY(-50%)' }}
        >
          <Plus size={11} className="text-white" />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   FLOW BLOCK (start/end terminators, action blocks)
   ═══════════════════════════════════════════════════════ */

function FlowBlock({ block, isActive, isHighlighted, onSelect, onDelete }: {
  block: Block;
  isActive: boolean;
  isHighlighted: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onDelete: () => void;
}) {
  const fill = getBlockFill(block.type);
  const textColor = getBlockTextColor(block.type);
  const title = getBlockTitle(block);
  const subtitle = getBlockSubtitle(block);

  // Pill-shaped terminator blocks (Main / End)
  if (block.type === 'start' || block.type === 'end') {
    return (
      <div
        onClick={onSelect}
        className="cursor-pointer transition-all select-none group/block"
        style={{
          outline: isActive ? `2px solid ${PALETTE.selectionOutline}` : 'none',
          outlineOffset: 2,
          boxShadow: isActive ? '0 2px 12px rgba(255,255,255,0.15)' : 'none',
          borderRadius: 999,
        }}
      >
        <div
          className="px-8 py-2 rounded-full border"
          style={{
            background: fill,
            borderColor: PALETTE.blockBorder,
          }}
        >
          <span className="text-[13px] font-bold tracking-wide" style={{ color: textColor }}>
            {title}
          </span>
        </div>
      </div>
    );
  }

  // Standard action blocks (sharp rectangle)
  return (
    <div
      onClick={onSelect}
      className="relative cursor-pointer transition-all select-none group/block"
      style={{
        outline: isActive ? `2px solid ${PALETTE.selectionOutline}` : 'none',
        outlineOffset: 2,
        boxShadow: isActive ? '0 2px 12px rgba(255,255,255,0.15)' : isHighlighted ? '0 0 12px rgba(255,200,0,0.3)' : 'none',
      }}
    >
      <div
        className="w-[180px] border px-4 py-2.5"
        style={{
          background: fill,
          borderColor: PALETTE.blockBorder,
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold truncate" style={{ color: textColor }}>
            {title}
          </span>
          {isActive && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="opacity-0 group-hover/block:opacity-100 p-0.5 rounded transition-opacity"
            >
              <Trash2 size={11} className="text-red-700/70 hover:text-red-800" />
            </button>
          )}
        </div>
        {subtitle && (
          <div className="text-[9px] mt-0.5 truncate" style={{ color: `${textColor}99` }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   LOOP BLOCK (hexagonal shape with side track)
   ═══════════════════════════════════════════════════════ */

function LoopBlockComponent({ block, chart, isActive, isHighlighted, activeBlockId, executionHighlight, onSelect, onDelete, onInsertInLoop, onSelectChild, onDeleteChild }: {
  block: LoopBlock | PingPongBlock;
  chart: { blocks: Record<string, Block>; connections: { id: string; from: string; to: string }[] };
  isActive: boolean;
  isHighlighted: boolean;
  activeBlockId: string | null;
  executionHighlight: string | null;
  onSelect: (e: React.MouseEvent) => void;
  onDelete: () => void;
  onInsertInLoop: (e: React.MouseEvent, target: { type: 'container'; containerId: string; index: number }) => void;
  onSelectChild: (id: string) => void;
  onDeleteChild: (id: string) => void;
}) {
  const fill = PALETTE.loopFill;
  const textColor = PALETTE.loopText;
  const title = getBlockTitle(block);

  const hexW = 200;
  const hexH = 44;
  const notch = 16;

  const hexPoints = `${notch},0 ${hexW - notch},0 ${hexW},${hexH / 2} ${hexW - notch},${hexH} ${notch},${hexH} 0,${hexH / 2}`;

  return (
    <div className="flex flex-col items-center">
      {/* Hexagon header */}
      <div
        onClick={onSelect}
        className="relative cursor-pointer transition-all select-none group/loop"
        style={{
          outline: isActive ? `2px solid ${PALETTE.selectionOutline}` : 'none',
          outlineOffset: 2,
          boxShadow: isActive ? '0 2px 12px rgba(255,255,255,0.15)' : isHighlighted ? '0 0 12px rgba(255,200,0,0.3)' : 'none',
        }}
      >
        <svg width={hexW} height={hexH} className="block">
          <polygon
            points={hexPoints}
            fill={fill}
            stroke={PALETTE.blockBorder}
            strokeWidth={1.5}
          />
        </svg>
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <div className="flex items-center gap-1.5">
            <Repeat size={11} style={{ color: textColor }} />
            <span className="text-[12px] font-semibold" style={{ color: textColor }}>
              {title}
            </span>
          </div>
        </div>
        {isActive && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="absolute top-1 right-5 opacity-0 group-hover/loop:opacity-100 p-0.5 rounded transition-opacity"
          >
            <Trash2 size={11} className="text-red-700/70 hover:text-red-800" />
          </button>
        )}
      </div>

      {/* Loop body track (children) */}
      <div className="flex">
        {/* Left vertical wire down into body */}
        <div className="flex flex-col items-center" style={{ width: 20 }}>
          <svg width="20" height="20" viewBox="0 0 20 20">
            <line x1={10} y1={0} x2={10} y2={20} stroke={PALETTE.wire} strokeWidth={2} />
          </svg>
          <div className="text-[8px] font-medium mb-1" style={{ color: `${PALETTE.wire}99` }}>Next</div>
        </div>

        {/* Body content */}
        <div className="flex flex-col items-center min-w-[180px] mx-2 py-1">
          {block.children.length === 0 ? (
            <SideTrackInsertPoint
              onClick={(e) => onInsertInLoop(e, { type: 'container', containerId: block.id, index: 0 })}
              label="Add step"
            />
          ) : (
            block.children.map((childId, childIdx) => {
              const child = chart.blocks[childId];
              if (!child) return null;
              return (
                <div key={childId} className="flex flex-col items-center">
                  <FlowBlock
                    block={child}
                    isActive={activeBlockId === childId}
                    isHighlighted={executionHighlight === childId}
                    onSelect={(e) => { e.stopPropagation(); onSelectChild(childId); }}
                    onDelete={() => onDeleteChild(childId)}
                  />
                  {/* Insert point after each child */}
                  <div className="py-1">
                    <SideTrackInsertPoint
                      onClick={(e) => onInsertInLoop(e, { type: 'container', containerId: block.id, index: childIdx + 1 })}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right vertical wire (return path) */}
        <div className="flex flex-col items-center justify-end" style={{ width: 20 }}>
          <div className="text-[8px] font-medium mb-1" style={{ color: `${PALETTE.wire}99` }}>Done</div>
          <svg width="20" height="20" viewBox="0 0 20 20">
            <line x1={10} y1={0} x2={10} y2={20} stroke={PALETTE.wire} strokeWidth={2} />
          </svg>
        </div>
      </div>

      {/* Bottom connector bar */}
      <svg width={hexW} height="16" viewBox={`0 0 ${hexW} 16`} className="block">
        <line x1={10} y1={0} x2={10} y2={8} stroke={PALETTE.wire} strokeWidth={2} />
        <line x1={10} y1={8} x2={hexW - 10} y2={8} stroke={PALETTE.wire} strokeWidth={2} />
        <line x1={hexW - 10} y1={0} x2={hexW - 10} y2={8} stroke={PALETTE.wire} strokeWidth={2} />
        <line x1={hexW / 2} y1={8} x2={hexW / 2} y2={16} stroke={PALETTE.wire} strokeWidth={2} />
      </svg>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   SIDE TRACK INSERT POINT (+ button inside loops)
   ═══════════════════════════════════════════════════════ */

function SideTrackInsertPoint({ onClick, label }: { onClick: (e: React.MouseEvent) => void; label?: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="flex flex-col items-center cursor-pointer py-1"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <div
        className="flex items-center justify-center w-5 h-5 rounded-full border transition-all"
        style={{
          background: hovered ? PALETTE.hoverGlow : 'transparent',
          borderColor: hovered ? PALETTE.hoverGlow : PALETTE.blockBorder,
        }}
      >
        <Plus size={11} style={{ color: hovered ? '#fff' : PALETTE.wire }} />
      </div>
      {label && (
        <span className="text-[8px] mt-0.5" style={{ color: PALETTE.wire + '80' }}>{label}</span>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   INSERT MENU (popup for selecting block type)
   ═══════════════════════════════════════════════════════ */

function InsertMenu({ screenX, screenY, onSelect, onClose }: {
  screenX: number;
  screenY: number;
  onSelect: (type: BlockType) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 border rounded-lg shadow-xl py-1 min-w-[160px]"
      style={{
        left: screenX,
        top: screenY,
        background: '#1E1D1C',
        borderColor: PALETTE.blockBorder,
      }}
    >
      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#8A8785' }}>
        Insert Block
      </div>
      {INSERT_ITEMS.map((item) => (
        <button
          key={item.type}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors"
          style={{ color: PALETTE.wire }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#2D2B2A'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          onClick={(e) => { e.stopPropagation(); onSelect(item.type); }}
        >
          <div
            className="w-4 h-4 rounded flex items-center justify-center"
            style={{ background: getBlockFill(item.type), color: getBlockTextColor(item.type) }}
          >
            {item.icon}
          </div>
          <span className="text-[11px]">{item.label}</span>
        </button>
      ))}
    </div>
  );
}