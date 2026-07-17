import { useState, useCallback } from 'react';
import { othersSettingsService } from '../services/OthersSettingsService';

export type LayoutMode = 'design' | 'edit' | 'advanced';

export interface LayoutModeState {
  currentMode: LayoutMode;
  setMode: (mode: LayoutMode) => void;
  isTransitioning: boolean;
}

export const useLayoutMode = (): LayoutModeState => {
  const [currentMode, setCurrentMode] = useState<LayoutMode>(() => othersSettingsService.getStartingTab());
  const [isTransitioning, setIsTransitioning] = useState(false);

  const setMode = useCallback((mode: LayoutMode) => {
    if (mode === currentMode) return;

    setIsTransitioning(true);
    setCurrentMode(mode);

    setTimeout(() => {
      setIsTransitioning(false);
    }, 150);
  }, [currentMode]);

  return {
    currentMode,
    setMode,
    isTransitioning
  };
};