import { create } from 'zustand';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 64;
const ZOOM_SENSITIVITY = 0.003;

interface ViewportNavState {
  zoom: number;
  panX: number;
  panY: number;
  isPanning: boolean;

  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  setIsPanning: (panning: boolean) => void;

  zoomAtPoint: (delta: number, cursorX: number, cursorY: number, containerW: number, containerH: number) => void;
  pan: (dx: number, dy: number) => void;
  resetView: () => void;
  fitToCanvas: () => void;
}

export const useViewportNavStore = create<ViewportNavState>((set, get) => ({
  zoom: 1,
  panX: 0,
  panY: 0,
  isPanning: false,

  setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),
  setPan: (x, y) => set({ panX: x, panY: y }),
  setIsPanning: (panning) => set({ isPanning: panning }),

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
}));

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}
