import { useEffect, useLayoutEffect, useRef } from 'react';
import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import { useTextEditStore } from '../../store/textEdit';
import { evaluateNumber, evaluateVec2 } from '../../core/interpolation';
import { getWorldPosition } from '../../core/sceneGraph';
import type { Vec4 } from '../../core/types';

interface TextEditOverlayProps {
  style?: React.CSSProperties;
  compW: number;
  compH: number;
}

function rgba(c: Vec4): string {
  const r = Math.round(Math.max(0, Math.min(1, c[0])) * 255);
  const g = Math.round(Math.max(0, Math.min(1, c[1])) * 255);
  const b = Math.round(Math.max(0, Math.min(1, c[2])) * 255);
  return `rgba(${r}, ${g}, ${b}, ${c[3]})`;
}

/**
 * On-canvas text editor. When a text layer is being edited (`useTextEditStore`), a live
 * textarea is positioned over it, styled to approximate the rendered text, and the
 * renderer hides the layer so the two don't overlap. Typing updates the layer live;
 * Escape / blur commits (Enter inserts a newline — text can be multi-line).
 */
export function TextEditOverlay({ style, compW, compH }: TextEditOverlayProps) {
  const editingLayerId = useTextEditStore((s) => s.editingLayerId);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const layer = useEditorStore((s) =>
    editingLayerId ? s.composition.layers.find((l) => l.id === editingLayerId) : undefined,
  );
  const layers = useEditorStore((s) => s.composition.layers);
  const updateTextLive = useEditorStore((s) => s.updateTextLive);
  const commitTextEdit = useEditorStore((s) => s.commitTextEdit);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const committedRef = useRef(false);

  const isText = layer?.type === 'text';

  // Focus the textarea when an edit session begins.
  useLayoutEffect(() => {
    if (!editingLayerId || !isText) return;
    committedRef.current = false;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [editingLayerId, isText]);

  // Safety: if the layer vanished (deleted elsewhere) mid-edit, close the session.
  useEffect(() => {
    if (editingLayerId && !isText) {
      useTextEditStore.getState().stopEditing();
    }
  }, [editingLayerId, isText]);

  if (!editingLayerId || !layer || layer.type !== 'text' || !style) return null;

  const overlayWidth = Number(style.width) || 0;
  const overlayHeight = Number(style.height) || 0;
  if (overlayWidth <= 0 || overlayHeight <= 0) return null;

  const scaleX = overlayWidth / compW;
  const scaleY = overlayHeight / compH;

  const world = getWorldPosition(layer, layers, currentFrame);
  const sc = evaluateVec2(layer.transform.scale, currentFrame);
  const sx = sc[0] || 1;
  const sy = sc[1] || 1;

  const span = layer.content.spans[0];
  const fontComp = evaluateNumber(layer.animOverrides.fontSize, currentFrame) * Math.abs(sy);

  // Editing box in composition units.
  const bb = layer.layoutConfig.boundingBox;
  let boxWComp: number;
  let boxHComp: number;
  if (bb.type === 'fixed') {
    boxWComp = bb.width * Math.abs(sx);
    boxHComp = bb.height * Math.abs(sy);
  } else if (bb.type === 'fixedWidth') {
    boxWComp = bb.width * Math.abs(sx);
    boxHComp = Math.max(fontComp * 1.6, fontComp);
  } else {
    // Auto / point text — grow a comfortable default around the caret.
    boxWComp = Math.max(fontComp * 8, 60);
    boxHComp = Math.max(fontComp * 1.6, fontComp);
  }

  const leftPx = world[0] * scaleX - (boxWComp * scaleX) / 2;
  const topPx = world[1] * scaleY - (boxHComp * scaleY) / 2;
  const widthPx = boxWComp * scaleX;
  const heightPx = boxHComp * scaleY;
  const fontSizePx = fontComp * scaleY;

  const align = layer.layoutConfig.horizontalAlign;
  const cssAlign: React.CSSProperties['textAlign'] =
    align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const { editingLayerId: id, justCreated } = useTextEditStore.getState();
    if (id) commitTextEdit(id, justCreated);
    useTextEditStore.getState().stopEditing();
  };

  return (
    <div style={{ ...style, zIndex: 60, pointerEvents: 'none' }}>
      <textarea
        ref={textareaRef}
        value={span?.text ?? ''}
        placeholder="Type…"
        spellCheck={false}
        onChange={(e) => updateTextLive(layer.id, e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          // Keep editor keystrokes out of the app's global shortcuts (space=play, etc.).
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          }
        }}
        onKeyUp={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          left: leftPx,
          top: topPx,
          width: Math.max(widthPx, 12),
          height: Math.max(heightPx, fontSizePx * 1.2),
          margin: 0,
          padding: 0,
          border: '1px dashed rgba(120, 170, 255, 0.9)',
          outline: 'none',
          background: 'transparent',
          resize: 'none',
          overflow: 'hidden',
          boxSizing: 'border-box',
          pointerEvents: 'auto',
          color: span ? rgba(span.style.color) : '#fff',
          caretColor: span ? rgba(span.style.color) : '#fff',
          fontFamily: span?.style.fontFamily ?? 'sans-serif',
          fontWeight: span?.style.fontWeight ?? 400,
          fontStyle: span?.style.fontStyle ?? 'normal',
          fontSize: `${Math.max(fontSizePx, 6)}px`,
          lineHeight: span?.style.lineHeight ?? 1.2,
          letterSpacing: `${(span?.style.letterSpacing ?? 0) * scaleX}px`,
          textAlign: cssAlign,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      />
    </div>
  );
}
