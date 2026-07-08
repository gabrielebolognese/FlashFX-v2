import { useMemo, useCallback, useState, useRef } from 'react';
import { useGridStore, generateGridLines } from '../../store/grid';
import type { Guideline } from '../../store/grid';

interface GridOverlayProps {
  canvasWidth: number;
  canvasHeight: number;
  scaleX: number;
  scaleY: number;
  style?: React.CSSProperties;
}

export function GridOverlay({ canvasWidth, canvasHeight, scaleX, scaleY, style }: GridOverlayProps) {
  const grid = useGridStore((s) => s.grid);
  const guides = useGridStore((s) => s.guides);
  const moveGuideline = useGridStore((s) => s.moveGuideline);
  const removeGuideline = useGridStore((s) => s.removeGuideline);

  const gridLines = useMemo(() => {
    if (!grid.visible) return null;
    return generateGridLines(canvasWidth, canvasHeight, grid.columns, grid.rows, grid.subdivisions);
  }, [canvasWidth, canvasHeight, grid.columns, grid.rows, grid.subdivisions, grid.visible]);

  const majorVerticals = useMemo(() => {
    if (!gridLines) return [];
    const colWidth = canvasWidth / grid.columns;
    const positions: number[] = [];
    for (let i = 0; i <= grid.columns; i++) {
      positions.push(i * colWidth);
    }
    return positions;
  }, [gridLines, canvasWidth, grid.columns]);

  const majorHorizontals = useMemo(() => {
    if (!gridLines) return [];
    const rowHeight = canvasHeight / grid.rows;
    const positions: number[] = [];
    for (let i = 0; i <= grid.rows; i++) {
      positions.push(i * rowHeight);
    }
    return positions;
  }, [gridLines, canvasHeight, grid.rows]);

  return (
    <div style={style} className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Grid Lines */}
      {grid.visible && gridLines && (
        <svg className="absolute inset-0 w-full h-full" style={{ overflow: 'hidden' }}>
          {/* Subdivision lines (lighter) */}
          {grid.subdivisions > 1 && gridLines.vertical.map((x, i) => {
            if (majorVerticals.includes(x)) return null;
            return (
              <line
                key={`sv-${i}`}
                x1={x * scaleX}
                y1={0}
                x2={x * scaleX}
                y2={canvasHeight * scaleY}
                stroke={grid.color}
                strokeWidth={0.5}
                opacity={grid.opacity * 0.4}
              />
            );
          })}
          {grid.subdivisions > 1 && gridLines.horizontal.map((y, i) => {
            if (majorHorizontals.includes(y)) return null;
            return (
              <line
                key={`sh-${i}`}
                x1={0}
                y1={y * scaleY}
                x2={canvasWidth * scaleX}
                y2={y * scaleY}
                stroke={grid.color}
                strokeWidth={0.5}
                opacity={grid.opacity * 0.4}
              />
            );
          })}

          {/* Major grid lines */}
          {majorVerticals.map((x, i) => (
            <line
              key={`v-${i}`}
              x1={x * scaleX}
              y1={0}
              x2={x * scaleX}
              y2={canvasHeight * scaleY}
              stroke={grid.color}
              strokeWidth={1}
              opacity={grid.opacity}
            />
          ))}
          {majorHorizontals.map((y, i) => (
            <line
              key={`h-${i}`}
              x1={0}
              y1={y * scaleY}
              x2={canvasWidth * scaleX}
              y2={y * scaleY}
              stroke={grid.color}
              strokeWidth={1}
              opacity={grid.opacity}
            />
          ))}
        </svg>
      )}

      {/* Custom Guidelines */}
      {guides.visible && guides.guidelines.map((guide) => {
        if (!guide.visible) return null;
        return (
          <GuidelineRenderer
            key={guide.id}
            guide={guide}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            scaleX={scaleX}
            scaleY={scaleY}
            onMove={moveGuideline}
            onRemove={removeGuideline}
          />
        );
      })}
    </div>
  );
}

interface GuidelineRendererProps {
  guide: Guideline;
  canvasWidth: number;
  canvasHeight: number;
  scaleX: number;
  scaleY: number;
  onMove: (id: string, position: number) => void;
  onRemove: (id: string) => void;
}

function GuidelineRenderer({ guide, canvasWidth, canvasHeight, scaleX, scaleY, onMove, onRemove }: GuidelineRendererProps) {
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const dragRef = useRef<{ startPos: number; startMouse: number } | null>(null);

  const color = guide.color ?? '#22d3ee';
  const isVertical = guide.axis === 'vertical';

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (guide.locked) return;
    e.stopPropagation();
    e.preventDefault();
    const startMouse = isVertical ? e.clientX : e.clientY;
    dragRef.current = { startPos: guide.position, startMouse };
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [guide.locked, guide.position, isVertical]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || !dragRef.current) return;
    const currentMouse = isVertical ? e.clientX : e.clientY;
    const scale = isVertical ? scaleX : scaleY;
    const delta = (currentMouse - dragRef.current.startMouse) / scale;
    const max = isVertical ? canvasWidth : canvasHeight;
    const newPos = Math.max(0, Math.min(max, dragRef.current.startPos + delta));
    onMove(guide.id, Math.round(newPos));
  }, [dragging, isVertical, scaleX, scaleY, canvasWidth, canvasHeight, guide.id, onMove]);

  const handlePointerUp = useCallback(() => {
    setDragging(false);
    dragRef.current = null;
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(guide.id);
  }, [guide.id, onRemove]);

  if (isVertical) {
    const x = guide.position * scaleX;
    return (
      <div
        className="absolute top-0 pointer-events-auto"
        style={{
          left: x - 3,
          width: 7,
          height: '100%',
          cursor: guide.locked ? 'default' : 'ew-resize',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          className="absolute top-0 h-full transition-opacity"
          style={{
            left: 3,
            width: 1,
            background: color,
            opacity: hovered || dragging ? 0.9 : 0.6,
          }}
        />
        {(hovered || dragging) && (
          <div className="absolute top-1 -translate-x-1/2 left-[3px] px-1 py-0.5 rounded text-[8px] font-mono bg-cyan-900/90 text-cyan-200 whitespace-nowrap pointer-events-none">
            x:{Math.round(guide.position)}
          </div>
        )}
      </div>
    );
  }

  const y = guide.position * scaleY;
  return (
    <div
      className="absolute left-0 pointer-events-auto"
      style={{
        top: y - 3,
        height: 7,
        width: '100%',
        cursor: guide.locked ? 'default' : 'ns-resize',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="absolute left-0 w-full transition-opacity"
        style={{
          top: 3,
          height: 1,
          background: color,
          opacity: hovered || dragging ? 0.9 : 0.6,
        }}
      />
      {(hovered || dragging) && (
        <div className="absolute left-1 -translate-y-1/2 top-[3px] px-1 py-0.5 rounded text-[8px] font-mono bg-cyan-900/90 text-cyan-200 whitespace-nowrap pointer-events-none">
          y:{Math.round(guide.position)}
        </div>
      )}
    </div>
  );
}
