import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editor';
import { useShapeToolStore, isShapeTool, type ShapeToolType } from '../../store/shapeTool';

interface ShapeCreationOverlayProps {
  style?: React.CSSProperties;
  compW: number;
  compH: number;
}

interface DragState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  shiftHeld: boolean;
}

const MIN_DRAG_PX = 4;

function getBox(drag: DragState) {
  let dx = drag.currentX - drag.startX;
  let dy = drag.currentY - drag.startY;

  if (drag.shiftHeld) {
    // Constrain to square
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * m;
    dy = Math.sign(dy || 1) * m;
  }

  const x = Math.min(drag.startX, drag.startX + dx);
  const y = Math.min(drag.startY, drag.startY + dy);
  return { x, y, w: Math.abs(dx), h: Math.abs(dy) };
}

function PreviewShape({ tool, x, y, w, h }: { tool: ShapeToolType; x: number; y: number; w: number; h: number }) {
  const fill = 'rgba(180, 180, 180, 0.18)';
  const stroke = 'rgba(220, 220, 220, 0.85)';
  const shadow = 'drop-shadow(0 1px 3px rgba(0,0,0,0.35))';

  if (tool === 'rectangle') {
    return (
      <rect
        x={x} y={y} width={w} height={h}
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
        strokeDasharray="4 3"
        style={{ filter: shadow }}
      />
    );
  }

  if (tool === 'circle') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    return (
      <ellipse
        cx={cx} cy={cy} rx={w / 2} ry={h / 2}
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
        strokeDasharray="4 3"
        style={{ filter: shadow }}
      />
    );
  }

  if (tool === 'star') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const outerRX = w / 2;
    const outerRY = h / 2;
    const innerRX = outerRX * 0.4;
    const innerRY = outerRY * 0.4;
    const points: string[] = [];
    const count = 5;
    for (let i = 0; i < count * 2; i++) {
      const angle = (i / (count * 2)) * Math.PI * 2 - Math.PI / 2;
      const isOuter = i % 2 === 0;
      const px = cx + Math.cos(angle) * (isOuter ? outerRX : innerRX);
      const py = cy + Math.sin(angle) * (isOuter ? outerRY : innerRY);
      points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
    }
    return (
      <polygon
        points={points.join(' ')}
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
        strokeDasharray="4 3"
        style={{ filter: shadow }}
      />
    );
  }

  // polygon -> rectangular polygon (4 corners by default, matches finalized layer)
  return (
    <polygon
      points={`${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`}
      fill={fill}
      stroke={stroke}
      strokeWidth={1}
      strokeDasharray="4 3"
      style={{ filter: shadow }}
    />
  );
}

export function ShapeCreationOverlay({ style, compW, compH }: ShapeCreationOverlayProps) {
  const activeTool = useShapeToolStore((s) => s.activeTool);
  const addShapeWithDimensions = useEditorStore((s) => s.addShapeWithDimensions);

  const [drag, setDrag] = useState<DragState | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const active = isShapeTool(activeTool);

  // ESC cancels current drag and exits shape-creation mode.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrag(null);
        useShapeToolStore.getState().clearTool();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  if (!active || !style) return null;

  const overlayWidth = Number(style.width) || 0;
  const overlayHeight = Number(style.height) || 0;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDrag({ startX: x, startY: y, currentX: x, currentY: y, shiftHeld: e.shiftKey });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDrag({ ...drag, currentX: x, currentY: y, shiftHeld: e.shiftKey });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    const box = getBox(drag);
    setDrag(null);

    if (box.w < MIN_DRAG_PX || box.h < MIN_DRAG_PX) {
      // Below minimum: treat as accidental click — no shape created.
      return;
    }
    if (overlayWidth <= 0 || overlayHeight <= 0) return;

    // Convert from screen-overlay pixels to composition coordinates.
    const compX = ((box.x + box.w / 2) / overlayWidth) * compW;
    const compY = ((box.y + box.h / 2) / overlayHeight) * compH;
    const cw = (box.w / overlayWidth) * compW;
    const ch = (box.h / overlayHeight) * compH;

    addShapeWithDimensions(activeTool, compX, compY, cw, ch);
    // Tool stays active for rapid creation (Figma/Illustrator style).
  };

  const previewBox = drag ? getBox(drag) : null;
  const showPreview = previewBox && previewBox.w >= 1 && previewBox.h >= 1;

  // Composition-space dimension labels
  const labelW = previewBox && overlayWidth > 0 ? Math.round((previewBox.w / overlayWidth) * compW) : 0;
  const labelH = previewBox && overlayHeight > 0 ? Math.round((previewBox.h / overlayHeight) * compH) : 0;

  return (
    <div
      ref={overlayRef}
      style={{
        ...style,
        cursor: 'crosshair',
        zIndex: 50,
        userSelect: 'none',
        touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {showPreview && previewBox && (
        <svg
          width={overlayWidth}
          height={overlayHeight}
          style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible' }}
        >
          <PreviewShape
            tool={activeTool}
            x={previewBox.x}
            y={previewBox.y}
            w={previewBox.w}
            h={previewBox.h}
          />

          {/* Bounding box guide for non-rectangle previews */}
          {activeTool !== 'rectangle' && (
            <rect
              x={previewBox.x}
              y={previewBox.y}
              width={previewBox.w}
              height={previewBox.h}
              fill="none"
              stroke="rgba(255, 204, 0, 0.5)"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
          )}

          {/* Dimension label */}
          <g transform={`translate(${previewBox.x + previewBox.w + 8}, ${previewBox.y + previewBox.h + 16})`}>
            <rect
              x={-4} y={-12} rx={3} ry={3}
              width={String(labelW).length * 7 + String(labelH).length * 7 + 30}
              height={18}
              fill="rgba(20, 24, 33, 0.9)"
              stroke="rgba(255, 204, 0, 0.5)"
              strokeWidth={0.5}
            />
            <text
              x={0} y={1}
              fill="#ffcc00"
              style={{ fontSize: 10, fontFamily: 'ui-monospace, monospace', fontWeight: 500 }}
            >
              {labelW} × {labelH}
            </text>
          </g>
        </svg>
      )}
    </div>
  );
}
