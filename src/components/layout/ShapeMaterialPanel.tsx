import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, GripVertical, Palette, Copy } from 'lucide-react';
import {
  ShapeMaterialConfig,
  MaterialFillLayer,
  MaterialColorStop,
  createDefaultMaterialColorStop,
  createDefaultMaterialFillLayer,
  MaterialGradientType,
  MaterialLinearDirection,
  MaterialRadialType,
  MaterialBlendMode
} from '../../types/material';
import { DesignElement } from '../../types/design';
import ShapePatternFillPanel from './ShapePatternFillPanel';

interface ShapeMaterialPanelProps {
  selectedElements: DesignElement[];
  updateElement: (id: string, updates: Partial<DesignElement>) => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
}

const ShapeMaterialPanel: React.FC<ShapeMaterialPanelProps> = ({
  selectedElements,
  updateElement,
  onInteractionStart,
  onInteractionEnd,
}) => {
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set());
  const [isPanelExpanded, setIsPanelExpanded] = useState(true);
  const [isStrokePanelExpanded, setIsStrokePanelExpanded] = useState(false);

  if (selectedElements.length === 0) return null;

  const selectedElement = selectedElements[0];
  const materialConfig = selectedElement.materialConfig || { enabled: false, layers: [] };
  const strokeMaterialConfig = selectedElement.strokeMaterialConfig || { enabled: false, layers: [] };

  const toggleLayerExpanded = (layerId: string) => {
    const newExpanded = new Set(expandedLayers);
    if (newExpanded.has(layerId)) {
      newExpanded.delete(layerId);
    } else {
      newExpanded.add(layerId);
    }
    setExpandedLayers(newExpanded);
  };

  const updateMaterial = (config: ShapeMaterialConfig) => {
    selectedElements.forEach(element => {
      updateElement(element.id, { materialConfig: config });
    });
  };

  const updateStrokeMaterial = (config: ShapeMaterialConfig) => {
    selectedElements.forEach(element => {
      updateElement(element.id, { strokeMaterialConfig: config });
    });
  };

  const matchStrokeToFill = () => {
    if (materialConfig.enabled && materialConfig.layers.length > 0) {
      const copiedLayers = JSON.parse(JSON.stringify(materialConfig.layers));
      copiedLayers.forEach((layer: MaterialFillLayer) => {
        layer.id = `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      });
      updateStrokeMaterial({
        enabled: true,
        layers: copiedLayers
      });
    }
  };

  const renderLayerSystem = (
    config: ShapeMaterialConfig,
    updateConfig: (config: ShapeMaterialConfig) => void,
    isStroke: boolean = false
  ) => {
    const addSolidColorLayer = () => {
      const solidLayer: MaterialFillLayer = {
        id: `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'linear',
        colorStops: [createDefaultMaterialColorStop(isStroke ? '#000000' : '#3B82F6', 0)],
        direction: 'top-to-bottom',
        angle: 180,
        blendMode: 'normal',
        opacity: 100
      };

      updateConfig({
        enabled: true,
        layers: [solidLayer]
      });
      setExpandedLayers(new Set([solidLayer.id]));
    };

    const addLayer = () => {
      if (config.layers.length >= 8) return;

      const newLayer = createDefaultMaterialFillLayer();
      updateConfig({
        enabled: true,
        layers: [...config.layers, newLayer]
      });
      setExpandedLayers(new Set([...expandedLayers, newLayer.id]));
    };

    const removeLayer = (layerId: string) => {
      const newLayers = config.layers.filter(l => l.id !== layerId);
      updateConfig({
        enabled: newLayers.length > 0,
        layers: newLayers
      });

      const newExpanded = new Set(expandedLayers);
      newExpanded.delete(layerId);
      setExpandedLayers(newExpanded);
    };

    const updateLayer = (layerId: string, updates: Partial<MaterialFillLayer>) => {
      const newLayers = config.layers.map(layer =>
        layer.id === layerId ? { ...layer, ...updates } : layer
      );
      updateConfig({ ...config, layers: newLayers });
    };

    const addColorStop = (layerId: string) => {
      const layer = config.layers.find(l => l.id === layerId);
      if (!layer) return;

      const lastPosition = layer.colorStops.length > 0
        ? Math.max(...layer.colorStops.map(s => s.position))
        : 0;

      const newStop = createDefaultMaterialColorStop('#8B5CF6', Math.min(lastPosition + 25, 100));

      updateLayer(layerId, {
        colorStops: [...layer.colorStops, newStop]
      });
    };

    const removeColorStop = (layerId: string, stopId: string) => {
      const layer = config.layers.find(l => l.id === layerId);
      if (!layer || layer.colorStops.length <= 1) return;

      updateLayer(layerId, {
        colorStops: layer.colorStops.filter(s => s.id !== stopId)
      });
    };

    const updateColorStop = (layerId: string, stopId: string, updates: Partial<MaterialColorStop>) => {
      const layer = config.layers.find(l => l.id === layerId);
      if (!layer) return;

      const newStops = layer.colorStops.map(stop =>
        stop.id === stopId ? { ...stop, ...updates } : stop
      );

      updateLayer(layerId, { colorStops: newStops });
    };

    const handleColorStopMouseDown = () => {
      onInteractionStart?.();
    };

    const handleColorStopBlur = () => {
      onInteractionEnd?.();
    };

    const moveLayer = (layerId: string, direction: 'up' | 'down') => {
      const index = config.layers.findIndex(l => l.id === layerId);
      if (index === -1) return;
      if (direction === 'up' && index === 0) return;
      if (direction === 'down' && index === config.layers.length - 1) return;

      const newLayers = [...config.layers];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      [newLayers[index], newLayers[targetIndex]] = [newLayers[targetIndex], newLayers[index]];

      updateConfig({ ...config, layers: newLayers });
    };

    const clearMaterial = () => {
      updateConfig({
        enabled: false,
        layers: []
      });
      setExpandedLayers(new Set());
    };

    return (
      <>
        {config.layers.length === 0 ? (
          <div className="bg-gray-700/30 rounded p-3">
            <p className="text-xs text-gray-400 mb-2 text-center">No {isStroke ? 'stroke' : 'fill'} layers</p>
            <button
              onClick={addSolidColorLayer}
              className="w-full py-2 px-3 rounded bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-medium transition-all flex items-center justify-center gap-2 text-xs shadow-lg hover:shadow-xl"
            >
              <Palette className="w-3.5 h-3.5" />
              Add {isStroke ? 'Stroke' : 'Fill'} Color
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {config.layers.map((layer, index) => (
              <div
                key={layer.id}
                className="bg-gray-700/30 rounded border border-gray-600/50 overflow-hidden"
              >
                <div
                  className="flex items-center justify-between p-1.5 cursor-pointer hover:bg-gray-600/30 transition-colors"
                  onClick={() => toggleLayerExpanded(layer.id)}
                >
                  <div className="flex items-center gap-1.5 flex-1">
                    <GripVertical className="w-3 h-3 text-gray-500" />
                    <span className="text-xs font-medium text-white">
                      Layer {index + 1}
                      {layer.colorStops.length === 1 && ' (Solid)'}
                      {layer.colorStops.length > 1 && ` (${layer.type})`}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <div className="flex gap-0.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          moveLayer(layer.id, 'up');
                        }}
                        disabled={index === 0}
                        className="p-0.5 rounded hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move Up"
                      >
                        <ChevronUp className="w-3 h-3 text-gray-400" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          moveLayer(layer.id, 'down');
                        }}
                        disabled={index === config.layers.length - 1}
                        className="p-0.5 rounded hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move Down"
                      >
                        <ChevronDown className="w-3 h-3 text-gray-400" />
                      </button>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeLayer(layer.id);
                      }}
                      className="p-0.5 rounded hover:bg-red-500/20 transition-colors"
                      title="Remove Layer"
                    >
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                </div>

                {expandedLayers.has(layer.id) && (
                  <div className="p-2 space-y-2 border-t border-gray-600/50">
                    {layer.colorStops.length > 1 && (
                      <>
                        <div>
                          <label className="text-xs font-medium text-gray-300 block mb-1">
                            Gradient Type
                          </label>
                          <select
                            value={layer.type}
                            onChange={(e) => updateLayer(layer.id, { type: e.target.value as MaterialGradientType })}
                            className="w-full px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-cyan-400"
                          >
                            <option value="linear">Linear</option>
                            <option value="radial">Radial</option>
                          </select>
                        </div>

                        {layer.type === 'linear' && (
                          <div>
                            <label className="text-xs font-medium text-gray-300 block mb-1">
                              Direction
                            </label>
                            <select
                              value={layer.direction || 'top-to-bottom'}
                              onChange={(e) => updateLayer(layer.id, { direction: e.target.value as MaterialLinearDirection })}
                              className="w-full px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-cyan-400"
                            >
                              <option value="top-to-bottom">Top → Bottom</option>
                              <option value="bottom-to-top">Bottom → Top</option>
                              <option value="left-to-right">Left → Right</option>
                              <option value="right-to-left">Right → Left</option>
                              <option value="diagonal-tl-br">Diagonal ↘</option>
                              <option value="diagonal-tr-bl">Diagonal ↙</option>
                            </select>
                          </div>
                        )}

                        {layer.type === 'radial' && (
                          <div>
                            <label className="text-xs font-medium text-gray-300 block mb-1">
                              Position
                            </label>
                            <select
                              value={layer.radialType || 'center'}
                              onChange={(e) => updateLayer(layer.id, { radialType: e.target.value as MaterialRadialType })}
                              className="w-full px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-cyan-400"
                            >
                              <option value="center">Center</option>
                              <option value="top-left">Top Left</option>
                              <option value="top-right">Top Right</option>
                              <option value="bottom-left">Bottom Left</option>
                              <option value="bottom-right">Bottom Right</option>
                            </select>
                          </div>
                        )}

                        <div>
                          <label className="text-xs font-medium text-gray-300 block mb-1">
                            Blend Mode
                          </label>
                          <select
                            value={layer.blendMode}
                            onChange={(e) => updateLayer(layer.id, { blendMode: e.target.value as MaterialBlendMode })}
                            className="w-full px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-cyan-400"
                          >
                            <option value="normal">Normal</option>
                            <option value="multiply">Multiply</option>
                            <option value="screen">Screen</option>
                            <option value="overlay">Overlay</option>
                            <option value="darken">Darken</option>
                            <option value="lighten">Lighten</option>
                            <option value="color-dodge">Color Dodge</option>
                            <option value="color-burn">Color Burn</option>
                            <option value="hard-light">Hard Light</option>
                            <option value="soft-light">Soft Light</option>
                            <option value="difference">Difference</option>
                            <option value="exclusion">Exclusion</option>
                          </select>
                        </div>
                      </>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-medium text-gray-300">
                          Colors ({layer.colorStops.length})
                        </label>
                        {layer.colorStops.length < 10 && (
                          <button
                            onClick={() => addColorStop(layer.id)}
                            className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" />
                            Add
                          </button>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        {layer.colorStops.sort((a, b) => a.position - b.position).map((stop) => (
                          <div
                            key={stop.id}
                            className="bg-gray-700/50 rounded p-1.5 space-y-1.5"
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={stop.color}
                                onMouseDown={handleColorStopMouseDown}
                                onChange={(e) => updateColorStop(layer.id, stop.id, { color: e.target.value })}
                                onBlur={handleColorStopBlur}
                                className="w-7 h-7 rounded border border-gray-600 cursor-pointer"
                              />
                              <div className="flex-1">
                                <input
                                  type="text"
                                  value={stop.color}
                                  onFocus={handleColorStopMouseDown}
                                  onChange={(e) => updateColorStop(layer.id, stop.id, { color: e.target.value })}
                                  onBlur={handleColorStopBlur}
                                  className="w-full px-1.5 py-0.5 text-xs bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:border-cyan-400"
                                />
                              </div>
                              {layer.colorStops.length > 1 && (
                                <button
                                  onClick={() => removeColorStop(layer.id, stop.id)}
                                  className="p-0.5 rounded hover:bg-red-500/20 transition-colors"
                                  title="Remove Color"
                                >
                                  <Trash2 className="w-3 h-3 text-red-400" />
                                </button>
                              )}
                            </div>

                            {layer.colorStops.length > 1 && (
                              <>
                                <div>
                                  <label className="text-xs text-gray-400 block mb-0.5">
                                    Position: {stop.position}%
                                  </label>
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={stop.position}
                                    onChange={(e) => updateColorStop(layer.id, stop.id, { position: Number(e.target.value) })}
                                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                                  />
                                </div>

                                <div>
                                  <label className="text-xs text-gray-400 block mb-0.5">
                                    Opacity: {stop.opacity}%
                                  </label>
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={stop.opacity}
                                    onChange={(e) => updateColorStop(layer.id, stop.id, { opacity: Number(e.target.value) })}
                                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                                  />
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {config.layers.length < 8 && (
              <button
                onClick={addLayer}
                className="w-full py-1.5 px-2 rounded border border-dashed border-gray-600 text-gray-400 hover:border-cyan-400 hover:text-cyan-400 transition-all flex items-center justify-center gap-1.5 text-xs font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Layer ({config.layers.length}/8)
              </button>
            )}

            {config.layers.length > 0 && (
              <button
                onClick={clearMaterial}
                className="w-full py-1.5 px-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all text-xs font-medium"
              >
                Clear All Layers
              </button>
            )}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="space-y-3">
      {/* Fill Material Panel */}
      <div className="bg-gray-700/20 rounded-lg border border-gray-600/30">
        <div className="flex items-center justify-between hover:bg-gray-600/20 transition-colors">
          <button
            onClick={() => setIsPanelExpanded(!isPanelExpanded)}
            className="flex-1 flex items-center justify-between p-2"
          >
            <h4 className="text-xs font-medium text-white flex items-center">
              <span className="w-1 h-1 bg-cyan-400 rounded-full mr-1.5"></span>
              Fill & Material
            </h4>
            {isPanelExpanded ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>
          <button
            onClick={() => {
              if (materialConfig.layers.length > 0) {
                updateMaterial({ enabled: false, layers: [] });
                setExpandedLayers(new Set());
              }
            }}
            className={`text-xs font-medium px-2 py-0.5 mr-1 rounded ${
              materialConfig.layers.length === 0
                ? 'text-yellow-400'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            None
          </button>
        </div>
        {isPanelExpanded && (
          <div className="p-2 border-t border-gray-600/30">
            {renderLayerSystem(materialConfig, updateMaterial, false)}
          </div>
        )}
      </div>

      {/* Stroke Material Panel */}
      <div className="bg-gray-700/20 rounded-lg border border-gray-600/30">
        <div className="flex items-center justify-between hover:bg-gray-600/20 transition-colors">
          <button
            onClick={() => setIsStrokePanelExpanded(!isStrokePanelExpanded)}
            className="flex-1 flex items-center justify-between p-2"
          >
            <h4 className="text-xs font-medium text-white flex items-center">
              <span className="w-1 h-1 bg-green-400 rounded-full mr-1.5"></span>
              Stroke Material
            </h4>
            {isStrokePanelExpanded ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>
          <button
            onClick={() => {
              if (strokeMaterialConfig.layers.length > 0) {
                updateStrokeMaterial({ enabled: false, layers: [] });
                setExpandedLayers(new Set());
              }
            }}
            className={`text-xs font-medium px-2 py-0.5 mr-1 rounded ${
              strokeMaterialConfig.layers.length === 0
                ? 'text-yellow-400'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            None
          </button>
        </div>
        {isStrokePanelExpanded && (
          <div className="p-2 border-t border-gray-600/30 space-y-2">
            {materialConfig.enabled && materialConfig.layers.length > 0 && (
              <button
                onClick={matchStrokeToFill}
                className="w-full py-2 px-3 rounded bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 text-green-300 hover:from-green-500/30 hover:to-emerald-500/30 transition-all flex items-center justify-center gap-2 text-xs font-medium"
              >
                <Copy className="w-3.5 h-3.5" />
                Match to Fill Color
              </button>
            )}
            {renderLayerSystem(strokeMaterialConfig, updateStrokeMaterial, true)}
          </div>
        )}
      </div>

      {/* Pattern Fill Panel */}
      <ShapePatternFillPanel
        selectedElements={selectedElements}
        updateElement={updateElement}
      />
    </div>
  );
};

export default ShapeMaterialPanel;
