import { create } from 'zustand';
import type { MotionPath, MotionPathNode, MotionPathAnchor, MotionPathLoop, Vec2 } from '../core/types';
import { uid } from '../core/factory';
import { createProperty } from '../core/factory';

export type PathEditMode = 'idle' | 'creating' | 'editing';

interface MotionPathState {
  editMode: PathEditMode;
  activePathId: string | null;
  selectedNodeIds: string[];
  hoveredNodeId: string | null;
  hoveredSegmentIndex: number | null;
  previewPosition: Vec2 | null;

  setEditMode: (mode: PathEditMode) => void;
  setActivePathId: (id: string | null) => void;
  selectNode: (id: string, additive?: boolean) => void;
  deselectNodes: () => void;
  setHoveredNode: (id: string | null) => void;
  setHoveredSegment: (index: number | null) => void;
  setPreviewPosition: (pos: Vec2 | null) => void;
}

export const useMotionPathStore = create<MotionPathState>((set) => ({
  editMode: 'idle',
  activePathId: null,
  selectedNodeIds: [],
  hoveredNodeId: null,
  hoveredSegmentIndex: null,
  previewPosition: null,

  setEditMode: (mode) => set({ editMode: mode }),
  setActivePathId: (id) => set({ activePathId: id }),
  selectNode: (id, additive) =>
    set((s) => ({
      selectedNodeIds: additive
        ? s.selectedNodeIds.includes(id)
          ? s.selectedNodeIds.filter((n) => n !== id)
          : [...s.selectedNodeIds, id]
        : [id],
    })),
  deselectNodes: () => set({ selectedNodeIds: [] }),
  setHoveredNode: (id) => set({ hoveredNodeId: id }),
  setHoveredSegment: (index) => set({ hoveredSegmentIndex: index }),
  setPreviewPosition: (pos) => set({ previewPosition: pos }),
}));

export function createMotionPath(layerId: string, durationFrames: number): MotionPath {
  const progressProp = createProperty('Path Progress', 'number', 0);
  progressProp.keyframes = [
    { frame: 0, value: 0, interpolation: 'linear', handleIn: [0.75, 0.75], handleOut: [0.25, 0.25] },
    { frame: durationFrames - 1, value: 100, interpolation: 'linear', handleIn: [0.75, 0.75], handleOut: [0.25, 0.25] },
  ];

  return {
    id: uid(),
    layerId,
    nodes: [],
    closed: false,
    anchor: 'center',
    customAnchor: [0, 0],
    orientToPath: false,
    loop: 'none',
    progress: progressProp,
  };
}

export function createMotionPathNode(position: Vec2, vertexType: 'corner' | 'smooth' | 'bezier' = 'corner'): MotionPathNode {
  return {
    id: uid(),
    position,
    handleIn: [0, 0],
    handleOut: [0, 0],
    vertexType,
  };
}
