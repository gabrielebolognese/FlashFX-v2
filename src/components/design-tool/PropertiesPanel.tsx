import React from 'react';
import { DesignElement } from '../../types/design';

interface PropertiesPanelProps {
  selectedElements: DesignElement[];
  updateElement: (id: string, updates: Partial<DesignElement>) => void;
  onToggleTextSettings: () => void;
  showTextSettings: boolean;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedElements,
  updateElement,
  onToggleTextSettings,
  showTextSettings
}) => {
  if (selectedElements.length === 0) {
    return (
      <div className="w-80 bg-gray-800/50 backdrop-blur-xl border-l border-gray-700/50 p-4">
        <div className="text-center text-gray-500">
          <div className="mb-4">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gray-700/50 flex items-center justify-center">
              <span className="text-2xl">🎨</span>
            </div>
            <h3 className="text-lg font-medium text-gray-400 mb-2">No Selection</h3>
            <p className="text-sm">Select an element to edit its properties</p>
          </div>
        </div>
      </div>
    );
  }

  const selectedElement = selectedElements[0]; // For now, edit the first selected element
  const isMultiSelect = selectedElements.length > 1;

  const handleUpdate = (updates: Partial<DesignElement>) => {
    if (isMultiSelect) {
      // Apply updates to all selected elements
      selectedElements.forEach(element => {
        updateElement(element.id, updates);
      });
    } else {
      updateElement(selectedElement.id, updates);
    }
  };

  return (
    <div className="w-80 bg-gray-800/50 backdrop-blur-xl border-l border-gray-700/50 flex flex-col properties-panel">
      <div className="p-4 border-b border-gray-700/50">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-white">Properties</h3>
          {onToggleTextSettings && selectedElements.some(el => el.type === 'text' || el.type === 'button' || el.type === 'chat-bubble') && (
            <button
              onClick={onToggleTextSettings}
              className={`px-3 py-1 rounded-lg text-sm transition-all duration-200 ${
                showTextSettings
                  ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/50'
                  : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'
              }`}
              title="Toggle Text Settings (Ctrl+Shift+T)"
            >
              Text Settings
            </button>
          )}
        </div>
        {isMultiSelect && (
          <div className="text-sm text-yellow-400 bg-yellow-400/10 px-3 py-2 rounded-lg">
            {selectedElements.length} elements selected
          </div>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Position & Size */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-300 flex items-center">
            <span className="w-2 h-2 bg-yellow-400 rounded-full mr-2"></span>
            Position & Size
          </h4>
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 block mb-1">X</label>
              <input
                type="number"
                value={Math.round(selectedElement.x)}
                onChange={(e) => handleUpdate({ x: Math.round(Number(e.target.value)) })}
                className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-yellow-400/50"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Y</label>
              <input
                type="number"
                value={Math.round(selectedElement.y)}
                onChange={(e) => handleUpdate({ y: Math.round(Number(e.target.value)) })}
                className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-yellow-400/50"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Width</label>
              <input
                type="number"
                value={Math.round(selectedElement.width)}
                onChange={(e) => handleUpdate({ width: Math.round(Number(e.target.value)) })}
                className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-yellow-400/50"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Height</label>
              <input
                type="number"
                value={Math.round(selectedElement.height)}
                onChange={(e) => handleUpdate({ height: Math.round(Number(e.target.value)) })}
                className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-yellow-400/50"
              />
            </div>
          </div>
        </div>

        {/* Appearance */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-300 flex items-center">
            <span className="w-2 h-2 bg-orange-400 rounded-full mr-2"></span>
            Appearance
          </h4>
          
          <div>
            <label className="text-xs text-gray-400 block mb-1">Fill Color</label>
            <div className="flex items-center space-x-2">
              <input
                type="color"
                value={selectedElement.fill}
                onChange={(e) => handleUpdate({ fill: e.target.value })}
                className="w-10 h-10 rounded-lg cursor-pointer border border-gray-600/50"
              />
              <input
                type="text"
                value={selectedElement.fill}
                onChange={(e) => handleUpdate({ fill: e.target.value })}
                className="flex-1 px-3 py-2 bg-gray-700/50 border border-gray-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-yellow-400/50"
              />
            </div>
          </div>
          
          <div>
            <label className="text-xs text-gray-400 block mb-1">Stroke Color</label>
            <div className="flex items-center space-x-2">
              <input
                type="color"
                value={selectedElement.stroke}
                onChange={(e) => handleUpdate({ stroke: e.target.value })}
                className="w-10 h-10 rounded-lg cursor-pointer border border-gray-600/50"
              />
              <input
                type="text"
                value={selectedElement.stroke}
                onChange={(e) => handleUpdate({ stroke: e.target.value })}
                className="flex-1 px-3 py-2 bg-gray-700/50 border border-gray-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-yellow-400/50"
              />
            </div>
          </div>
          
          <div>
            <label className="text-xs text-gray-400 block mb-1">Stroke Width</label>
            <input
              type="number"
              min="0"
              value={Math.round(selectedElement.strokeWidth)}
              onChange={(e) => handleUpdate({ strokeWidth: Math.round(Number(e.target.value)) })}
              className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-yellow-400/50"
            />
          </div>
          
          <div>
            <label className="text-xs text-gray-400 block mb-1">Border Radius</label>
            <input
              type="number"
              min="0"
              value={Math.round(selectedElement.borderRadius)}
              onChange={(e) => handleUpdate({ borderRadius: Math.round(Number(e.target.value)) })}
              className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-yellow-400/50"
            />
          </div>
          
          <div>
            <label className="text-xs text-gray-400 block mb-1">Opacity</label>
            <div className="space-y-2">
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={selectedElement.opacity}
                onChange={(e) => handleUpdate({ opacity: Number(e.target.value) })}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="text-xs text-gray-400 text-center">
                {Math.round(selectedElement.opacity * 100)}%
              </div>
            </div>
          </div>
        </div>

        {/* Text Properties */}
        {(selectedElement.type === 'text' || selectedElement.type === 'button' || selectedElement.type === 'chat-bubble') && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-300 flex items-center">
              <span className="w-2 h-2 bg-blue-400 rounded-full mr-2"></span>
              Text
            </h4>
            
            <div>
              <label className="text-xs text-gray-400 block mb-1">Text Content</label>
              <textarea
                value={selectedElement.text || ''}
                onChange={(e) => handleUpdate({ text: e.target.value })}
                className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-yellow-400/50 resize-none"
                rows={3}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Font Size</label>
                <input
                  type="number"
                  min="8"
                  value={Math.round(selectedElement.fontSize || 16)}
                  onChange={(e) => handleUpdate({ fontSize: Math.round(Number(e.target.value)) })}
                  className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-yellow-400/50"
                />
              </div>
              
              <div>
                <label className="text-xs text-gray-400 block mb-1">Font Weight</label>
                <select
                  value={selectedElement.fontWeight || '400'}
                  onChange={(e) => handleUpdate({ fontWeight: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-yellow-400/50"
                >
                  <option value="300">Light</option>
                  <option value="400">Normal</option>
                  <option value="500">Medium</option>
                  <option value="600">Semi Bold</option>
                  <option value="700">Bold</option>
                  <option value="800">Extra Bold</option>
                </select>
              </div>
            </div>
            
            <div>
              <label className="text-xs text-gray-400 block mb-1">Text Align</label>
              <div className="grid grid-cols-3 gap-1">
                {['left', 'center', 'right'].map((align) => (
                  <button
                    key={align}
                    onClick={() => handleUpdate({ textAlign: align as 'left' | 'center' | 'right' })}
                    className={`px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                      selectedElement.textAlign === align
                        ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/50'
                        : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'
                    }`}
                  >
                    {align.charAt(0).toUpperCase() + align.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            
            <div>
              <label className="text-xs text-gray-400 block mb-1">Text Color</label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  value={selectedElement.textColor || '#000000'}
                  onChange={(e) => handleUpdate({ textColor: e.target.value })}
                  className="w-10 h-10 rounded-lg cursor-pointer border border-gray-600/50"
                />
                <input
                  type="text"
                  value={selectedElement.textColor || '#000000'}
                  onChange={(e) => handleUpdate({ textColor: e.target.value })}
                  className="flex-1 px-3 py-2 bg-gray-700/50 border border-gray-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-yellow-400/50"
                />
              </div>
            </div>
          </div>
        )}

        {/* Shadow */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-300 flex items-center">
            <span className="w-2 h-2 bg-purple-400 rounded-full mr-2"></span>
            Shadow
          </h4>
          
          <div>
            <label className="text-xs text-gray-400 block mb-1">Shadow Blur</label>
            <input
              type="number"
              min="0"
              value={Math.round(selectedElement.shadow.blur)}
              onChange={(e) => handleUpdate({ 
                shadow: { ...selectedElement.shadow, blur: Math.round(Number(e.target.value)) }
              })}
              className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-yellow-400/50"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Shadow X</label>
              <input
                type="number"
                value={Math.round(selectedElement.shadow.x)}
                onChange={(e) => handleUpdate({ 
                  shadow: { ...selectedElement.shadow, x: Math.round(Number(e.target.value)) }
                })}
                className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-yellow-400/50"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Shadow Y</label>
              <input
                type="number"
                value={Math.round(selectedElement.shadow.y)}
                onChange={(e) => handleUpdate({ 
                  shadow: { ...selectedElement.shadow, y: Math.round(Number(e.target.value)) }
                })}
                className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-yellow-400/50"
              />
            </div>
          </div>
          
          <div>
            <label className="text-xs text-gray-400 block mb-1">Shadow Color</label>
            <div className="flex items-center space-x-2">
              <input
                type="color"
                value={selectedElement.shadow.color}
                onChange={(e) => handleUpdate({ 
                  shadow: { ...selectedElement.shadow, color: e.target.value }
                })}
                className="w-10 h-10 rounded-lg cursor-pointer border border-gray-600/50"
              />
              <input
                type="text"
                value={selectedElement.shadow.color}
                onChange={(e) => handleUpdate({ 
                  shadow: { ...selectedElement.shadow, color: e.target.value }
                })}
                className="flex-1 px-3 py-2 bg-gray-700/50 border border-gray-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-yellow-400/50"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PropertiesPanel;