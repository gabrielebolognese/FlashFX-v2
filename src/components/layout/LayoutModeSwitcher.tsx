import React from 'react';
import { Palette } from 'lucide-react';
import { LayoutMode } from '../../hooks/useLayoutMode';

interface LayoutModeSwitcherProps {
  currentMode: LayoutMode;
  onModeChange: (mode: LayoutMode) => void;
  isTransitioning: boolean;
}

const LayoutModeSwitcher: React.FC<LayoutModeSwitcherProps> = () => {
  // Only design mode available now - display as badge instead of switcher
  return (
    <div className="flex items-center space-x-1">
      <div className="flex items-center space-x-2 px-3 py-2 bg-yellow-400/20 text-yellow-400 border border-yellow-400/50 rounded-lg shadow-sm">
        <Palette className="w-4 h-4 text-yellow-400" />
        <span className="text-sm font-medium">Design Mode</span>
        <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
      </div>
    </div>
  );
};

export default LayoutModeSwitcher;