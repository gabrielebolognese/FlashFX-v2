import { useEffect } from 'react';

interface KeyboardShortcutsProps {
  onUndo: () => void;
  onRedo: () => void;
  onDuplicate: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onDelete: () => void;
  onNudge: (direction: 'up' | 'down' | 'left' | 'right', amount: number) => void;
  onSelectAll: () => void;
  onExport: () => void;
  onDeselect: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export const useKeyboardShortcuts = ({
  onUndo,
  onRedo,
  onDuplicate,
  onGroup,
  onUngroup,
  onDelete,
  onNudge,
  onSelectAll,
  onExport,
  onDeselect,
  canUndo,
  canRedo
}: KeyboardShortcutsProps) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const { ctrlKey, metaKey, shiftKey, key } = e;
      const isModifierPressed = ctrlKey || metaKey;

      switch (key.toLowerCase()) {
        case 'z':
          if (isModifierPressed) {
            e.preventDefault();
            if (shiftKey && canRedo) {
              onRedo();
            } else if (!shiftKey && canUndo) {
              onUndo();
            }
          }
          break;

        case 'y':
          if (isModifierPressed && canRedo) {
            e.preventDefault();
            onRedo();
          }
          break;

        case 'd':
          if (isModifierPressed) {
            e.preventDefault();
            onDuplicate();
          }
          break;

        case 'g':
          if (isModifierPressed) {
            e.preventDefault();
            if (shiftKey) {
              onUngroup();
            } else {
              onGroup();
            }
          }
          break;

        case 'delete':
        case 'backspace':
          if (!isModifierPressed) {
            e.preventDefault();
            onDelete();
          }
          break;

        case 'arrowup':
          e.preventDefault();
          onNudge('up', shiftKey ? 10 : 1);
          break;

        case 'arrowdown':
          e.preventDefault();
          onNudge('down', shiftKey ? 10 : 1);
          break;

        case 'arrowleft':
          e.preventDefault();
          onNudge('left', shiftKey ? 10 : 1);
          break;

        case 'arrowright':
          e.preventDefault();
          onNudge('right', shiftKey ? 10 : 1);
          break;

        case 'a':
          if (isModifierPressed) {
            e.preventDefault();
            onSelectAll();
          }
          break;

        case 'e':
          if (isModifierPressed) {
            e.preventDefault();
            onExport();
          }
          break;

        case 'escape':
          e.preventDefault();
          onDeselect();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    onUndo, onRedo, onDuplicate, onGroup, onUngroup, onDelete,
    onNudge, onSelectAll, onExport, onDeselect, canUndo, canRedo
  ]);
};