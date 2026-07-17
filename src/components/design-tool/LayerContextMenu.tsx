import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  Circle
} from 'lucide-react';
import { DesignElement } from '../../types/design';

interface LayerContextMenuProps {
  x: number;
  y: number;
  layer: DesignElement;
  onClose: () => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onCenterLayer: (id: string) => void;
  onDelete: (id: string) => void;
}

const LayerContextMenu: React.FC<LayerContextMenuProps> = ({
  x,
  y,
  layer,
  onClose,
  onToggleVisibility,
  onToggleLock,
  onMoveUp,
  onMoveDown,
  onBringToFront,
  onSendToBack,
  onCenterLayer,
  onDelete
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  const menuContent = (
    <div
      ref={menuRef}
      className="fixed z-[10002] bg-gray-800 rounded-lg border border-gray-700 shadow-xl min-w-[200px] py-2"
      style={{
        left: `${x}px`,
        top: `${y}px`
      }}
    >
      <div className="px-3 py-1.5 border-b border-gray-700">
        <span className="text-xs font-semibold text-gray-400">Layer Actions</span>
      </div>

      <div className="py-1">
        <button
          onClick={() => handleAction(() => onToggleVisibility(layer.id))}
          className="w-full px-4 py-2 text-left flex items-center space-x-3 hover:bg-gray-700 transition-colors text-gray-300 hover:text-white"
        >
          {layer.visible ? (
            <>
              <EyeOff className="w-4 h-4" />
              <span className="text-sm">Disable</span>
            </>
          ) : (
            <>
              <Eye className="w-4 h-4" />
              <span className="text-sm">Enable</span>
            </>
          )}
        </button>

        <button
          onClick={() => handleAction(() => onToggleLock(layer.id))}
          className="w-full px-4 py-2 text-left flex items-center space-x-3 hover:bg-gray-700 transition-colors text-gray-300 hover:text-white"
        >
          {layer.locked ? (
            <>
              <Unlock className="w-4 h-4" />
              <span className="text-sm">Unlock Layer</span>
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              <span className="text-sm">Lock Layer</span>
            </>
          )}
        </button>
      </div>

      <div className="my-2 mx-2 border-t border-gray-700" />

      <div className="px-3 py-1">
        <span className="text-xs font-semibold text-gray-500">ARRANGE</span>
      </div>

      <div className="py-1">
        <button
          onClick={() => handleAction(() => onBringToFront(layer.id))}
          className="w-full px-4 py-2 text-left flex items-center space-x-3 hover:bg-gray-700 transition-colors text-gray-300 hover:text-white"
        >
          <ChevronsUp className="w-4 h-4" />
          <span className="text-sm">Bring to Front</span>
        </button>

        <button
          onClick={() => handleAction(() => onMoveUp(layer.id))}
          className="w-full px-4 py-2 text-left flex items-center space-x-3 hover:bg-gray-700 transition-colors text-gray-300 hover:text-white"
        >
          <ArrowUp className="w-4 h-4" />
          <span className="text-sm">Move Forward</span>
        </button>

        <button
          onClick={() => handleAction(() => onMoveDown(layer.id))}
          className="w-full px-4 py-2 text-left flex items-center space-x-3 hover:bg-gray-700 transition-colors text-gray-300 hover:text-white"
        >
          <ArrowDown className="w-4 h-4" />
          <span className="text-sm">Move Backward</span>
        </button>

        <button
          onClick={() => handleAction(() => onSendToBack(layer.id))}
          className="w-full px-4 py-2 text-left flex items-center space-x-3 hover:bg-gray-700 transition-colors text-gray-300 hover:text-white"
        >
          <ChevronsDown className="w-4 h-4" />
          <span className="text-sm">Send to Back</span>
        </button>
      </div>

      <div className="my-2 mx-2 border-t border-gray-700" />

      <div className="py-1">
        <button
          onClick={() => handleAction(() => onCenterLayer(layer.id))}
          className="w-full px-4 py-2 text-left flex items-center space-x-3 hover:bg-gray-700 transition-colors text-gray-300 hover:text-white"
        >
          <Circle className="w-4 h-4" />
          <span className="text-sm">Center Layer</span>
        </button>
      </div>

      <div className="my-2 mx-2 border-t border-gray-700" />

      <div className="py-1">
        <button
          onClick={() => handleAction(() => onDelete(layer.id))}
          className="w-full px-4 py-2 text-left flex items-center space-x-3 hover:bg-gray-700 transition-colors text-red-400 hover:text-red-300"
        >
          <Trash2 className="w-4 h-4" />
          <span className="text-sm">Delete Layer</span>
        </button>
      </div>
    </div>
  );

  return createPortal(menuContent, document.body);
};

export default LayerContextMenu;
