import { useState, useCallback, useEffect } from 'react';

export interface GridSettings {
  enabled: boolean;
  snapEnabled: boolean;
  rows: number;
  columns: number;
  color: string;
  opacity: number;
  showCenterPoint: boolean;
}

export interface GridCalculations {
  cellWidth: number;
  cellHeight: number;
  snapToGrid: (x: number, y: number) => { x: number; y: number };
  snapSizeToGrid: (width: number, height: number) => { width: number; height: number };
}

const DEFAULT_GRID_SETTINGS: GridSettings = {
  enabled: true,
  snapEnabled: true,
  rows: 12,
  columns: 16,
  color: '#FFD700',
  opacity: 0.3,
  showCenterPoint: false
};

export const useGridSystem = (canvasSize: { width: number; height: number }) => {
  const [gridSettings, setGridSettings] = useState<GridSettings>(() => {
    const saved = localStorage.getItem('flashfx-grid-settings');
    return saved ? { ...DEFAULT_GRID_SETTINGS, ...JSON.parse(saved) } : DEFAULT_GRID_SETTINGS;
  });

  // Save to localStorage whenever settings change
  useEffect(() => {
    localStorage.setItem('flashfx-grid-settings', JSON.stringify(gridSettings));
  }, [gridSettings]);

  const gridCalculations: GridCalculations = {
    cellWidth: canvasSize.width / gridSettings.columns,
    cellHeight: canvasSize.height / gridSettings.rows,
    
    snapToGrid: useCallback((x: number, y: number) => {
      if (!gridSettings.snapEnabled) return { x, y };
      
      const cellWidth = canvasSize.width / gridSettings.columns;
      const cellHeight = canvasSize.height / gridSettings.rows;
      
      return {
        x: Math.round(x / cellWidth) * cellWidth,
        y: Math.round(y / cellHeight) * cellHeight
      };
    }, [gridSettings.snapEnabled, gridSettings.columns, gridSettings.rows, canvasSize]),
    
    snapSizeToGrid: useCallback((width: number, height: number) => {
      if (!gridSettings.snapEnabled) return { width, height };
      
      const cellWidth = canvasSize.width / gridSettings.columns;
      const cellHeight = canvasSize.height / gridSettings.rows;
      
      return {
        width: Math.max(cellWidth, Math.round(width / cellWidth) * cellWidth),
        height: Math.max(cellHeight, Math.round(height / cellHeight) * cellHeight)
      };
    }, [gridSettings.snapEnabled, gridSettings.columns, gridSettings.rows, canvasSize])
  };

  const updateGridSettings = useCallback((updates: Partial<GridSettings>) => {
    setGridSettings(prev => ({ ...prev, ...updates }));
  }, []);

  const toggleGrid = useCallback(() => {
    setGridSettings(prev => ({ ...prev, enabled: !prev.enabled }));
  }, []);

  const toggleSnap = useCallback(() => {
    setGridSettings(prev => ({ ...prev, snapEnabled: !prev.snapEnabled }));
  }, []);

  return {
    gridSettings,
    gridCalculations,
    updateGridSettings,
    toggleGrid,
    toggleSnap
  };
};