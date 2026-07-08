import { create } from 'zustand';

export interface ShapeDefaultsState {
  fillColor: [number, number, number, number];
  strokeColor: [number, number, number, number];
  setFillColor: (color: [number, number, number, number]) => void;
  setStrokeColor: (color: [number, number, number, number]) => void;
}

export const useShapeDefaultsStore = create<ShapeDefaultsState>((set) => ({
  fillColor: [0.7, 0.7, 0.7, 1],
  strokeColor: [0.4, 0.4, 0.4, 1],
  setFillColor: (color) => set({ fillColor: color }),
  setStrokeColor: (color) => set({ strokeColor: color }),
}));
