import React from 'react';
import { Copy, Clipboard } from 'lucide-react';
import { DesignElement } from '../../types/design';
import { useClipboard } from '../../hooks/useClipboard';

interface LinePropertiesTabProps {
  selectedElements: DesignElement[];
  updateElement: (id: string, updates: Partial<DesignElement>) => void;
}

const LinePropertiesTab: React.FC<LinePropertiesTabProps> = ({
  selectedElements,
  updateElement
}) => {
  const { copyValue, pasteValue } = useClipboard();

  if (selectedElements.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p className="text-xs">No line elements selected</p>
        </div>
      </div>
    );
  }

  const selectedElement = selectedElements[0];
  const isMultiSelect = selectedElements.length > 1;

  const handleUpdate = (updates: Partial<DesignElement>) => {
    if (isMultiSelect) {
      selectedElements.forEach(element => {
        updateElement(element.id, updates);
      });
    } else {
      updateElement(selectedElement.id, updates);
    }
  };

  const handleCopyValue = async (value: number) => {
    await copyValue(value);
  };

  const handlePasteValue = async (property: keyof DesignElement) => {
    const value = await pasteValue();
    if (value !== null) {
      handleUpdate({ [property]: value });
    }
  };

  const handlePointUpdate = (pointIndex: number, updates: { x?: number; y?: number; radius?: number }) => {
    const newPoints = [...(selectedElement.points || [])];
    if (newPoints[pointIndex]) {
      newPoints[pointIndex] = { ...newPoints[pointIndex], ...updates };
      handleUpdate({ points: newPoints });
    }
  };

  const addPoint = () => {
    const points = selectedElement.points || [];
    const lastPoint = points[points.length - 1] || { x: 0, y: 0 };
    const newPoint = { 
      x: lastPoint.x + 50, 
      y: lastPoint.y, 
      radius: selectedElement.globalCornerRadius || 0 
    };
    handleUpdate({ points: [...points, newPoint] });
  };

  const removePoint = (index: number) => {
    const points = selectedElement.points || [];
    if (points.length > 2) {
      const newPoints = points.filter((_, i) => i !== index);
      handleUpdate({ points: newPoints });
    }
  };

  // Round values for display
  const roundedElement = {
    ...selectedElement,
    strokeWidth: Math.round(selectedElement.strokeWidth || 2),
    dashIntensity: Math.round(selectedElement.dashIntensity || 0),
    smoothing: selectedElement.smoothing || 0,
    globalCornerRadius: Math.round(selectedElement.globalCornerRadius || 0)
  };

  return (
    <div className="h-full overflow-y-auto p-2 space-y-3 custom-scrollbar">
      {/* Stroke Properties */}
      <div className="space-y-1.5">
        <h4 className="text-xs font-medium text-gray-300 flex items-center">
          <span className="w-1 h-1 bg-blue-400 rounded-full mr-1.5"></span>
          Stroke Properties
        </h4>

        {/* Stroke Width Slider */}
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <label className="text-xs text-gray-400">Stroke Width</label>
            <div className="flex items-center space-x-0.5">
              <button
                onClick={() => handleCopyValue(roundedElement.strokeWidth)}
                className="p-0.5 hover:bg-gray-600/50 rounded transition-colors"
                title="Copy stroke width"
              >
                <Copy className="w-2.5 h-2.5 text-gray-500 hover:text-gray-300" />
              </button>
              <button
                onClick={() => handlePasteValue('strokeWidth')}
                className="p-0.5 hover:bg-gray-600/50 rounded transition-colors"
                title="Paste stroke width"
              >
                <Clipboard className="w-2.5 h-2.5 text-gray-500 hover:text-gray-300" />
              </button>
            </div>
          </div>
          <div className="flex items-center space-x-1.5">
            <input
              type="range"
              min="1"
              max="100"
              value={roundedElement.strokeWidth}
              onChange={(e) => handleUpdate({ strokeWidth: Number(e.target.value) })}
              className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <input
              type="number"
              min="1"
              max="100"
              value={roundedElement.strokeWidth}
              onChange={(e) => handleUpdate({ strokeWidth: Number(e.target.value) })}
              className="w-10 px-1 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400"
            />
          </div>
        </div>

        {/* Stroke Color */}
        <div>
          <label className="text-xs text-gray-400 block mb-0.5">Stroke Color</label>
          <div className="flex items-center space-x-1.5">
            <input
              type="color"
              value={selectedElement.stroke}
              onChange={(e) => handleUpdate({ stroke: e.target.value })}
              className="w-6 h-6 rounded cursor-pointer border border-gray-600/50"
            />
            <input
              type="text"
              value={selectedElement.stroke}
              onChange={(e) => handleUpdate({ stroke: e.target.value })}
              className="flex-1 px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
            />
          </div>
        </div>

        {/* Opacity */}
        <div>
          <label className="text-xs text-gray-400 block mb-0.5">Opacity</label>
          <div className="space-y-0.5">
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={selectedElement.opacity}
              onChange={(e) => handleUpdate({ opacity: Number(e.target.value) })}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="text-xs text-gray-400 text-center">
              {Math.round(selectedElement.opacity * 100)}%
            </div>
          </div>
        </div>
      </div>

      {/* Line Style */}
      <div className="space-y-1.5">
        <h4 className="text-xs font-medium text-gray-300 flex items-center">
          <span className="w-1 h-1 bg-green-400 rounded-full mr-1.5"></span>
          Line Style
        </h4>

        {/* Dash Pattern Slider */}
        <div>
          <label className="text-xs text-gray-400 block mb-0.5">
            Dash Pattern: {roundedElement.dashIntensity}%
          </label>
          <div className="flex items-center space-x-1.5">
            <input
              type="range"
              min="0"
              max="100"
              value={roundedElement.dashIntensity}
              onChange={(e) => {
                const intensity = Number(e.target.value);
                const strokeWidth = selectedElement.strokeWidth || 2;
                // Generate dash pattern based on intensity
                let dashArray: number[] = [];
                if (intensity > 0) {
                  const dashLength = strokeWidth * (1 + intensity / 25);
                  const gapLength = strokeWidth * (0.5 + intensity / 50);
                  dashArray = [dashLength, gapLength];
                }
                handleUpdate({ 
                  dashIntensity: intensity,
                  dashArray: dashArray
                });
              }}
              className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <input
              type="number"
              min="0"
              max="100"
              value={roundedElement.dashIntensity}
              onChange={(e) => {
                const intensity = Number(e.target.value);
                const strokeWidth = selectedElement.strokeWidth || 2;
                let dashArray: number[] = [];
                if (intensity > 0) {
                  const dashLength = strokeWidth * (1 + intensity / 25);
                  const gapLength = strokeWidth * (0.5 + intensity / 50);
                  dashArray = [dashLength, gapLength];
                }
                handleUpdate({ 
                  dashIntensity: intensity,
                  dashArray: dashArray
                });
              }}
              className="w-10 px-1 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400"
            />
          </div>
        </div>

        {/* Line Caps and Joins */}
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label className="text-xs text-gray-400 block mb-0.5">Line Cap</label>
            <select
              value={selectedElement.lineCap || 'round'}
              onChange={(e) => handleUpdate({ lineCap: e.target.value as any })}
              className="w-full px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
            >
              <option value="round">Round</option>
              <option value="butt">Butt</option>
              <option value="square">Square</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-0.5">Line Join</label>
            <select
              value={selectedElement.lineJoin || 'round'}
              onChange={(e) => handleUpdate({ lineJoin: e.target.value as any })}
              className="w-full px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
            >
              <option value="round">Round</option>
              <option value="bevel">Bevel</option>
              <option value="miter">Miter</option>
            </select>
          </div>
        </div>
      </div>

      {/* Arrow Settings */}
      {(selectedElement.lineType === 'arrow' || selectedElement.arrowStart || selectedElement.arrowEnd) && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-medium text-gray-300 flex items-center">
            <span className="w-1 h-1 bg-red-400 rounded-full mr-1.5"></span>
            Arrow Settings
          </h4>
          
          <div className="grid grid-cols-2 gap-1.5">
            <div className="flex items-center space-x-1">
              <input
                type="checkbox"
                checked={selectedElement.arrowStart || false}
                onChange={(e) => handleUpdate({ arrowStart: e.target.checked })}
                className="w-3 h-3 rounded border-gray-600 bg-gray-700 text-yellow-400 focus:ring-yellow-400"
              />
              <label className="text-xs text-gray-400">Start Arrow</label>
            </div>
            <div className="flex items-center space-x-1">
              <input
                type="checkbox"
                checked={selectedElement.arrowEnd || false}
                onChange={(e) => handleUpdate({ arrowEnd: e.target.checked })}
                className="w-3 h-3 rounded border-gray-600 bg-gray-700 text-yellow-400 focus:ring-yellow-400"
              />
              <label className="text-xs text-gray-400">End Arrow</label>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-0.5">Arrowhead Type</label>
            <select
              value={selectedElement.arrowheadType || 'triangle'}
              onChange={(e) => handleUpdate({ arrowheadType: e.target.value as any })}
              className="w-full px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
            >
              <option value="triangle">Triangle</option>
              <option value="circle">Circle</option>
              <option value="bar">Bar</option>
              <option value="diamond">Diamond</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-0.5">Arrowhead Size</label>
            <input
              type="number"
              min="4"
              max="50"
              value={selectedElement.arrowheadSize || 12}
              onChange={(e) => handleUpdate({ arrowheadSize: Number(e.target.value) })}
              className="w-full px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
            />
          </div>
        </div>
      )}

      {/* Smoothing - For Pen Tool */}
      {selectedElement.lineType === 'pen' && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-medium text-gray-300 flex items-center">
            <span className="w-1 h-1 bg-purple-400 rounded-full mr-1.5"></span>
            Path Smoothing
          </h4>
          
          <div>
            <label className="text-xs text-gray-400 block mb-0.5">
              Smoothing (px)
            </label>
            <input
              type="number"
              min="0"
              max="1000"
              step="0.1"
              value={selectedElement.smoothing || 0}
              onChange={(e) => handleUpdate({ smoothing: Number(e.target.value) })}
              className="w-full px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
              placeholder="0-1000px"
            />
          </div>
        </div>
      )}

      {/* Corner Rounding */}
      {selectedElement.lineType === 'pen' && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-medium text-gray-300 flex items-center">
            <span className="w-1 h-1 bg-orange-400 rounded-full mr-1.5"></span>
            Corner Rounding
          </h4>
          
          <div>
            <label className="text-xs text-gray-400 block mb-0.5">
              Global Corner Radius: {roundedElement.globalCornerRadius}px
            </label>
            <div className="flex items-center space-x-1.5">
              <input
                type="range"
                min="0"
                max="50"
                value={roundedElement.globalCornerRadius}
                onChange={(e) => {
                  const radius = Number(e.target.value);
                  // Apply to all points
                  const points = selectedElement.points || [];
                  const updatedPoints = points.map(p => ({ ...p, radius }));
                  handleUpdate({ 
                    globalCornerRadius: radius,
                    points: updatedPoints
                  });
                }}
                className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              />
              <input
                type="number"
                min="0"
                max="50"
                value={roundedElement.globalCornerRadius}
                onChange={(e) => {
                  const radius = Number(e.target.value);
                  const points = selectedElement.points || [];
                  const updatedPoints = points.map(p => ({ ...p, radius }));
                  handleUpdate({ 
                    globalCornerRadius: radius,
                    points: updatedPoints
                  });
                }}
                className="w-12 px-1 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400"
              />
            </div>
          </div>

          {/* Per-Point Corner Radius */}
          {selectedElement.points && selectedElement.points.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-400">Per-Point Radius</label>
                <button
                  onClick={addPoint}
                  className="px-2 py-0.5 bg-yellow-400/20 text-yellow-400 rounded text-xs hover:bg-yellow-400/30 transition-colors"
                >
                  Add Point
                </button>
              </div>
              
              <div className="max-h-72 overflow-y-auto space-y-1">
                {selectedElement.points.map((point, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">Point {index + 1}</span>
                      {selectedElement.points!.length > 2 && (
                        <button
                          onClick={() => removePoint(index)}
                          className="px-1 py-0.5 bg-red-500/20 text-red-400 rounded text-xs hover:bg-red-500/30 transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    <div className="flex items-center space-x-1 text-xs">
                      <span className="text-gray-400 w-4">X:</span>
                      <input
                        type="number"
                        value={Math.round(point.x)}
                        onChange={(e) => handlePointUpdate(index, { x: Number(e.target.value) })}
                        className="w-12 px-1 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-white"
                      />
                      <span className="text-gray-400 w-4">Y:</span>
                      <input
                        type="number"
                        value={Math.round(point.y)}
                        onChange={(e) => handlePointUpdate(index, { y: Number(e.target.value) })}
                        className="w-12 px-1 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-white"
                      />
                      <span className="text-gray-400 w-4">R:</span>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        value={Math.round(point.radius || 0)}
                        onChange={(e) => handlePointUpdate(index, { radius: Number(e.target.value) })}
                        className="w-12 px-1 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-white"
                        title="Corner radius for this point"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Close Path Toggle for Pen Tool */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-400">Close Path</label>
            <button
              onClick={() => handleUpdate({ closePath: !selectedElement.closePath })}
              className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${
                selectedElement.closePath ? 'bg-yellow-400' : 'bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  selectedElement.closePath ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LinePropertiesTab;