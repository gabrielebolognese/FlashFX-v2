import { create } from 'zustand';

export type ShapeToolType = 'rectangle' | 'circle' | 'star' | 'polygon';
export type VectorToolType = 'pen' | 'pencil' | 'directSelect' | 'addPoint' | 'deletePoint' | 'convertPoint' | 'bend';
export type ToolMode = 'select' | 'text' | ShapeToolType | VectorToolType;

interface ShapeToolState {
  activeTool: ToolMode;
  setActiveTool: (tool: ToolMode) => void;
  clearTool: () => void;
}

export const useShapeToolStore = create<ShapeToolState>((set) => ({
  activeTool: 'select',
  setActiveTool: (tool) => set({ activeTool: tool }),
  clearTool: () => set({ activeTool: 'select' }),
}));

export function isTextTool(tool: ToolMode): tool is 'text' {
  return tool === 'text';
}

export function isShapeTool(tool: ToolMode): tool is ShapeToolType {
  return tool === 'rectangle' || tool === 'circle' || tool === 'star' || tool === 'polygon';
}

export function isVectorTool(tool: ToolMode): tool is VectorToolType {
  return (
    tool === 'pen' ||
    tool === 'pencil' ||
    tool === 'directSelect' ||
    tool === 'addPoint' ||
    tool === 'deletePoint' ||
    tool === 'convertPoint' ||
    tool === 'bend'
  );
}
