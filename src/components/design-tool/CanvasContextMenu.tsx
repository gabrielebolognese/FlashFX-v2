import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Square,
  Circle,
  Minus,
  Type,
  Image,
  Layers,
  Copy,
  ZoomIn,
  ZoomOut,
  Maximize,
  RotateCcw,
  Grid3x3,
  Magnet,
  MousePointer,
  Lock,
  Trash2,
  RotateCw,
  ChevronRight,
  Frame
} from 'lucide-react';
import { Preset } from '../../types/preset';

interface CanvasContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCreateShape: (type: 'rectangle' | 'circle' | 'line' | 'text' | 'image', x: number, y: number) => void;
  onLoadPreset: (preset: Preset, x: number, y: number) => void;
  onPaste: (x: number, y: number, inPlace: boolean) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  onResetZoom: () => void;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onSelectByType: (type: 'shape' | 'text' | 'image') => void;
  onLockCanvas: () => void;
  onClearCanvas: () => void;
  onResetTransform: () => void;
  onViewCanvas: () => void;
  gridEnabled: boolean;
  snapEnabled: boolean;
  hasClipboard: boolean;
  presets: Preset[];
}

const CanvasContextMenu: React.FC<CanvasContextMenuProps> = ({
  x,
  y,
  onClose,
  onCreateShape,
  onLoadPreset,
  onPaste,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onResetZoom,
  onToggleGrid,
  onToggleSnap,
  onSelectAll,
  onDeselectAll,
  onSelectByType,
  onLockCanvas,
  onClearCanvas,
  onResetTransform,
  onViewCanvas,
  gridEnabled,
  snapEnabled,
  hasClipboard,
  presets
}) => {
  const [showCreateSubmenu, setShowCreateSubmenu] = useState(false);
  const [showPresetsSubmenu, setShowPresetsSubmenu] = useState(false);
  const [showSelectByTypeSubmenu, setShowSelectByTypeSubmenu] = useState(false);
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
  const [position, setPosition] = useState({ x, y });
  const menuRef = useRef<HTMLDivElement>(null);

  // Calculate position based on cursor location and menu size
  useEffect(() => {
    if (menuRef.current) {
      const menuHeight = menuRef.current.offsetHeight;
      const screenHeight = window.innerHeight;
      const isTopHalf = y < screenHeight / 2;

      // Position menu based on cursor position
      const adjustedY = isTopHalf ? y : y - menuHeight;
      setPosition({ x, y: adjustedY });
    }
  }, [x, y]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  const handleClearCanvas = () => {
    setShowClearConfirmation(true);
  };

  const confirmClearCanvas = () => {
    onClearCanvas();
    onClose();
  };

  if (showClearConfirmation) {
    const confirmContent = (
      <div
        className="fixed z-[10002] bg-gray-800 rounded-lg border border-gray-700 shadow-xl min-w-[160px] p-2"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`
        }}
      >
        <h3 className="text-white font-semibold mb-1 text-xs">Clear Canvas?</h3>
        <p className="text-gray-300 text-[10px] mb-2">
          This will delete all elements. This action cannot be undone.
        </p>
        <div className="flex space-x-1.5">
          <button
            onClick={confirmClearCanvas}
            className="flex-1 px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors text-[10px]"
          >
            Clear
          </button>
          <button
            onClick={() => setShowClearConfirmation(false)}
            className="flex-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors text-[10px]"
          >
            Cancel
          </button>
        </div>
      </div>
    );
    return createPortal(confirmContent, document.body);
  }

  const menuSections = [
    {
      title: 'CREATE',
      items: [
        {
          icon: Square,
          label: 'Rectangle',
          action: () => onCreateShape('rectangle', x, y)
        },
        {
          icon: Circle,
          label: 'Circle',
          action: () => onCreateShape('circle', x, y)
        },
        {
          icon: Minus,
          label: 'Line',
          action: () => onCreateShape('line', x, y)
        },
        {
          icon: Type,
          label: 'Text',
          action: () => onCreateShape('text', x, y)
        },
        {
          icon: Image,
          label: 'Image',
          action: () => onCreateShape('image', x, y)
        },
        {
          icon: Layers,
          label: 'From Preset',
          action: () => setShowPresetsSubmenu(!showPresetsSubmenu),
          hasSubmenu: true,
          disabled: presets.length === 0,
          submenu: showPresetsSubmenu && presets.length > 0 && (
            <div className="absolute left-full top-0 ml-0.5 bg-gray-800 rounded-md border border-gray-700 shadow-xl min-w-[130px] py-1 max-h-[260px] overflow-y-auto">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleAction(() => onLoadPreset(preset, x, y))}
                  className="w-full px-2 py-1 text-left flex items-center space-x-2 hover:bg-gray-700 transition-colors text-gray-300 hover:text-white cursor-pointer"
                >
                  <Layers className="w-3 h-3" />
                  <div className="flex flex-col">
                    <span className="text-[10px]">{preset.name}</span>
                    {preset.description && (
                      <span className="text-[9px] text-gray-500">{preset.description}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )
        }
      ]
    },
    {
      title: 'PASTE',
      items: [
        {
          icon: Copy,
          label: 'Paste',
          action: () => onPaste(x, y, false),
          disabled: !hasClipboard
        },
        {
          icon: Copy,
          label: 'Paste in Place',
          action: () => onPaste(x, y, true),
          disabled: !hasClipboard
        }
      ]
    },
    {
      title: 'VIEW',
      items: [
        {
          icon: ZoomIn,
          label: 'Zoom In',
          action: onZoomIn
        },
        {
          icon: ZoomOut,
          label: 'Zoom Out',
          action: onZoomOut
        },
        {
          icon: Maximize,
          label: 'Fit to Screen',
          action: onFitToScreen
        },
        {
          icon: RotateCcw,
          label: 'Reset Zoom',
          action: onResetZoom
        },
        {
          icon: Frame,
          label: 'View Canvas',
          action: onViewCanvas
        }
      ]
    },
    {
      title: 'GUIDES & SNAPPING',
      items: [
        {
          icon: Grid3x3,
          label: 'Enable Grid',
          action: onToggleGrid,
          checked: gridEnabled
        },
        {
          icon: Magnet,
          label: 'Snap to Guides',
          action: onToggleSnap,
          checked: snapEnabled
        }
      ]
    },
    {
      title: 'SELECTION',
      items: [
        {
          icon: MousePointer,
          label: 'Select All',
          action: onSelectAll
        },
        {
          icon: MousePointer,
          label: 'Deselect All',
          action: onDeselectAll
        },
        {
          icon: Layers,
          label: 'Select by Type',
          action: () => setShowSelectByTypeSubmenu(!showSelectByTypeSubmenu),
          hasSubmenu: true,
          submenu: showSelectByTypeSubmenu && (
            <div className="absolute left-full top-0 ml-0.5 bg-gray-800 rounded-md border border-gray-700 shadow-xl min-w-[115px] py-1">
              <button
                onClick={() => handleAction(() => onSelectByType('shape'))}
                className="w-full px-2 py-1 text-left flex items-center space-x-2 hover:bg-gray-700 transition-colors text-gray-300 hover:text-white cursor-pointer"
              >
                <Square className="w-3 h-3" />
                <span className="text-[10px]">Shapes</span>
              </button>
              <button
                onClick={() => handleAction(() => onSelectByType('text'))}
                className="w-full px-2 py-1 text-left flex items-center space-x-2 hover:bg-gray-700 transition-colors text-gray-300 hover:text-white cursor-pointer"
              >
                <Type className="w-3 h-3" />
                <span className="text-[10px]">Text</span>
              </button>
              <button
                onClick={() => handleAction(() => onSelectByType('image'))}
                className="w-full px-2 py-1 text-left flex items-center space-x-2 hover:bg-gray-700 transition-colors text-gray-300 hover:text-white cursor-pointer"
              >
                <Image className="w-3 h-3" />
                <span className="text-[10px]">Images</span>
              </button>
            </div>
          )
        }
      ]
    },
    {
      title: 'CANVAS STATE',
      items: [
        {
          icon: Lock,
          label: 'Lock Canvas',
          action: onLockCanvas
        },
        {
          icon: Trash2,
          label: 'Clear Canvas',
          action: handleClearCanvas,
          danger: true
        },
        {
          icon: RotateCw,
          label: 'Reset Canvas Transform',
          action: onResetTransform
        }
      ]
    }
  ];

  const menuContent = (
    <div
      ref={menuRef}
      className="fixed z-[10002] bg-gray-800 rounded-md border border-gray-700 shadow-xl min-w-[140px] py-1 max-h-[90vh] overflow-y-auto"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`
      }}
      onMouseLeave={() => {
        setShowCreateSubmenu(false);
        setShowPresetsSubmenu(false);
        setShowSelectByTypeSubmenu(false);
      }}
    >
      {menuSections.map((section, sectionIndex) => (
        <div key={sectionIndex}>
          {sectionIndex > 0 && (
            <div className="my-1 mx-1.5 border-t border-gray-700" />
          )}
          <div className="px-2 py-0.5">
            <span className="text-[9px] font-semibold text-gray-500">{section.title}</span>
          </div>
          {section.items.map((item, itemIndex) => (
            <div key={itemIndex} className="relative">
              <button
                onClick={() => {
                  if (!item.disabled && !item.hasSubmenu) {
                    handleAction(item.action);
                  } else if (item.hasSubmenu) {
                    item.action();
                  }
                }}
                disabled={item.disabled}
                onMouseEnter={() => {
                  if (item.hasSubmenu) {
                    item.action();
                  }
                }}
                className={`w-full px-2 py-1 text-left flex items-center justify-between hover:bg-gray-700 transition-colors ${
                  item.danger ? 'text-red-400 hover:text-red-300' : 'text-gray-300 hover:text-white'
                } ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className="flex items-center space-x-2">
                  <item.icon className="w-3 h-3" />
                  <span className="text-[10px]">{item.label}</span>
                </div>
                <div className="flex items-center space-x-1">
                  {item.checked !== undefined && item.checked && (
                    <span className="text-yellow-400 text-[9px]">✓</span>
                  )}
                  {item.hasSubmenu && (
                    <ChevronRight className="w-2 h-2" />
                  )}
                </div>
              </button>
              {item.submenu}
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  return createPortal(menuContent, document.body);
};

export default CanvasContextMenu;
