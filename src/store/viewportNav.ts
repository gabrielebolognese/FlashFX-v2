import { create } from 'zustand';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 64;
const ZOOM_SENSITIVITY = 0.003;

interface ViewportNavState {
  zoom: number;
  panX: number;
  panY: number;
  isPanning: boolean;
  /** Reported by Viewport so menu-driven fill/frame actions know the viewport size. */
  containerW: number;
  containerH: number;
  /** Canvas view toggle: outline every layer's bounding box. */
  showBoundingBoxes: boolean;
  /** Canvas view toggle: title/action safe-area guides. */
  showSafeAreas: boolean;
  /** Canvas view toggle: draw every animated layer's position path. */
  showMotionPaths: boolean;
  /** Canvas view toggle: show the selection transform gizmo (default on). */
  showLayerControls: boolean;

  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  setIsPanning: (panning: boolean) => void;
  setContainerSize: (w: number, h: number) => void;
  toggleBoundingBoxes: () => void;
  toggleSafeAreas: () => void;
  toggleMotionPaths: () => void;
  toggleLayerControls: () => void;

  zoomAtPoint: (delta: number, cursorX: number, cursorY: number, containerW: number, containerH: number) => void;
  pan: (dx: number, dy: number) => void;
  resetView: () => void;
  fitToCanvas: () => void;
  /** Cover-fit: scale so the canvas fills the whole viewport (no letterboxing). */
  fillViewport: (compW: number, compH: number) => void;
  /** Zoom + pan so a canvas-space rect fills the viewport, centered. */
  frameRect: (rx: number, ry: number, rw: number, rh: number, compW: number, compH: number) => void;
}

// baseScale mirrors Viewport.getCanvasGeometry: contain-fit inside a 24px padding.
const VIEWPORT_PADDING = 24;
function baseScaleFor(cw: number, ch: number, compW: number, compH: number): number {
  const availW = cw - VIEWPORT_PADDING * 2;
  const availH = ch - VIEWPORT_PADDING * 2;
  if (availW <= 0 || availH <= 0 || compW <= 0 || compH <= 0) return 1;
  return Math.min(availW / compW, availH / compH);
}

export const useViewportNavStore = create<ViewportNavState>((set, get) => ({
  zoom: 1,
  panX: 0,
  panY: 0,
  isPanning: false,
  containerW: 0,
  containerH: 0,
  showBoundingBoxes: false,
  showSafeAreas: false,
  showMotionPaths: false,
  showLayerControls: true,

  setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),
  setPan: (x, y) => set({ panX: x, panY: y }),
  setIsPanning: (panning) => set({ isPanning: panning }),
  setContainerSize: (w, h) => {
    const s = get();
    if (w > 0 && h > 0 && (w !== s.containerW || h !== s.containerH)) set({ containerW: w, containerH: h });
  },
  toggleBoundingBoxes: () => set({ showBoundingBoxes: !get().showBoundingBoxes }),
  toggleSafeAreas: () => set({ showSafeAreas: !get().showSafeAreas }),
  toggleMotionPaths: () => set({ showMotionPaths: !get().showMotionPaths }),
  toggleLayerControls: () => set({ showLayerControls: !get().showLayerControls }),

  zoomAtPoint: (delta, cursorX, cursorY, containerW, containerH) => {
    const { zoom, panX, panY } = get();
    const factor = Math.exp(-delta * ZOOM_SENSITIVITY);
    const newZoom = clampZoom(zoom * factor);
    const ratio = newZoom / zoom;

    const centerX = containerW / 2;
    const centerY = containerH / 2;
    const offsetX = cursorX - centerX;
    const offsetY = cursorY - centerY;

    const newPanX = panX * ratio + offsetX * (1 - ratio);
    const newPanY = panY * ratio + offsetY * (1 - ratio);

    set({ zoom: newZoom, panX: newPanX, panY: newPanY });
  },

  pan: (dx, dy) => {
    const { panX, panY } = get();
    set({ panX: panX + dx, panY: panY + dy });
  },

  resetView: () => set({ zoom: 1, panX: 0, panY: 0 }),
  fitToCanvas: () => set({ zoom: 1, panX: 0, panY: 0 }),

  fillViewport: (compW, compH) => {
    const { containerW: cw, containerH: ch } = get();
    if (cw <= 0 || ch <= 0) return;
    const base = baseScaleFor(cw, ch, compW, compH);
    const cover = Math.max(cw / compW, ch / compH);
    set({ zoom: clampZoom(cover / base), panX: 0, panY: 0 });
  },

  frameRect: (rx, ry, rw, rh, compW, compH) => {
    const { containerW: cw, containerH: ch } = get();
    if (cw <= 0 || ch <= 0 || rw <= 0 || rh <= 0) return;
    const base = baseScaleFor(cw, ch, compW, compH);
    const availW = cw - VIEWPORT_PADDING * 2;
    const availH = ch - VIEWPORT_PADDING * 2;
    const targetEff = Math.min(availW / rw, availH / rh);
    const zoom = clampZoom(targetEff / base);
    const eff = base * zoom;
    const rcx = rx + rw / 2;
    const rcy = ry + rh / 2;
    // pan so the rect center maps to the viewport center (see Viewport.getCanvasGeometry).
    set({ zoom, panX: eff * (compW / 2 - rcx), panY: eff * (compH / 2 - rcy) });
  },
}));

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}
