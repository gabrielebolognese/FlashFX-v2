import { useState, useCallback, useEffect, useRef } from 'react';
import { DesignElement } from '../types/design';
import { historyManager, HistoryEntry } from '../history/HistoryManager';

export interface CanvasState {
  elements: DesignElement[];
  selectedElements: string[];
}

export const useCanvasHistory = (initialState: CanvasState) => {
  const [currentState, setCurrentState] = useState<CanvasState>(initialState);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const currentStateRef = useRef(currentState);
  currentStateRef.current = currentState;

  useEffect(() => {
    // Only 'elements' snapshots are ever committed; handler restores full element array.
    historyManager.setHandler((entry: HistoryEntry, direction: 'undo' | 'redo') => {
      const snapshot = direction === 'undo' ? entry.before : entry.after;
      setCurrentState(prev => ({ ...prev, elements: snapshot.elements }));
    });

    const unsubscribe = historyManager.onChange(() => {
      setCanUndo(historyManager.canUndo);
      setCanRedo(historyManager.canRedo);
    });

    return unsubscribe;
  }, []);

  const pushToHistory = useCallback((newState: CanvasState) => {
    const before = currentStateRef.current.elements;
    historyManager.beginAction('__bulk__', 'elements', 'Change', {
      kind: 'elements',
      elements: before,
    });
    historyManager.commitAction({ kind: 'elements', elements: newState.elements });
    setCurrentState(newState);
  }, []);

  const undo = useCallback(() => {
    historyManager.undo();
  }, []);

  const redo = useCallback(() => {
    historyManager.redo();
  }, []);

  return {
    currentState,
    pushToHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    setCurrentState,
  };
};
