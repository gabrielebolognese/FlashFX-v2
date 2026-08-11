import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editor';
import { useShapeToolStore, isTextTool } from '../../store/shapeTool';
import { useTextEditStore } from '../../store/textEdit';

interface TextCreationOverlayProps {
  style?: React.CSSProperties;
  compW: number;
  compH: number;
}

interface DragState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

const MIN_DRAG_PX = 6;

function getBox(drag: DragState) {
  const dx = drag.currentX - drag.startX;
  const dy = drag.currentY - drag.startY;
  const x = Math.min(drag.startX, drag.startX + dx);
  const y = Math.min(drag.startY, drag.startY + dy);
  return { x, y, w: Math.abs(dx), h: Math.abs(dy) };
}

/**
 * Text tool: drag out a box (like the shape tools) to make a fixed paragraph frame, or
 * click for an auto-growing point text. Either way an EMPTY text layer is created and
 * on-canvas editing starts immediately — the user types straight onto the canvas.
 */
export function TextCreationOverlay({ style, compW, compH }: TextCreationOverlayProps) {
  const activeTool = useShapeToolStore((s) => s.activeTool);
  const createTextAt = useEditorStore((s) => s.createTextAt);
  const startEditing = useTextEditStore((s) => s.startEditing);

  const [drag, setDrag] = useState<DragState | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const active = isTextTool(activeTool);

  // ESC exits text-creation mode.
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
    setDrag({ startX: x, startY: y, currentX: x, currentY: y });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setDrag({ ...drag, currentX: e.clientX - rect.left, currentY: e.clientY - rect.top });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* pointer already released */ }

    const box = getBox(drag);
    setDrag(null);
    if (overlayWidth <= 0 || overlayHeight <= 0) return;

    const isDrag = box.w >= MIN_DRAG_PX && box.h >= MIN_DRAG_PX;
    let id: string;
    if (isDrag) {
      const compX = ((box.x + box.w / 2) / overlayWidth) * compW;
      const compY = ((box.y + box.h / 2) / overlayHeight) * compH;
      const cw = (box.w / overlayWidth) * compW;
      const ch = (box.h / overlayHeight) * compH;
      id = createTextAt(compX, compY, { width: cw, height: ch });
    } else {
      // Click → point text at the click position.
      const compX = (box.x / overlayWidth) * compW;
      const compY = (box.y / overlayHeight) * compH;
      id = createTextAt(compX, compY, null);
    }
    // Hand off to the select tool + open the on-canvas editor for the fresh text.
    useShapeToolStore.getState().clearTool();
    startEditing(id, true);
  };

  const previewBox = drag ? getBox(drag) : null;
  const showPreview = previewBox && previewBox.w >= 1 && previewBox.h >= 1;
  const labelW = previewBox && overlayWidth > 0 ? Math.round((previewBox.w / overlayWidth) * compW) : 0;
  const labelH = previewBox && overlayHeight > 0 ? Math.round((previewBox.h / overlayHeight) * compH) : 0;

  return (
    <div
      ref={overlayRef}
      style={{
        ...style,
        cursor: 'text',
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
          <rect
            x={previewBox.x} y={previewBox.y} width={previewBox.w} height={previewBox.h}
            fill="rgba(120, 170, 255, 0.08)"
            stroke="rgba(120, 170, 255, 0.9)"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
          <g transform={`translate(${previewBox.x + previewBox.w + 8}, ${previewBox.y + previewBox.h + 16})`}>
            <rect
              x={-4} y={-12} rx={3} ry={3}
              width={String(labelW).length * 7 + String(labelH).length * 7 + 30}
              height={18}
              fill="rgba(20, 24, 33, 0.9)"
              stroke="rgba(120, 170, 255, 0.5)"
              strokeWidth={0.5}
            />
            <text x={0} y={1} fill="#7aaaff" style={{ fontSize: 10, fontFamily: 'ui-monospace, monospace', fontWeight: 500 }}>
              {labelW} × {labelH}
            </text>
          </g>
        </svg>
      )}
    </div>
  );
}
