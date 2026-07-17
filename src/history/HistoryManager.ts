import { DesignElement } from '../types/design';

// Only 'elements' snapshots are used; the per-property variants were never dispatched.
export type ElementsSnapshot = { elements: DesignElement[] };

type ActionSnapshot = { kind: 'elements' } & ElementsSnapshot;

export type TargetType = 'shape' | 'elements';

export interface HistoryEntry {
  id: string;
  label: string;
  timestamp: number;
  targetId: string;
  targetType: TargetType;
  before: ActionSnapshot;
  after: ActionSnapshot;
}

export type UndoRedoHandler = (entry: HistoryEntry, direction: 'undo' | 'redo') => void;

const MAX_HISTORY = 100;

class HistoryManager {
  private stack: HistoryEntry[] = [];
  private index: number = -1;
  private pendingBefore: ActionSnapshot | null = null;
  private pendingTargetId: string = '';
  private pendingTargetType: TargetType = 'shape';
  private pendingLabel: string = '';
  private handler: UndoRedoHandler | null = null;
  private changeListeners: Array<() => void> = [];

  setHandler(handler: UndoRedoHandler): void {
    this.handler = handler;
  }

  onChange(listener: () => void): () => void {
    this.changeListeners.push(listener);
    return () => {
      this.changeListeners = this.changeListeners.filter(l => l !== listener);
    };
  }

  private notify(): void {
    for (const l of this.changeListeners) l();
  }

  beginAction(targetId: string, targetType: TargetType, label: string, before: ActionSnapshot): void {
    this.pendingTargetId = targetId;
    this.pendingTargetType = targetType;
    this.pendingLabel = label;
    this.pendingBefore = before;
  }

  commitAction(after: ActionSnapshot): void {
    if (!this.pendingBefore) return;
    if (snapshotsEqual(this.pendingBefore, after)) {
      this.pendingBefore = null;
      return;
    }

    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label: this.pendingLabel,
      timestamp: Date.now(),
      targetId: this.pendingTargetId,
      targetType: this.pendingTargetType,
      before: this.pendingBefore,
      after,
    };

    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push(entry);
    if (this.stack.length > MAX_HISTORY) {
      this.stack.shift();
    } else {
      this.index++;
    }

    this.pendingBefore = null;
    this.notify();
  }

  cancelAction(): void {
    this.pendingBefore = null;
  }

  undo(): void {
    if (!this.canUndo) return;
    const entry = this.stack[this.index];
    this.index--;
    this.handler?.(entry, 'undo');
    this.notify();
  }

  redo(): void {
    if (!this.canRedo) return;
    this.index++;
    const entry = this.stack[this.index];
    this.handler?.(entry, 'redo');
    this.notify();
  }

  get canUndo(): boolean {
    return this.index >= 0;
  }

  get canRedo(): boolean {
    return this.index < this.stack.length - 1;
  }

  clear(): void {
    this.stack = [];
    this.index = -1;
    this.pendingBefore = null;
    this.notify();
  }
}

function snapshotsEqual(a: ActionSnapshot, b: ActionSnapshot): boolean {
  return JSON.stringify(a.elements) === JSON.stringify(b.elements);
}

export const historyManager = new HistoryManager();
