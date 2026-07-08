import { useCallback, useRef, useMemo, useEffect } from 'react';
import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import { useMotionPathStore, createMotionPathNode } from '../../store/motionPath';
import { evaluatePathAtProgress } from '../../core/motionPath';
import { evaluateNumber } from '../../core/interpolation';
import type { MotionPath, Vec2 } from '../../core/types';

interface MotionPathOverlayProps {
  style?: React.CSSProperties;
}

export function MotionPathOverlay({ style }: MotionPathOverlayProps) {
  const composition = useEditorStore((s) => s.composition);
  const selection = useEditorStore((s) => s.selection);
  const currentFrame = useTimelineStore((s) => s.currentFrame);

  const editMode = useMotionPathStore((s) => s.editMode);
  const activePathId = useMotionPathStore((s) => s.activePathId);
  const selectedNodeIds = useMotionPathStore((s) => s.selectedNodeIds);
  const hoveredNodeId = useMotionPathStore((s) => s.hoveredNodeId);
  const hoveredSegmentIndex = useMotionPathStore((s) => s.hoveredSegmentIndex);
  const previewPosition = useMotionPathStore((s) => s.previewPosition);
  const setHoveredNode = useMotionPathStore((s) => s.setHoveredNode);
  const setHoveredSegment = useMotionPathStore((s) => s.setHoveredSegment);
  const setPreviewPosition = useMotionPathStore((s) => s.setPreviewPosition);
  const selectNode = useMotionPathStore((s) => s.selectNode);

  const svgRef = useRef<SVGSVGElement>(null);

  const finishCreation = useCallback(() => {
    if (editMode !== 'creating') return;
    useMotionPathStore.getState().setPreviewPosition(null);
    useMotionPathStore.getState().setEditMode('editing');
  }, [editMode]);

  useEffect(() => {
    if (editMode !== 'creating') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finishCreation();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [editMode, finishCreation]);

  const { width: compW, height: compH } = composition.settings;

  const toScreen = useCallback((pos: Vec2): Vec2 => {
    if (!svgRef.current) return [0, 0];
    const rect = svgRef.current.getBoundingClientRect();
    return [
      (pos[0] / compW) * rect.width,
      (pos[1] / compH) * rect.height,
    ];
  }, [compW, compH]);

  const toComp = useCallback((screenX: number, screenY: number): Vec2 => {
    if (!svgRef.current) return [0, 0];
    const rect = svgRef.current.getBoundingClientRect();
    return [
      ((screenX - rect.left) / rect.width) * compW,
      ((screenY - rect.top) / rect.height) * compH,
    ];
  }, [compW, compH]);

  // Get all motion paths for the active layer
  const activePaths = useMemo(() => {
    if (!selection.activeId) return [];
    return composition.motionPaths.filter((p) => p.layerId === selection.activeId);
  }, [composition.motionPaths, selection.activeId]);

  const activePath = activePathId
    ? composition.motionPaths.find((p) => p.id === activePathId) ?? null
    : activePaths[0] ?? null;

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (editMode === 'creating' && activePath && activePath.nodes.length > 0) {
      const pos = toComp(e.clientX, e.clientY);
      setPreviewPosition(pos);
    }
  }, [editMode, activePath, toComp, setPreviewPosition]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (editMode !== 'creating' || !activePath) return;

    const pos = toComp(e.clientX, e.clientY);
    const newNode = createMotionPathNode(pos, 'corner');
    const updatedNodes = [...activePath.nodes, newNode];

    useEditorStore.getState().updateMotionPath(activePath.id, { nodes: updatedNodes });
  }, [editMode, activePath, toComp]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (editMode === 'creating') {
      e.preventDefault();
      e.stopPropagation();
      finishCreation();
    }
  }, [editMode, finishCreation]);

  const handleNodeDrag = useCallback((nodeId: string, e: React.PointerEvent) => {
    if (editMode === 'creating') return;
    e.stopPropagation();
    e.preventDefault();
    (e.target as SVGElement).setPointerCapture(e.pointerId);
    selectNode(nodeId);

    if (!activePath) return;

    const onMove = (ev: PointerEvent) => {
      const pos = toComp(ev.clientX, ev.clientY);
      const currentPath = useEditorStore.getState().composition.motionPaths.find((p) => p.id === activePath.id);
      if (!currentPath) return;
      const updatedNodes = currentPath.nodes.map((n) =>
        n.id === nodeId ? { ...n, position: pos } : n
      );
      useEditorStore.getState().updateMotionPath(activePath.id, { nodes: updatedNodes });
    };

    const onUp = (ev: PointerEvent) => {
      (ev.target as SVGElement).releasePointerCapture(ev.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [editMode, activePath, toComp, selectNode]);

  const handleHandleDrag = useCallback((nodeId: string, handleType: 'in' | 'out', e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as SVGElement).setPointerCapture(e.pointerId);

    if (!activePath) return;

    const onMove = (ev: PointerEvent) => {
      const pos = toComp(ev.clientX, ev.clientY);
      const currentPath = useEditorStore.getState().composition.motionPaths.find((p) => p.id === activePath.id);
      if (!currentPath) return;
      const node = currentPath.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const offset: Vec2 = [pos[0] - node.position[0], pos[1] - node.position[1]];

      const updatedNodes = currentPath.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        if (handleType === 'out') {
          const newNode = { ...n, handleOut: offset };
          if (n.vertexType === 'smooth') {
            const len = Math.sqrt(n.handleIn[0] ** 2 + n.handleIn[1] ** 2);
            const mag = Math.sqrt(offset[0] ** 2 + offset[1] ** 2);
            if (mag > 0) {
              newNode.handleIn = [(-offset[0] / mag) * len, (-offset[1] / mag) * len];
            }
          }
          return newNode;
        } else {
          const newNode = { ...n, handleIn: offset };
          if (n.vertexType === 'smooth') {
            const len = Math.sqrt(n.handleOut[0] ** 2 + n.handleOut[1] ** 2);
            const mag = Math.sqrt(offset[0] ** 2 + offset[1] ** 2);
            if (mag > 0) {
              newNode.handleOut = [(-offset[0] / mag) * len, (-offset[1] / mag) * len];
            }
          }
          return newNode;
        }
      });

      useEditorStore.getState().updateMotionPath(activePath.id, { nodes: updatedNodes });
    };

    const onUp = (ev: PointerEvent) => {
      (ev.target as SVGElement).releasePointerCapture(ev.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [activePath, toComp]);

  if (activePaths.length === 0 && editMode === 'idle') return null;

  return (
    <svg
      ref={svgRef}
      style={{ ...style, pointerEvents: editMode !== 'idle' ? 'all' : 'none' }}
      className={editMode === 'creating' ? 'cursor-crosshair' : ''}
      viewBox={`0 0 ${compW} ${compH}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseMove={handleMouseMove}
    >
      {activePaths.map((path) => (
        <MotionPathVisualization
          key={path.id}
          path={path}
          isActive={path.id === activePath?.id}
          currentFrame={currentFrame}
          selectedNodeIds={selectedNodeIds}
          hoveredNodeId={hoveredNodeId}
          hoveredSegmentIndex={hoveredSegmentIndex}
          previewPosition={editMode === 'creating' && path.id === activePath?.id ? previewPosition : null}
          onNodeHover={setHoveredNode}
          onSegmentHover={setHoveredSegment}
          onNodeDrag={handleNodeDrag}
          onHandleDrag={handleHandleDrag}
          editMode={editMode}
        />
      ))}
    </svg>
  );
}

interface MotionPathVisualizationProps {
  path: MotionPath;
  isActive: boolean;
  currentFrame: number;
  selectedNodeIds: string[];
  hoveredNodeId: string | null;
  hoveredSegmentIndex: number | null;
  previewPosition: Vec2 | null;
  onNodeHover: (id: string | null) => void;
  onSegmentHover: (index: number | null) => void;
  onNodeDrag: (nodeId: string, e: React.PointerEvent) => void;
  onHandleDrag: (nodeId: string, handleType: 'in' | 'out', e: React.PointerEvent) => void;
  editMode: string;
}

function MotionPathVisualization({
  path,
  isActive,
  currentFrame,
  selectedNodeIds,
  hoveredNodeId,
  hoveredSegmentIndex,
  previewPosition,
  onNodeHover,
  onSegmentHover,
  onNodeDrag,
  onHandleDrag,
  editMode,
}: MotionPathVisualizationProps) {
  const nodes = path.nodes;

  // Generate SVG path from nodes
  const pathD = useMemo(() => {
    if (nodes.length < 2) return '';
    let d = `M ${nodes[0].position[0]} ${nodes[0].position[1]}`;
    const segCount = path.closed ? nodes.length : nodes.length - 1;
    for (let i = 0; i < segCount; i++) {
      const curr = nodes[i];
      const next = nodes[(i + 1) % nodes.length];
      const cp1: Vec2 = [curr.position[0] + curr.handleOut[0], curr.position[1] + curr.handleOut[1]];
      const cp2: Vec2 = [next.position[0] + next.handleIn[0], next.position[1] + next.handleIn[1]];
      d += ` C ${cp1[0]} ${cp1[1]}, ${cp2[0]} ${cp2[1]}, ${next.position[0]} ${next.position[1]}`;
    }
    if (path.closed) d += ' Z';
    return d;
  }, [nodes, path.closed]);

  // Current position on path
  const progress = evaluateNumber(path.progress, currentFrame);
  const { position: currentPos } = evaluatePathAtProgress(path, progress / 100);

  // Preview line from last node to cursor
  const lastNode = nodes.length > 0 ? nodes[nodes.length - 1] : null;

  const pathColor = isActive ? '#f7b500' : '#b8860b';
  const nodeSize = 5;

  return (
    <g>
      {/* Path line */}
      {pathD && (
        <path
          d={pathD}
          fill="none"
          stroke={pathColor}
          strokeWidth={1.5}
          strokeDasharray="6,4"
          opacity={isActive ? 0.9 : 0.5}
          style={{ pointerEvents: 'stroke' }}
          onMouseEnter={() => onSegmentHover(0)}
          onMouseLeave={() => onSegmentHover(null)}
        />
      )}

      {/* Hovered segment highlight */}
      {hoveredSegmentIndex !== null && pathD && isActive && (
        <path
          d={pathD}
          fill="none"
          stroke={pathColor}
          strokeWidth={3}
          strokeDasharray="6,4"
          opacity={0.4}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Preview guide line while creating */}
      {previewPosition && lastNode && (
        <line
          x1={lastNode.position[0]}
          y1={lastNode.position[1]}
          x2={previewPosition[0]}
          y2={previewPosition[1]}
          stroke={pathColor}
          strokeWidth={1}
          strokeDasharray="3,3"
          opacity={0.6}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Node handles (tangent lines + control points) */}
      {isActive && nodes.map((node) => {
        const isSelected = selectedNodeIds.includes(node.id);
        if (!isSelected && editMode !== 'editing') return null;
        const hasHandleOut = node.handleOut[0] !== 0 || node.handleOut[1] !== 0;
        const hasHandleIn = node.handleIn[0] !== 0 || node.handleIn[1] !== 0;
        return (
          <g key={`handles_${node.id}`}>
            {hasHandleOut && (
              <>
                <line
                  x1={node.position[0]}
                  y1={node.position[1]}
                  x2={node.position[0] + node.handleOut[0]}
                  y2={node.position[1] + node.handleOut[1]}
                  stroke="#f7b500"
                  strokeWidth={0.8}
                  opacity={0.7}
                  style={{ pointerEvents: 'none' }}
                />
                <circle
                  cx={node.position[0] + node.handleOut[0]}
                  cy={node.position[1] + node.handleOut[1]}
                  r={3}
                  fill="#f7b500"
                  stroke="#fff"
                  strokeWidth={0.8}
                  className="cursor-grab"
                  style={{ pointerEvents: 'all' }}
                  onPointerDown={(e) => onHandleDrag(node.id, 'out', e)}
                />
              </>
            )}
            {hasHandleIn && (
              <>
                <line
                  x1={node.position[0]}
                  y1={node.position[1]}
                  x2={node.position[0] + node.handleIn[0]}
                  y2={node.position[1] + node.handleIn[1]}
                  stroke="#22d3ee"
                  strokeWidth={0.8}
                  opacity={0.7}
                  style={{ pointerEvents: 'none' }}
                />
                <circle
                  cx={node.position[0] + node.handleIn[0]}
                  cy={node.position[1] + node.handleIn[1]}
                  r={3}
                  fill="#22d3ee"
                  stroke="#fff"
                  strokeWidth={0.8}
                  className="cursor-grab"
                  style={{ pointerEvents: 'all' }}
                  onPointerDown={(e) => onHandleDrag(node.id, 'in', e)}
                />
              </>
            )}
          </g>
        );
      })}

      {/* Anchor nodes */}
      {isActive && nodes.map((node) => {
        const isSelected = selectedNodeIds.includes(node.id);
        const isHovered = hoveredNodeId === node.id;
        const r = isSelected ? nodeSize + 2 : isHovered ? nodeSize + 1 : nodeSize;
        return (
          <circle
            key={node.id}
            cx={node.position[0]}
            cy={node.position[1]}
            r={r}
            fill={isSelected ? '#fff' : pathColor}
            stroke={isSelected ? pathColor : '#fff'}
            strokeWidth={isSelected ? 2 : 1.2}
            opacity={isHovered || isSelected ? 1 : 0.85}
            className="cursor-grab"
            style={{ pointerEvents: 'all', transition: 'r 0.1s, opacity 0.1s' }}
            onMouseEnter={() => onNodeHover(node.id)}
            onMouseLeave={() => onNodeHover(null)}
            onPointerDown={(e) => onNodeDrag(node.id, e)}
          />
        );
      })}

      {/* Current position indicator on path */}
      {nodes.length >= 2 && (
        <circle
          cx={currentPos[0]}
          cy={currentPos[1]}
          r={4}
          fill="#ffcc00"
          stroke="#fff"
          strokeWidth={1.5}
          opacity={0.9}
          style={{ pointerEvents: 'none' }}
        />
      )}
    </g>
  );
}
