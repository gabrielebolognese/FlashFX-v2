/**
 * CanvasEngine — Imperative rendering engine, completely outside React's render cycle.
 *
 * Architecture:
 *   React mounts element wrapper divs and registers their DOM nodes here via
 *   `registerWrapper()`. After registration, this engine is the sole authority over
 *   visual position during drag, resize, and rotation interactions.
 *
 *   During interaction:
 *     - CSS `transform: translate()` / direct style writes are applied to DOM nodes
 *       inside this engine's methods. Zero React setState calls are made.
 *     - The engine emits `elementUpdated` events throttled to one per animation frame
 *       so the properties panel can show live coordinates without causing canvas re-renders.
 *
 *   On interaction end:
 *     - The element component calls its `onUpdate` prop exactly once with the final
 *       computed position. This triggers one React render and one history push.
 *
 *   React rule: NOTHING in this file may import React or call React APIs.
 *   This file must remain a pure TypeScript class with no framework dependencies.
 */

export interface ElementTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface EngineEventMap {
  elementUpdated: { id: string; x?: number; y?: number; width?: number; height?: number; rotation?: number };
  selectionChanged: { ids: string[] };
  viewportChanged: { zoom: number; panX: number; panY: number };
  elementsListChanged: { ids: string[] };
}

type EngineEventHandler<K extends keyof EngineEventMap> = (data: EngineEventMap[K]) => void;

class CanvasEngineClass {
  /** Registered outer wrapper DOM nodes, keyed by element ID */
  private wrapperNodes = new Map<string, HTMLElement>();

  /** Pending throttled event payload — only the last value per frame is emitted */
  private pendingElementUpdate: EngineEventMap['elementUpdated'] | null = null;
  private pendingSelectionChange: EngineEventMap['selectionChanged'] | null = null;
  private rafId: number | null = null;

  /** Typed event listener registry */
  private listeners: { [K in keyof EngineEventMap]?: Set<EngineEventHandler<K>> } = {};

  // ---------------------------------------------------------------------------
  // DOM node registration
  // ---------------------------------------------------------------------------

  /**
   * Called by each EnhancedDesignElementComponent on mount.
   * The `node` is the outermost wrapper div that receives CSS translate during drag.
   */
  registerWrapper(id: string, node: HTMLElement): void {
    this.wrapperNodes.set(id, node);
  }

  /**
   * Called by each EnhancedDesignElementComponent on unmount.
   */
  unregisterWrapper(id: string): void {
    this.wrapperNodes.delete(id);
  }

  // ---------------------------------------------------------------------------
  // Imperative transform application (zero React involvement)
  // ---------------------------------------------------------------------------

  /**
   * Apply a CSS translate to an element's wrapper node.
   * This visually moves the element without any React state change.
   * @param id      Element ID
   * @param dx      Delta X in canvas-space pixels
   * @param dy      Delta Y in canvas-space pixels
   */
  applyTranslate(id: string, dx: number, dy: number): void {
    const node = this.wrapperNodes.get(id);
    if (node) {
      node.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }

  /**
   * Reset the CSS transform on an element's wrapper node back to identity.
   * Called once on drag/resize end before committing the final position to React.
   */
  resetTranslate(id: string): void {
    const node = this.wrapperNodes.get(id);
    if (node) {
      node.style.transform = '';
    }
  }

  /**
   * Reset all registered element transforms. Safety call on canvas reset.
   */
  resetAllTranslates(): void {
    this.wrapperNodes.forEach((node) => {
      node.style.transform = '';
    });
  }

  // ---------------------------------------------------------------------------
  // Throttled event emission (max one event per animation frame)
  // ---------------------------------------------------------------------------

  /**
   * Queue a property update for emission on the next animation frame.
   * Multiple calls within the same frame are collapsed into one.
   * The properties panel subscribes to `elementUpdated` to update coordinate display.
   */
  queueElementUpdate(data: EngineEventMap['elementUpdated']): void {
    this.pendingElementUpdate = data;
    this.scheduleFlush();
  }

  /**
   * Queue a selection change event for emission on the next animation frame.
   */
  queueSelectionChange(data: EngineEventMap['selectionChanged']): void {
    this.pendingSelectionChange = data;
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(this.flush);
    }
  }

  private flush = (): void => {
    this.rafId = null;

    if (this.pendingElementUpdate) {
      this.emit('elementUpdated', this.pendingElementUpdate);
      this.pendingElementUpdate = null;
    }

    if (this.pendingSelectionChange) {
      this.emit('selectionChanged', this.pendingSelectionChange);
      this.pendingSelectionChange = null;
    }
  };

  // ---------------------------------------------------------------------------
  // Typed event emitter
  // ---------------------------------------------------------------------------

  on<K extends keyof EngineEventMap>(event: K, handler: EngineEventHandler<K>): void {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set() as any;
    }
    (this.listeners[event] as Set<EngineEventHandler<K>>).add(handler);
  }

  off<K extends keyof EngineEventMap>(event: K, handler: EngineEventHandler<K>): void {
    (this.listeners[event] as Set<EngineEventHandler<K>> | undefined)?.delete(handler);
  }

  emit<K extends keyof EngineEventMap>(event: K, data: EngineEventMap[K]): void {
    (this.listeners[event] as Set<EngineEventHandler<K>> | undefined)?.forEach((h) => h(data));
  }
}

/** Singleton engine instance — one per application session */
export const canvasEngine = new CanvasEngineClass();
