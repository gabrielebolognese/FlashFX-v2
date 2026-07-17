import React from 'react';
import { X, Keyboard } from 'lucide-react';

interface ShortCutPopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ShortCutPopUpModal: React.FC<ShortCutPopUpModalProps> = ({
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  const shortcuts = [
    {
      category: 'General',
      shortcuts: [
        { keys: 'Ctrl + Z', description: 'Undo' },
        { keys: 'Ctrl + Shift + Z', description: 'Redo' },
        { keys: 'Ctrl + Y', description: 'Redo (Alternative)' },
        { keys: 'Ctrl + A', description: 'Select All' },
        { keys: 'Escape', description: 'Deselect All' },
        { keys: 'Ctrl + E', description: 'Export Elements' },
        { keys: 'Ctrl + Alt + Shift + S', description: 'Show Shortcuts (This Menu)' }
      ]
    },
    {
      category: 'Shape Creation',
      shortcuts: [
        { keys: 'R', description: 'Create Rectangle' },
        { keys: 'O', description: 'Create Circle' },
        { keys: 'T', description: 'Create Text' },
        { keys: 'L', description: 'Create Line' },
        { keys: 'A', description: 'Create Arrow' },
        { keys: 'B', description: 'Create Button' },
        { keys: 'I', description: 'Trigger Image Upload Dialog' },
        { keys: 'G', description: 'Toggle Grid Overlay Visibility' }
      ]
    },
    {
      category: 'Elements',
      shortcuts: [
        { keys: 'Ctrl + D', description: 'Duplicate Selected' },
        { keys: 'Alt + Drag', description: 'Duplicate Element While Dragging' },
        { keys: 'Delete / Backspace', description: 'Delete Selected' },
        { keys: 'Ctrl + G', description: 'Group Selected' },
        { keys: 'Ctrl + Shift + G', description: 'Ungroup Selected' }
      ]
    },
    {
      category: 'Movement',
      shortcuts: [
        { keys: '↑ ↓ ← →', description: 'Move Selected (1px)' },
        { keys: 'Shift + ↑ ↓ ← →', description: 'Move Selected (10px)' }
      ]
    },
    {
      category: 'Transform & Manipulation',
      shortcuts: [
        { keys: 'Shift + Drag', description: 'Constrain Proportions While Resizing' },
        { keys: 'Cmd/Ctrl + ;', description: 'Toggle Snapping/Grid' }
      ]
    },
    {
      category: 'Animation',
      shortcuts: [
        { keys: 'Ctrl + K', description: 'Add Keyframe on All Properties' },
        { keys: 'Space', description: 'Play/Pause Animation' }
      ]
    },
    {
      category: 'Timeline',
      shortcuts: [
        { keys: 'Ctrl + Shift + L', description: 'Toggle Timeline Panel' },
        { keys: 'Space', description: 'Play/Pause Animation' }
      ]
    },
    {
      category: 'Canvas',
      shortcuts: [
        { keys: 'Ctrl + +', description: 'Zoom In' },
        { keys: 'Ctrl + -', description: 'Zoom Out' },
        { keys: 'Ctrl + 0', description: 'Reset Zoom' },
        { keys: '+', description: 'Zoom In (small step)' },
        { keys: '-', description: 'Zoom Out (small step)' },
        { keys: 'Ctrl + Click', description: 'Multi-select Elements' }
      ]
    }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-gradient-to-r from-yellow-400 to-orange-500">
                <Keyboard className="w-6 h-6 text-gray-900" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Keyboard Shortcuts</h2>
                <p className="text-sm text-gray-400">Master FlashFX with these shortcuts</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
            {shortcuts.map((category, categoryIndex) => (
              <div key={categoryIndex} className="space-y-3">
                <h3 className="text-lg font-semibold text-yellow-400 flex items-center">
                  <span className="w-2 h-2 bg-yellow-400 rounded-full mr-2"></span>
                  {category.category}
                </h3>
                
                <div className="space-y-2">
                  {category.shortcuts.map((shortcut, shortcutIndex) => (
                    <div
                      key={shortcutIndex}
                      className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg hover:bg-gray-700/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="text-sm text-white font-medium mb-1">
                          {shortcut.description}
                        </div>
                        <div className="flex items-center space-x-1">
                          {shortcut.keys.split(' + ').map((key, keyIndex, array) => (
                            <React.Fragment key={keyIndex}>
                              <kbd className="px-2 py-1 bg-gray-600 text-gray-200 rounded text-xs font-mono border border-gray-500">
                                {key}
                              </kbd>
                              {keyIndex < array.length - 1 && (
                                <span className="text-gray-400 text-xs">+</span>
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-gray-700">
            <div className="text-center">
              <p className="text-sm text-gray-400">
                Press <kbd className="px-2 py-1 bg-gray-600 text-gray-200 rounded text-xs font-mono border border-gray-500">Ctrl + Alt + Shift + S</kbd> anytime to open this menu
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShortCutPopUpModal;