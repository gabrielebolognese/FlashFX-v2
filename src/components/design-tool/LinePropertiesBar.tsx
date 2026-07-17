import React, { useState } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  Plus, 
  Trash2, 
  RotateCw, 
  FlipHorizontal, 
  FlipVertical,
  Move,
  Circle,
  Triangle,
  Diamond,
  Upload,
  Copy,
  Clipboard
} from 'lucide-react';
import { DesignElement } from '../../types/design';
import { useClipboard } from '../../hooks/useClipboard';

interface LinePropertiesBarProps {
  selectedElements: DesignElement[];
  updateElement: (id: string, updates: Partial<DesignElement>) => void;
  isOpen: boolean;
  onClose: () => void;
}

const LinePropertiesBar: React.FC<LinePropertiesBarProps> = ({
  selectedElements,
  updateElement,
  isOpen,
  onClose
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['geometry', 'styling', 'points'])
  );
  const { copyValue, pasteValue } = useClipboard();

  const lineElements = selectedElements.filter(el => el.type === 'line');
  
  if (!isOpen || lineElements.length === 0) return null;

  const selectedElement = lineElements[0];
  const isMultiSelect = lineElements.length > 1;
  const points = selectedElement.points || [{ x: 0, y: 0 }, { x: selectedElement.width, y: 0 }];

  const handleUpdate = (updates: Partial<DesignElement>) => {
    if (isMultiSelect) {
      lineElements.forEach(element => {
        updateElement(element.id, updates);
      });
    } else {
      updateElement(selectedElement.id, updates);
    }
  };

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const handlePointUpdate = (pointIndex: number, updates: { x?: number; y?: number; smooth?: boolean; cornerRadius?: number }) => {
    const newPoints = [...points];
    if (newPoints[pointIndex]) {
      newPoints[pointIndex] = { ...newPoints[pointIndex], ...updates };
      handleUpdate({ points: newPoints });
    }
  };

  const addPoint = () => {
    const lastPoint = points[points.length - 1] || { x: 0, y: 0 };
    const secondLastPoint = points[points.length - 2] || { x: 0, y: 0 };
    
    // Calculate next point position based on direction
    const deltaX = lastPoint.x - secondLastPoint.x;
    const deltaY = lastPoint.y - secondLastPoint.y;
    
    const newPoint = { 
      x: lastPoint.x + (deltaX || 50), 
      y: lastPoint.y + (deltaY || 0),
      smooth: true,
      cornerRadius: 0
    };
    
    handleUpdate({ points: [...points, newPoint] });
  };

  const removePoint = (index: number) => {
    if (points.length > 2) {
      const newPoints = points.filter((_, i) => i !== index);
      handleUpdate({ points: newPoints });
    }
  };

  const duplicatePoint = (index: number) => {
    const pointToDuplicate = points[index];
    const newPoint = { 
      ...pointToDuplicate, 
      x: pointToDuplicate.x + 20, 
      y: pointToDuplicate.y + 20,
      radius: pointToDuplicate.radius || selectedElement.cornerRadius || 0
    };
    const newPoints = [...points];
    newPoints.splice(index + 1, 0, newPoint);
    handleUpdate({ points: newPoints });
  };

  const handleCopyValue = async (value: number) => {
    await copyValue(value);
  };

  const handlePasteValue = async (property: string, pointIndex?: number) => {
    const value = await pasteValue();
    if (value !== null) {
      if (pointIndex !== undefined) {
        if (property === 'x') {
          handlePointUpdate(pointIndex, { x: value });
        } else if (property === 'y') {
          handlePointUpdate(pointIndex, { y: value });
        }
      } else {
        handleUpdate({ [property]: value });
      }
    }
  };

  const SectionHeader: React.FC<{ title: string; sectionKey: string; icon?: React.ReactNode }> = ({ 
    title, 
    sectionKey, 
    icon 
  }) => (
    <button
      onClick={() => toggleSection(sectionKey)}
      className="w-full flex items-center justify-between p-3 bg-gray-700/30 hover:bg-gray-700/50 rounded-lg transition-colors mb-2"
    >
      <div className="flex items-center space-x-2">
        {icon}
        <span className="text-sm font-medium text-white">{title}</span>
      </div>
      {expandedSections.has(sectionKey) ? (
        <ChevronDown className="w-4 h-4 text-gray-400" />
      ) : (
        <ChevronRight className="w-4 h-4 text-gray-400" />
      )}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl w-full max-w-lg mx-4 max-h-[95vh] overflow-hidden">
        <div className="flex flex-col h-full max-h-[95vh]">
          {/* Header */}
          <div className="p-6 border-b border-gray-700 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600">
                  <Move className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Line Properties</h2>
                  <p className="text-sm text-gray-400">
                    Advanced controls for {selectedElement.lineType || 'line'} tool
                    {isMultiSelect && ` • ${lineElements.length} selected`}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <span className="text-gray-400 text-xl">×</span>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            
            {/* Geometry Section */}
            <div>
              <SectionHeader 
                title="Geometry" 
                sectionKey="geometry"
                icon={<Move className="w-4 h-4 text-cyan-400" />}
              />
              
              {expandedSections.has('geometry') && (
                <div className="space-y-4 pl-4">
                  {/* Line Type */}
                  <div>
                    <label className="text-sm font-medium text-gray-300 block mb-2">Tool Type</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 'line', label: 'Line', description: 'Straight segments' },
                        { value: 'arrow', label: 'Arrow', description: 'With pointers' },
                        { value: 'pen', label: 'Pen', description: 'Freeform path' }
                      ].map(({ value, label, description }) => (
                        <button
                          key={value}
                          onClick={() => handleUpdate({ lineType: value as any })}
                          className={`p-3 rounded-lg text-center transition-all duration-200 ${
                            selectedElement.lineType === value
                              ? 'bg-cyan-400/20 text-cyan-400 border-2 border-cyan-400/50'
                              : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50 border-2 border-transparent'
                          }`}
                        >
                          <div className="text-sm font-medium">{label}</div>
                          <div className="text-xs text-gray-400 mt-1">{description}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Corner Rounding */}
                  <div>
                    <label className="text-sm font-medium text-gray-300 block mb-2">
                      Global Corner Radius: {Math.round(selectedElement.cornerRadius || 0)}px
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="range"
                        min="0"
                        max="50"
                        step="1"
                        value={selectedElement.cornerRadius || 0}
                        onChange={(e) => {
                          const newRadius = Number(e.target.value);
                          // Apply to all points if they don't have individual radius set
                          const newPoints = points.map(p => ({
                            ...p,
                            radius: p.radius !== undefined ? p.radius : newRadius
                          }));
                          handleUpdate({ 
                            cornerRadius: newRadius,
                            points: newPoints
                          });
                        }}
                        className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                      />
                      <input
                        type="number"
                        min="0"
                        max="50"
                        step="1"
                        value={selectedElement.cornerRadius || 0}
                        onChange={(e) => {
                          const newRadius = Number(e.target.value);
                          const newPoints = points.map(p => ({
                            ...p,
                            radius: p.radius !== undefined ? p.radius : newRadius
                          }));
                          handleUpdate({ 
                            cornerRadius: newRadius,
                            points: newPoints
                          });
                        }}
                        className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      Controls corner smoothness at all connection points
                    </div>
                  </div>

                  {/* Position & Rotation */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm text-gray-400">X Position</label>
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => handleCopyValue(Math.round(selectedElement.x))}
                            className="p-1 hover:bg-gray-600/50 rounded transition-colors"
                          >
                            <Copy className="w-3 h-3 text-gray-500" />
                          </button>
                          <button
                            onClick={() => handlePasteValue('x')}
                            className="p-1 hover:bg-gray-600/50 rounded transition-colors"
                          >
                            <Clipboard className="w-3 h-3 text-gray-500" />
                          </button>
                        </div>
                      </div>
                      <input
                        type="number"
                        value={Math.round(selectedElement.x)}
                        onChange={(e) => handleUpdate({ x: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                    
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm text-gray-400">Y Position</label>
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => handleCopyValue(Math.round(selectedElement.y))}
                            className="p-1 hover:bg-gray-600/50 rounded transition-colors"
                          >
                            <Copy className="w-3 h-3 text-gray-500" />
                          </button>
                          <button
                            onClick={() => handlePasteValue('y')}
                            className="p-1 hover:bg-gray-600/50 rounded transition-colors"
                          >
                            <Clipboard className="w-3 h-3 text-gray-500" />
                          </button>
                        </div>
                      </div>
                      <input
                        type="number"
                        value={Math.round(selectedElement.y)}
                        onChange={(e) => handleUpdate({ y: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                  </div>

                  {/* Transform Controls */}
                  <div>
                    <label className="text-sm text-gray-400 block mb-2">Transform</label>
                    <div className="flex items-center space-x-2">
                      <div className="flex-1">
                        <label className="text-xs text-gray-500 block mb-1">Rotation (°)</label>
                        <input
                          type="number"
                          min="-360"
                          max="360"
                          value={Math.round(selectedElement.rotation || 0)}
                          onChange={(e) => handleUpdate({ rotation: Number(e.target.value) })}
                          className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                      
                      <button
                        onClick={() => handleUpdate({ rotation: (selectedElement.rotation || 0) + 45 })}
                        className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                        title="Rotate 45°"
                      >
                        <RotateCw className="w-4 h-4 text-gray-300" />
                      </button>
                      
                      <button
                        onClick={() => handleUpdate({ 
                          points: points.map(p => ({ ...p, x: selectedElement.width - p.x }))
                        })}
                        className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                        title="Flip Horizontal"
                      >
                        <FlipHorizontal className="w-4 h-4 text-gray-300" />
                      </button>
                      
                      <button
                        onClick={() => handleUpdate({ 
                          points: points.map(p => ({ ...p, y: selectedElement.height - p.y }))
                        })}
                        className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                        title="Flip Vertical"
                      >
                        <FlipVertical className="w-4 h-4 text-gray-300" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Styling Section */}
            <div>
              <SectionHeader 
                title="Styling" 
                sectionKey="styling"
                icon={<div className="w-4 h-4 border-2 border-orange-400 rounded-full" />}
              />
              
              {expandedSections.has('styling') && (
                <div className="space-y-4 pl-4">
                  {/* Stroke Properties */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-gray-400 block mb-2">Line Color</label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="color"
                          value={selectedElement.stroke}
                          onChange={(e) => handleUpdate({ stroke: e.target.value })}
                          className="w-10 h-10 rounded-lg cursor-pointer border border-gray-600"
                        />
                        <input
                          type="text"
                          value={selectedElement.stroke}
                          onChange={(e) => handleUpdate({ stroke: e.target.value })}
                          className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-sm text-gray-400 block mb-2">Stroke Width</label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="range"
                          min="1"
                          max="50"
                          value={selectedElement.strokeWidth}
                          onChange={(e) => handleUpdate({ strokeWidth: Number(e.target.value) })}
                          className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                        />
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={Math.round(selectedElement.strokeWidth)}
                          onChange={(e) => handleUpdate({ strokeWidth: Number(e.target.value) })}
                          className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Opacity */}
                  <div>
                    <label className="text-sm text-gray-400 block mb-2">
                      Opacity: {Math.round(selectedElement.opacity * 100)}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={selectedElement.opacity}
                      onChange={(e) => handleUpdate({ opacity: Number(e.target.value) })}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                    />
                  </div>

                  {/* Line Style */}
                  <div>
                    <label className="text-sm text-gray-400 block mb-2">Line Style</label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Line Cap</label>
                        <select
                          value={selectedElement.lineCap || 'round'}
                          onChange={(e) => handleUpdate({ lineCap: e.target.value as any })}
                          className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-cyan-400"
                        >
                          <option value="round">Round</option>
                          <option value="butt">Butt</option>
                          <option value="square">Square</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Line Join</label>
                        <select
                          value={selectedElement.lineJoin || 'round'}
                          onChange={(e) => handleUpdate({ lineJoin: e.target.value as any })}
                          className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-cyan-400"
                        >
                          <option value="round">Round</option>
                          <option value="bevel">Bevel</option>
                          <option value="miter">Miter</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Dash Pattern */}
                  <div>
                    <label className="text-sm text-gray-400 block mb-2">Dash Pattern</label>
                    <div className="space-y-2">
                      <div className="grid grid-cols-4 gap-1">
                        {[
                          { value: [], label: 'Solid' },
                          { value: [5, 5], label: 'Dashed' },
                          { value: [2, 2], label: 'Dotted' },
                          { value: [10, 5, 2, 5], label: 'Dash-Dot' }
                        ].map(({ value, label }) => (
                          <button
                            key={label}
                            onClick={() => handleUpdate({ dashArray: value })}
                            className={`px-2 py-1 rounded text-xs transition-all duration-200 ${
                              JSON.stringify(selectedElement.dashArray || []) === JSON.stringify(value)
                                ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/50'
                                : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">
                          Dash Intensity: {Math.round(selectedElement.dashIntensity || 0)}
                        </label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={selectedElement.dashIntensity || 0}
                            onChange={(e) => {
                              const intensity = Number(e.target.value);
                              if (intensity === 0) {
                                handleUpdate({ dashArray: [], dashIntensity: 0 });
                              } else {
                                // Generate dash pattern based on intensity
                                const dashLength = Math.max(2, intensity / 10);
                                const gapLength = Math.max(1, intensity / 20);
                                handleUpdate({ 
                                  dashArray: [dashLength, gapLength],
                                  dashIntensity: intensity
                                });
                              }
                            }}
                            className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                          />
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={selectedElement.dashIntensity || 0}
                            onChange={(e) => {
                              const intensity = Number(e.target.value);
                              if (intensity === 0) {
                                handleUpdate({ dashArray: [], dashIntensity: intensity });
                              } else {
                                const dashLength = Math.max(2, intensity / 10);
                                const gapLength = Math.max(1, intensity / 20);
                                handleUpdate({ 
                                  dashArray: [dashLength, gapLength],
                                  dashIntensity: intensity
                                });
                              }
                            }}
                            className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs focus:outline-none focus:border-cyan-400"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Smoothing (Pen Tool Only) */}
                  {selectedElement.lineType === 'pen' && (
                    <div>
                      <label className="text-sm text-gray-400 block mb-2">Path Smoothing</label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          min="0"
                          max="1000"
                          step="0.1"
                          value={selectedElement.smoothing || 0}
                          onChange={(e) => handleUpdate({ smoothing: Number(e.target.value) })}
                          className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-400"
                          placeholder="0.0"
                        />
                        <div className="text-xs text-gray-500 min-w-[40px]">
                          {selectedElement.smoothing ? 'px' : ''}
                        </div>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Controls overall path curve smoothness. Higher values create more pronounced curves.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Pointer Customization (Arrows Only) */}
            {(selectedElement.lineType === 'arrow' || selectedElement.arrowStart || selectedElement.arrowEnd) && (
              <div>
                <SectionHeader 
                  title="Pointer Customization" 
                  sectionKey="pointers"
                  icon={<Triangle className="w-4 h-4 text-purple-400" />}
                />
                
                {expandedSections.has('pointers') && (
                  <div className="space-y-4 pl-4">
                    {/* Pointer Positions */}
                    <div>
                      <label className="text-sm text-gray-400 block mb-2">Pointer Position</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: 'none', label: 'None', start: false, end: false },
                          { value: 'start', label: 'Start Only', start: true, end: false },
                          { value: 'end', label: 'End Only', start: false, end: true },
                          { value: 'both', label: 'Both Ends', start: true, end: true }
                        ].map(({ value, label, start, end }) => (
                          <button
                            key={value}
                            onClick={() => handleUpdate({ arrowStart: start, arrowEnd: end })}
                            className={`px-2 py-2 rounded text-xs transition-all duration-200 ${
                              selectedElement.arrowStart === start && selectedElement.arrowEnd === end
                                ? 'bg-purple-400/20 text-purple-400 border border-purple-400/50'
                                : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Pointer Shape */}
                    <div>
                      <label className="text-sm text-gray-400 block mb-2">Pointer Shape</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { value: 'triangle', label: 'Classic', icon: Triangle },
                          { value: 'circle', label: 'Circle', icon: Circle },
                          { value: 'diamond', label: 'Diamond', icon: Diamond },
                          { value: 'bar', label: 'Bar', icon: () => <div className="w-4 h-1 bg-current" /> }
                        ].map(({ value, label, icon: Icon }) => (
                          <button
                            key={value}
                            onClick={() => handleUpdate({ arrowheadType: value as any })}
                            className={`flex items-center justify-center space-x-2 px-3 py-2 rounded-lg transition-all duration-200 ${
                              selectedElement.arrowheadType === value
                                ? 'bg-purple-400/20 text-purple-400 border border-purple-400/50'
                                : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                            <span className="text-sm">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Pointer Size */}
                    <div>
                      <label className="text-sm text-gray-400 block mb-2">
                        Pointer Size: {selectedElement.arrowheadSize || 12}px
                      </label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="range"
                          min="4"
                          max="50"
                          value={selectedElement.arrowheadSize || 12}
                          onChange={(e) => handleUpdate({ arrowheadSize: Number(e.target.value) })}
                          className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                        />
                        <input
                          type="number"
                          min="4"
                          max="50"
                          value={selectedElement.arrowheadSize || 12}
                          onChange={(e) => handleUpdate({ arrowheadSize: Number(e.target.value) })}
                          className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                    </div>

                    {/* Auto-scaling */}
                    <div className="flex items-center justify-between p-3 bg-gray-700/20 rounded-lg">
                      <div>
                        <div className="text-sm font-medium text-white">Auto-Scale Pointers</div>
                        <div className="text-xs text-gray-400">Scale pointer size with stroke width</div>
                      </div>
                      <button
                        onClick={() => {
                          const autoScale = !selectedElement.autoScaleArrows;
                          const newSize = autoScale ? selectedElement.strokeWidth * 3 : 12;
                          handleUpdate({ 
                            autoScaleArrows: autoScale,
                            arrowheadSize: newSize
                          });
                        }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          selectedElement.autoScaleArrows ? 'bg-purple-400' : 'bg-gray-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            selectedElement.autoScaleArrows ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Point Management */}
            <div>
              <SectionHeader 
                title="Point Management" 
                sectionKey="points"
                icon={<Circle className="w-4 h-4 text-green-400" />}
              />
              
              {expandedSections.has('points') && (
                <div className="space-y-4 pl-4">
                  {/* Point List */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm text-gray-400">Control Points ({points.length})</label>
                      <button
                        onClick={addPoint}
                        className="flex items-center space-x-1 px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Point</span>
                      </button>
                    </div>
                    
                    <div className="max-h-48 overflow-y-auto space-y-2">
                      {points.map((point, index) => (
                        <div key={index} className="p-3 bg-gray-700/20 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-white">Point {index + 1}</span>
                            <div className="flex items-center space-x-1">
                              <button
                                onClick={() => duplicatePoint(index)}
                                className="p-1 hover:bg-gray-600/50 rounded transition-colors"
                                title="Duplicate point"
                              >
                                <Copy className="w-3 h-3 text-gray-400" />
                              </button>
                              {points.length > 2 && (
                                <button
                                  onClick={() => removePoint(index)}
                                  className="p-1 hover:bg-red-600/50 rounded transition-colors"
                                  title="Delete point"
                                >
                                  <Trash2 className="w-3 h-3 text-red-400" />
                                </button>
                              )}
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-xs text-gray-500">X</label>
                                <div className="flex items-center space-x-1">
                                  <button
                                    onClick={() => handleCopyValue(Math.round(point.x))}
                                    className="p-0.5 hover:bg-gray-600/50 rounded transition-colors"
                                  >
                                    <Copy className="w-2.5 h-2.5 text-gray-500" />
                                  </button>
                                  <button
                                    onClick={() => handlePasteValue('x', index)}
                                    className="p-0.5 hover:bg-gray-600/50 rounded transition-colors"
                                  >
                                    <Clipboard className="w-2.5 h-2.5 text-gray-500" />
                                  </button>
                                </div>
                              </div>
                              <input
                                type="number"
                                value={Math.round(point.x)}
                                onChange={(e) => handlePointUpdate(index, { x: Number(e.target.value) })}
                                className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs focus:outline-none focus:border-cyan-400"
                              />
                            </div>
                            
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-xs text-gray-500">Y</label>
                                <div className="flex items-center space-x-1">
                                  <button
                                    onClick={() => handleCopyValue(Math.round(point.y))}
                                    className="p-0.5 hover:bg-gray-600/50 rounded transition-colors"
                                  >
                                    <Copy className="w-2.5 h-2.5 text-gray-500" />
                                  </button>
                                  <button
                                    onClick={() => handlePasteValue('y', index)}
                                    className="p-0.5 hover:bg-gray-600/50 rounded transition-colors"
                                  >
                                    <Clipboard className="w-2.5 h-2.5 text-gray-500" />
                                  </button>
                                </div>
                              </div>
                              <input
                                type="number"
                                value={Math.round(point.y)}
                                onChange={(e) => handlePointUpdate(index, { y: Number(e.target.value) })}
                                className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs focus:outline-none focus:border-cyan-400"
                              />
                            </div>
                          </div>

                          {/* Per-Point Controls for Pen Tool */}
                          {selectedElement.lineType === 'pen' && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <label className="text-xs text-gray-500">Smooth Curve</label>
                                <button
                                  onClick={() => handlePointUpdate(index, { smooth: !point.smooth })}
                                  className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${
                                    point.smooth !== false ? 'bg-cyan-400' : 'bg-gray-600'
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                                      point.smooth !== false ? 'translate-x-4' : 'translate-x-1'
                                    }`}
                                  />
                                </button>
                              </div>
                              
                              {point.smooth !== false && (
                                <div>
                                  <label className="text-xs text-gray-500 block mb-1">
                                    Corner Radius: {Math.round((point.cornerRadius || 0) * 100)}%
                                  </label>
                                  <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={point.cornerRadius || 0}
                                    onChange={(e) => handlePointUpdate(index, { cornerRadius: Number(e.target.value) })}
                                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Close Path (Pen Tool) */}
                  {selectedElement.lineType === 'pen' && (
                    <div className="flex items-center justify-between p-3 bg-gray-700/20 rounded-lg">
                      <div>
                        <div className="text-sm font-medium text-white">Close Path</div>
                        <div className="text-xs text-gray-400">Connect last point to first point</div>
                      </div>
                      <button
                        onClick={() => handleUpdate({ closePath: !selectedElement.closePath })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          selectedElement.closePath ? 'bg-green-400' : 'bg-gray-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            selectedElement.closePath ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  )}

                  {/* Fill Color (Closed Paths) */}
                  {selectedElement.lineType === 'pen' && selectedElement.closePath && (
                    <div>
                      <label className="text-sm text-gray-400 block mb-2">Fill Color</label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="color"
                          value={selectedElement.fill}
                          onChange={(e) => handleUpdate({ fill: e.target.value })}
                          className="w-10 h-10 rounded-lg cursor-pointer border border-gray-600"
                        />
                        <input
                          type="text"
                          value={selectedElement.fill}
                          onChange={(e) => handleUpdate({ fill: e.target.value })}
                          className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Advanced Options */}
            <div>
              <SectionHeader 
                title="Advanced Options" 
                sectionKey="advanced"
                icon={<div className="w-4 h-4 border border-yellow-400" />}
              />
              
              {expandedSections.has('advanced') && (
                <div className="space-y-4 pl-4">
                  {/* Trim Animation */}
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-gray-400 block mb-2">
                        Trim Start: {Math.round((selectedElement.trimStart || 0) * 100)}%
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={selectedElement.trimStart || 0}
                        onChange={(e) => handleUpdate({ trimStart: Number(e.target.value) })}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                      />
                    </div>

                    <div>
                      <label className="text-sm text-gray-400 block mb-2">
                        Trim End: {Math.round((selectedElement.trimEnd || 1) * 100)}%
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={selectedElement.trimEnd || 1}
                        onChange={(e) => handleUpdate({ trimEnd: Number(e.target.value) })}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                      />
                    </div>
                  </div>

                  {/* Shadow */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-medium text-gray-300">Drop Shadow</h5>
                    
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Shadow Blur</label>
                      <input
                        type="number"
                        min="0"
                        value={Math.round(selectedElement.shadow?.blur || 0)}
                        onChange={(e) => handleUpdate({ 
                          shadow: { 
                            ...selectedElement.shadow, 
                            blur: Number(e.target.value) 
                          }
                        })}
                        className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Shadow X</label>
                        <input
                          type="number"
                          value={Math.round(selectedElement.shadow?.x || 0)}
                          onChange={(e) => handleUpdate({ 
                            shadow: { 
                              ...selectedElement.shadow, 
                              x: Number(e.target.value) 
                            }
                          })}
                          className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Shadow Y</label>
                        <input
                          type="number"
                          value={Math.round(selectedElement.shadow?.y || 0)}
                          onChange={(e) => handleUpdate({ 
                            shadow: { 
                              ...selectedElement.shadow, 
                              y: Number(e.target.value) 
                            }
                          })}
                          className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Shadow Color</label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="color"
                          value={selectedElement.shadow?.color || '#000000'}
                          onChange={(e) => handleUpdate({ 
                            shadow: { 
                              ...selectedElement.shadow, 
                              color: e.target.value 
                            }
                          })}
                          className="w-8 h-8 rounded cursor-pointer border border-gray-600"
                        />
                        <input
                          type="text"
                          value={selectedElement.shadow?.color || '#000000'}
                          onChange={(e) => handleUpdate({ 
                            shadow: { 
                              ...selectedElement.shadow, 
                              color: e.target.value 
                            }
                          })}
                          className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-700 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-400">
                <p>Tip: Double-click on line path to add points. Right-click points to delete.</p>
              </div>
              
              <div className="flex items-center space-x-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LinePropertiesBar;