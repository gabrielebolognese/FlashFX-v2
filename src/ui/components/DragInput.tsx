import { useCallback, useRef, useState, useEffect } from 'react';
import { getSettingValue } from '../../settings/store';
import { useEditorStore } from '../../store/editor';
import { useHistoryStore } from '../../store/history';

/** Derived from the store so this stays in step with it (SelectionState isn't exported). */
type EditorState = ReturnType<typeof useEditorStore.getState>;
type DragSnapshot = { comp: EditorState['composition']; sel: EditorState['selection'] };

function getDragThreshold(): number {
  return getSettingValue<number>('editor.dragThreshold') ?? 3;
}

interface DragInputProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  suffix?: string;
  className?: string;
  /** Undo-history label for the single entry a drag commits on release. */
  commitLabel?: string;
}

export function DragInput({
  value,
  onChange,
  label,
  min,
  max,
  step = 1,
  precision = 2,
  suffix,
  className = '',
  commitLabel = 'Update Property',
}: DragInputProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragState = useRef({
    startX: 0,
    startValue: 0,
    accumulated: 0,
  });

  const clampValue = useCallback((v: number) => {
    let clamped = v;
    if (min !== undefined) clamped = Math.max(min, clamped);
    if (max !== undefined) clamped = Math.min(max, clamped);
    return clamped;
  }, [min, max]);

  const getMultiplier = useCallback((e: MouseEvent | PointerEvent) => {
    if (e.altKey) return step * 10;
    if (e.shiftKey) return step * 0.1;
    return step;
  }, [step]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (editing) return;
    e.preventDefault();
    e.stopPropagation();

    const startClientX = e.clientX;
    const target = e.currentTarget as HTMLElement;
    let activated = false;
    // Snapshot taken at drag activation so the whole drag collapses to one entry.
    let snapshot: DragSnapshot | null = null;

    dragState.current = {
      startX: e.clientX,
      startValue: value,
      accumulated: 0,
    };

    const handlePointerMove = (moveEvt: PointerEvent) => {
      if (!activated) {
        if (Math.abs(moveEvt.clientX - startClientX) < getDragThreshold()) return;
        activated = true;
        setDragging(true);
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        // Enter batching BEFORE the first onChange below: while isBatching, the
        // store's undoable actions apply silently (live preview) without pushing
        // a command, so a drag no longer emits one undo entry per pointermove.
        const { composition, selection } = useEditorStore.getState();
        snapshot = { comp: composition, sel: selection };
        useHistoryStore.getState().setBatching(true);
        try {
          target.requestPointerLock();
        } catch { /* pointer lock may not be available */ }
      }
      const mult = getMultiplier(moveEvt);
      dragState.current.accumulated += moveEvt.movementX * mult;
      const newValue = clampValue(dragState.current.startValue + dragState.current.accumulated);
      onChange(newValue);
    };

    const handlePointerUp = () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);

      if (activated) {
        setDragging(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        try {
          document.exitPointerLock();
        } catch { /* noop */ }
        // Leave batching FIRST, then push exactly one entry for the whole drag.
        // commitDrag no-ops when the composition is untouched (reference equality),
        // so this stays safe for DragInputs bound to non-composition state.
        useHistoryStore.getState().setBatching(false);
        if (snapshot) {
          useEditorStore.getState().commitDrag(commitLabel, snapshot.comp, snapshot.sel);
          snapshot = null;
        }
      } else {
        // No meaningful drag: treat as a click and switch to manual text entry.
        setEditing(true);
        setEditValue(formatDisplay(value, precision));
      }
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  }, [editing, value, onChange, clampValue, getMultiplier, precision, commitLabel]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditing(true);
    setEditValue(formatDisplay(value, precision));
  }, [value, precision]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitEdit = useCallback(() => {
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed)) {
      onChange(clampValue(parsed));
    }
    setEditing(false);
  }, [editValue, onChange, clampValue]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commitEdit();
    } else if (e.key === 'Escape') {
      setEditing(false);
    }
  }, [commitEdit]);

  const displayValue = formatDisplay(value, precision);

  if (editing) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        {label && <span className="text-[10px] text-slate-500 w-14 flex-shrink-0">{label}</span>}
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-[#122240] text-[11px] text-slate-200 px-1.5 py-0.5 rounded border border-[#f7b500]/50 outline-none min-w-0"
        />
        {suffix && <span className="text-[9px] text-slate-600">{suffix}</span>}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex items-center gap-1 ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {label && <span className="text-[10px] text-slate-500 w-14 flex-shrink-0">{label}</span>}
      <div
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
        className={`
          flex-1 px-1.5 py-0.5 rounded text-[11px] min-w-0 cursor-ew-resize select-none transition-colors duration-75
          ${dragging
            ? 'bg-[#f7b500]/10 text-[#ffc83d]'
            : hovered
              ? 'bg-[#122240] text-slate-200'
              : 'bg-transparent text-slate-400'
          }
        `}
        style={{ touchAction: 'none' }}
      >
        <span className={dragging ? 'text-[#ffc83d]' : ''}>{displayValue}</span>
      </div>
      {suffix && <span className="text-[9px] text-slate-600 flex-shrink-0">{suffix}</span>}
    </div>
  );
}

function formatDisplay(value: number, precision: number): string {
  if (value == null || isNaN(value)) return '0';
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(precision);
}
