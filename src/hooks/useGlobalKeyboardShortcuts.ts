import { useEffect, useCallback } from 'react';
import { DesignElement } from '../types/design';
import { createShapeAtCenter, CanvasViewport } from '../utils/canvasUtils';

interface GlobalKeyboardShortcutsProps {
  // Element management
  onAddElement: (element: DesignElement) => void;
  selectedElements: string[];
  elements: DesignElement[];
  setSelectedElements: (ids: string[]) => void;
  updateElement: (id: string, updates: Partial<DesignElement>) => void;
  duplicateElement: (id: string) => void;
  onDelete: () => void;
  onSelectAll: () => void;
  onDeselect: () => void;
  onGroup: () => void;
  onUngroup: () => void;

  // Canvas / viewport
  canvasSize: { width: number; height: number };
  viewport: CanvasViewport;
  zoom?: number;
  setZoom?: (zoom: number) => void;
  onResetZoom?: () => void;

  // Grid / snap
  snapEnabled: boolean;
  setSnapEnabled: (enabled: boolean) => void;
  gridEnabled: boolean;
  toggleGrid: () => void;

  // Nudging
  onNudge: (direction: 'up' | 'down' | 'left' | 'right', amount: number) => void;

  // History
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;

  // Export
  onExport?: () => void;

  // Animation playback (Space key)
  onTogglePlay?: () => void;

  // Timeline toggle (Ctrl+Shift+L switches to edit mode)
  onToggleTimeline?: () => void;
}

