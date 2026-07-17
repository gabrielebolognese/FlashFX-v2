import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';
import {
  BackgroundConfig,
  GradientLayer,
  ColorStop,
  createDefaultColorStop,
  createDefaultGradientLayer,
  GradientType,
  LinearDirection,
  RadialType,
  BlendMode
} from '../../types/background';

interface BackgroundSettingsPanelProps {
  background: BackgroundConfig;
  onUpdate: (background: BackgroundConfig) => void;
}

function buildLayerPreview(layer: GradientLayer): string {
  const stops = [...layer.colorStops].sort((a, b) => a.position - b.position);
  if (stops.length === 0) return 'transparent';
  if (stops.length === 1) return stops[0].color;

  const stopStr = stops
    .map(s => {
      const hex = s.color;
      const opacity = (s.opacity ?? 100) / 100;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${opacity}) ${s.position}%`;
    })
    .join(', ');

  if (layer.type === 'radial') return `radial-gradient(circle, ${stopStr})`;

  const dirMap: Record<string, string> = {
    'top-to-bottom': 'to bottom',
    'bottom-to-top': 'to top',
    'left-to-right': 'to right',
    'right-to-left': 'to left',
    'diagonal-tl-br': 'to bottom right',
    'diagonal-tr-bl': 'to bottom left',
  };
  const dir = dirMap[layer.direction || 'top-to-bottom'] ?? 'to bottom';
  return `linear-gradient(${dir}, ${stopStr})`;
}

const BackgroundSettingsPanel: React.FC<BackgroundSettingsPanelProps> = ({
  background,
  onUpdate
}) => {
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set());

  const toggleLayerExpanded = (layerId: string) => {
    const next = new Set(expandedLayers);
    if (next.has(layerId)) next.delete(layerId);
    else next.add(layerId);
    setExpandedLayers(next);
  };

  const addSolidColorLayer = () => {
    const solidLayer: GradientLayer = {
      id: `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'linear',
      colorStops: [createDefaultColorStop('#1e293b', 0)],
      direction: 'top-to-bottom',
      angle: 180,
      blendMode: 'normal',
      opacity: 100
    };
    onUpdate({ ...background, enabled: true, layers: [solidLayer] });
    setExpandedLayers(new Set([solidLayer.id]));
  };

  const addLayer = () => {
    if (background.layers.length >= 4) return;
    const newLayer = createDefaultGradientLayer();
    onUpdate({ ...background, enabled: true, layers: [...background.layers, newLayer] });
    setExpandedLayers(new Set([...expandedLayers, newLayer.id]));
  };

  const removeLayer = (layerId: string) => {
    const newLayers = background.layers.filter(l => l.id !== layerId);
    onUpdate({ ...background, enabled: newLayers.length > 0, layers: newLayers });
    const next = new Set(expandedLayers);
    next.delete(layerId);
    setExpandedLayers(next);
  };

  const updateLayer = (layerId: string, updates: Partial<GradientLayer>) => {
    const newLayers = background.layers.map(l =>
      l.id === layerId ? { ...l, ...updates } : l
    );
    onUpdate({ ...background, layers: newLayers });
  };

  const addColorStop = (layerId: string) => {
    const layer = background.layers.find(l => l.id === layerId);
    if (!layer) return;
    const lastPos = layer.colorStops.length > 0
      ? Math.max(...layer.colorStops.map(s => s.position))
      : 0;
    const newStop = createDefaultColorStop('#8B5CF6', Math.min(lastPos + 25, 100));
    updateLayer(layerId, { colorStops: [...layer.colorStops, newStop] });
  };

  const removeColorStop = (layerId: string, stopId: string) => {
    const layer = background.layers.find(l => l.id === layerId);
    if (!layer || layer.colorStops.length <= 1) return;
    updateLayer(layerId, { colorStops: layer.colorStops.filter(s => s.id !== stopId) });
  };

  const updateColorStop = (layerId: string, stopId: string, updates: Partial<ColorStop>) => {
    const layer = background.layers.find(l => l.id === layerId);
    if (!layer) return;
    const newStops = layer.colorStops.map(s =>
      s.id === stopId ? { ...s, ...updates } : s
    );
    updateLayer(layerId, { colorStops: newStops });
  };

  const moveLayer = (layerId: string, direction: 'up' | 'down') => {
    const idx = background.layers.findIndex(l => l.id === layerId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === background.layers.length - 1) return;
    const next = [...background.layers];
    const target = direction === 'up' ? idx - 1 : idx + 1;
    [next[idx], next[target]] = [next[target], next[idx]];
    onUpdate({ ...background, layers: next });
  };

  const clearBackground = () => {
    onUpdate({ enabled: false, layers: [] });
    setExpandedLayers(new Set());
  };

  if (background.layers.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <button
          onClick={addSolidColorLayer}
          title="Add background"
          className="w-9 h-9 rounded-lg border border-gray-600/60 bg-gray-800/60 hover:bg-gray-700/70 hover:border-gray-500/80 text-gray-400 hover:text-white transition-all duration-150 flex items-center justify-center shadow-sm hover:shadow-md"
        >
          <Plus className="w-4 h-4" strokeWidth={1.8} />
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {background.layers.map((layer, index) => {
          const preview = buildLayerPreview(layer);
          const isExpanded = expandedLayers.has(layer.id);

          return (
            <div
              key={layer.id}
              className="rounded-lg border border-gray-700/50 overflow-hidden bg-gray-800/40"
            >
              <div
                className="flex items-center gap-1.5 p-1.5 cursor-pointer hover:bg-gray-700/30 transition-colors"
                onClick={() => toggleLayerExpanded(layer.id)}
              >
                <div
                  className="w-8 h-5 rounded flex-shrink-0 border border-gray-600/40"
                  style={{ background: preview }}
                />

                <div className="flex-1 min-w-0" />

                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); moveLayer(layer.id, 'up'); }}
                    disabled={index === 0}
                    title="Move up"
                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-600/50 disabled:opacity-20 transition-colors"
                  >
                    <ChevronUp className="w-3 h-3 text-gray-400" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); moveLayer(layer.id, 'down'); }}
                    disabled={index === background.layers.length - 1}
                    title="Move down"
                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-600/50 disabled:opacity-20 transition-colors"
                  >
                    <ChevronDown className="w-3 h-3 text-gray-400" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); removeLayer(layer.id); }}
                    title="Remove layer"
                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-500/20 transition-colors"
                  >
                    <Trash2 className="w-3 h-3 text-gray-500 hover:text-red-400" />
                  </button>
                  <ChevronRight
                    className={`w-3 h-3 text-gray-500 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
                  />
                </div>
              </div>

              {isExpanded && (
                <div className="px-2 pb-2 pt-1 space-y-2 border-t border-gray-700/40">
                  {layer.colorStops.length > 1 && (
                    <div className="space-y-1.5">
                      <select
                        value={layer.type}
                        onChange={e => updateLayer(layer.id, { type: e.target.value as GradientType })}
                        title="Gradient type"
                        className="w-full px-2 py-1 text-xs bg-gray-700/60 border border-gray-600/50 rounded-md text-gray-200 focus:outline-none focus:border-gray-500 appearance-none"
                      >
                        <option value="linear">Linear</option>
                        <option value="radial">Radial</option>
                      </select>

                      {layer.type === 'linear' && (
                        <select
                          value={layer.direction || 'top-to-bottom'}
                          onChange={e => updateLayer(layer.id, { direction: e.target.value as LinearDirection })}
                          title="Direction"
                          className="w-full px-2 py-1 text-xs bg-gray-700/60 border border-gray-600/50 rounded-md text-gray-200 focus:outline-none focus:border-gray-500 appearance-none"
                        >
                          <option value="top-to-bottom">Top → Bottom</option>
                          <option value="bottom-to-top">Bottom → Top</option>
                          <option value="left-to-right">Left → Right</option>
                          <option value="right-to-left">Right → Left</option>
                          <option value="diagonal-tl-br">Diagonal ↘</option>
                          <option value="diagonal-tr-bl">Diagonal ↙</option>
                        </select>
                      )}

                      {layer.type === 'radial' && (
                        <select
                          value={layer.radialType || 'center'}
                          onChange={e => updateLayer(layer.id, { radialType: e.target.value as RadialType })}
                          title="Radial position"
                          className="w-full px-2 py-1 text-xs bg-gray-700/60 border border-gray-600/50 rounded-md text-gray-200 focus:outline-none focus:border-gray-500 appearance-none"
                        >
                          <option value="center">Center</option>
                          <option value="top-left">Top Left</option>
                          <option value="top-right">Top Right</option>
                          <option value="bottom-left">Bottom Left</option>
                          <option value="bottom-right">Bottom Right</option>
                        </select>
                      )}

                      <select
                        value={layer.blendMode}
                        onChange={e => updateLayer(layer.id, { blendMode: e.target.value as BlendMode })}
                        title="Blend mode"
                        className="w-full px-2 py-1 text-xs bg-gray-700/60 border border-gray-600/50 rounded-md text-gray-200 focus:outline-none focus:border-gray-500 appearance-none"
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
                  )}

                  <div className="space-y-1.5">
                    {[...layer.colorStops]
                      .sort((a, b) => a.position - b.position)
                      .map(stop => (
                        <div key={stop.id} className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={stop.color}
                              onChange={e => updateColorStop(layer.id, stop.id, { color: e.target.value })}
                              className="w-7 h-7 rounded-md border border-gray-600/50 cursor-pointer bg-transparent flex-shrink-0"
                              title="Color"
                            />
                            <input
                              type="text"
                              value={stop.color}
                              onChange={e => updateColorStop(layer.id, stop.id, { color: e.target.value })}
                              className="flex-1 min-w-0 px-2 py-1 text-xs bg-gray-700/60 border border-gray-600/50 rounded-md text-gray-200 focus:outline-none focus:border-gray-500 font-mono"
                              title="Hex color"
                            />
                            {layer.colorStops.length > 1 && (
                              <button
                                onClick={() => removeColorStop(layer.id, stop.id)}
                                title="Remove color"
                                className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/20 flex-shrink-0 transition-colors"
                              >
                                <Trash2 className="w-3 h-3 text-gray-500 hover:text-red-400" />
                              </button>
                            )}
                          </div>

                          {layer.colorStops.length > 1 && (
                            <div className="pl-8 space-y-1">
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={stop.position}
                                onChange={e => updateColorStop(layer.id, stop.id, { position: Number(e.target.value) })}
                                title={`Position: ${stop.position}%`}
                                className="w-full h-0.5 bg-gray-600/60 rounded-full appearance-none cursor-pointer accent-gray-400"
                              />
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={stop.opacity}
                                onChange={e => updateColorStop(layer.id, stop.id, { opacity: Number(e.target.value) })}
                                title={`Opacity: ${stop.opacity}%`}
                                className="w-full h-0.5 bg-gray-600/60 rounded-full appearance-none cursor-pointer accent-gray-400"
                              />
                            </div>
                          )}
                        </div>
                      ))}

                    {layer.colorStops.length < 10 && (
                      <button
                        onClick={() => addColorStop(layer.id)}
                        title="Add color stop"
                        className="w-full h-6 rounded-md border border-dashed border-gray-600/50 hover:border-gray-500/70 text-gray-500 hover:text-gray-400 flex items-center justify-center transition-all"
                      >
                        <Plus className="w-3 h-3" strokeWidth={1.8} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-2 flex items-center justify-between border-t border-gray-700/30">
        {background.layers.length < 4 ? (
          <button
            onClick={addLayer}
            title="Add gradient layer"
            className="w-7 h-7 rounded-md border border-gray-600/60 bg-gray-800/60 hover:bg-gray-700/70 hover:border-gray-500/80 text-gray-400 hover:text-white transition-all flex items-center justify-center"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.8} />
          </button>
        ) : (
          <div />
        )}

        <button
          onClick={clearBackground}
          title="Clear background"
          className="w-7 h-7 rounded-md hover:bg-red-500/10 border border-transparent hover:border-red-500/20 text-gray-600 hover:text-red-400 transition-all flex items-center justify-center"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default BackgroundSettingsPanel;