export const useGlobalKeyboardShortcuts = ({
  onAddElement,
  selectedElements,
  elements,
  setSelectedElements,
  updateElement,
  duplicateElement,
  onDelete,
  onSelectAll,
  onDeselect,
  onGroup,
  onUngroup,
  canvasSize,
  viewport,
  zoom,
  setZoom,
  onResetZoom,
  snapEnabled,
  setSnapEnabled,
  gridEnabled,
  toggleGrid,
  onNudge,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onExport,
  onTogglePlay,
  onToggleTimeline,
}: GlobalKeyboardShortcutsProps) => {

  // Returns true when the focused element is a text-entry widget.
  // Shortcuts (except Escape) must NOT fire while the user is typing.
  const isTypingInInput = useCallback((): boolean => {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      (el as HTMLElement).contentEditable === 'true' ||
      el.getAttribute('role') === 'textbox'
    );
  }, []);

  // ── Shape / element factory helpers ────────────────────────────────────────

  const createShape = useCallback((type: DesignElement['type']) => {
    const element = createShapeAtCenter(type, canvasSize, viewport);
    onAddElement(element);
    setSelectedElements([element.id]);
  }, [onAddElement, canvasSize, viewport, setSelectedElements]);

  const createLine = useCallback((mode: 'line' | 'arrow') => {
    const element = createShapeAtCenter('line', canvasSize, viewport, {
      lineType: mode,
      points: [{ x: 0, y: 0 }, { x: 200, y: 0 }],
      arrowStart: mode === 'arrow',
      arrowEnd: mode === 'arrow',
    });
    onAddElement(element);
    setSelectedElements([element.id]);
  }, [onAddElement, canvasSize, viewport, setSelectedElements]);

  const createButton = useCallback(() => {
    const element = createShapeAtCenter('button', canvasSize, viewport);
    onAddElement(element);
    setSelectedElements([element.id]);
  }, [onAddElement, canvasSize, viewport, setSelectedElements]);

  const createChatBubble = useCallback(() => {
    const element = createShapeAtCenter('chat-bubble', canvasSize, viewport);
    onAddElement(element);
    setSelectedElements([element.id]);
  }, [onAddElement, canvasSize, viewport, setSelectedElements]);

  const createChatFrame = useCallback(() => {
    const element = createShapeAtCenter('chat-frame', canvasSize, viewport);
    onAddElement(element);
    setSelectedElements([element.id]);
  }, [onAddElement, canvasSize, viewport, setSelectedElements]);

  const handleImageUpload = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    input.onchange = (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (re) => {
          const data = re.target?.result as string;
          if (!data) return;
          const img = new Image();
          img.onload = () => {
            const element = createShapeAtCenter('image' as DesignElement['type'], canvasSize, viewport, {
              name: file.name,
              imageData: data,
              originalWidth: img.naturalWidth,
              originalHeight: img.naturalHeight,
              aspectRatioLocked: true,
            });
            onAddElement(element);
            setSelectedElements([element.id]);
          };
          img.src = data;
        };
        reader.readAsDataURL(file);
      }
      document.body.removeChild(input);
    };
    document.body.appendChild(input);
    input.click();
  }, [onAddElement, canvasSize, viewport, setSelectedElements]);

  // ── Master key handler ──────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const typing = isTypingInInput();

    // Escape always fires — it cancels / deselects / closes things
    if (e.key === 'Escape') {
      e.preventDefault();
      onDeselect();
      return;
    }

    // All other shortcuts are suppressed while the user is typing
    if (typing) return;

    const { key, ctrlKey, metaKey, shiftKey, altKey } = e;
    const ctrl = ctrlKey || metaKey;

    // ── Ctrl/Cmd combos ──────────────────────────────────────────────────────
    if (ctrl) {
      switch (key.toLowerCase()) {
        // Undo / Redo
        case 'z':
          e.preventDefault();
          if (shiftKey) {
            if (canRedo !== false && onRedo) onRedo();
          } else {
            if (canUndo !== false && onUndo) onUndo();
          }
          return;

        case 'y':
          e.preventDefault();
          if (canRedo !== false && onRedo) onRedo();
          return;

        // Duplicate
        case 'd':
          e.preventDefault();
          if (selectedElements.length > 0) {
            selectedElements.forEach(id => duplicateElement(id));
          }
          return;

        // Group / Ungroup
        case 'g':
          e.preventDefault();
          if (shiftKey) {
            onUngroup();
          } else {
            onGroup();
          }
          return;

        // Select all
        case 'a':
          e.preventDefault();
          onSelectAll();
          return;

        // Export
        case 'e':
          e.preventDefault();
          if (onExport) onExport();
          return;

        // Zoom in (Ctrl++ or Ctrl+=)
        case '+':
        case '=':
          e.preventDefault();
          if (setZoom && zoom !== undefined) {
            setZoom(Math.min(3, zoom + 0.1));
          }
          return;

        // Zoom out (Ctrl+-)
        case '-':
          e.preventDefault();
          if (setZoom && zoom !== undefined) {
            setZoom(Math.max(0.1, zoom - 0.1));
          }
          return;

        // Reset zoom (Ctrl+0)
        case '0':
          e.preventDefault();
          if (onResetZoom) onResetZoom();
          return;

        // Toggle snap/grid (Ctrl+;)
        case ';':
          e.preventDefault();
          setSnapEnabled(!snapEnabled);
          return;

        // Keyframe: handled by AnimationTimeline (Ctrl+K)

        // Toggle timeline / edit mode (Ctrl+Shift+L)
        case 'l':
          if (shiftKey) {
            e.preventDefault();
            if (onToggleTimeline) onToggleTimeline();
          }
          return;
      }
    }

    // ── No-modifier shortcuts ─────────────────────────────────────────────────
    if (!ctrl && !shiftKey && !altKey) {
      switch (key.toLowerCase()) {
        // Shape creation
        case 'r':
          e.preventDefault();
          createShape('rectangle');
          return;
        case 'o':
          e.preventDefault();
          createShape('circle');
          return;
        case 't':
          e.preventDefault();
          createShape('text');
          return;
        case 'l':
          e.preventDefault();
          createLine('line');
          return;
        case 'a':
          e.preventDefault();
          createLine('arrow');
          return;
        case 'b':
          e.preventDefault();
          createButton();
          return;

        case 'i':
          e.preventDefault();
          handleImageUpload();
          return;

        // Grid toggle
        case 'g':
          e.preventDefault();
          toggleGrid();
          return;

        // Zoom (bare + / -)
        case '+':
        case '=':
          e.preventDefault();
          if (setZoom && zoom !== undefined) {
            setZoom(Math.min(3, zoom + 0.05));
          }
          return;
        case '-':
          e.preventDefault();
          if (setZoom && zoom !== undefined) {
            setZoom(Math.max(0.1, zoom - 0.05));
          }
          return;

        // Space — play/pause animation
        case ' ':
          e.preventDefault();
          if (onTogglePlay) onTogglePlay();
          return;
      }

      // Delete / Backspace
      if (key === 'Delete' || key === 'Backspace') {
        e.preventDefault();
        onDelete();
        return;
      }
    }

    // ── Arrow nudging ─────────────────────────────────────────────────────────
    if (!ctrl && selectedElements.length > 0) {
      const amount = shiftKey ? 10 : 1;
      switch (key) {
        case 'ArrowUp':
          e.preventDefault();
          onNudge('up', amount);
          return;
        case 'ArrowDown':
          e.preventDefault();
          onNudge('down', amount);
          return;
        case 'ArrowLeft':
          e.preventDefault();
          onNudge('left', amount);
          return;
        case 'ArrowRight':
          e.preventDefault();
          onNudge('right', amount);
          return;
      }
    }
  }, [
    isTypingInInput,
    onDeselect,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    selectedElements,
    duplicateElement,
    onGroup,
    onUngroup,
    onSelectAll,
    onExport,
    setZoom,
    zoom,
    onResetZoom,
    snapEnabled,
    setSnapEnabled,
    onToggleTimeline,
    createShape,
    createLine,
    createButton,
    handleImageUpload,
    toggleGrid,
    onTogglePlay,
    onDelete,
    onNudge,
  ]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
};
