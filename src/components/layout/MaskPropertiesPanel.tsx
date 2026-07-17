import React, { useState } from 'react';
import { Plus, Trash2, Eye, EyeOff, ChevronDown, ChevronRight, Link, Unlink, Copy, Maximize2 } from 'lucide-react';
import { DesignElement, ClipMask } from '../../types/design';
import { v4 as uuidv4 } from 'uuid';

interface MaskPropertiesPanelProps {
  selectedElements: DesignElement[];
  updateElement: (id: string, updates: Partial<DesignElement>) => void;
  maskProp?: 'masks' | 'shadowMasks';
  panelTitle?: string;
}

const MASK_TYPES = [
  { type: 'rectangle' as const, label: 'Rectangle', icon: '▭' },
  { type: 'circle' as const, label: 'Circle', icon: '○' },
  { type: 'star' as const, label: 'Star', icon: '☆' },
  { type: 'line' as const, label: 'Line', icon: '⟋' },
] as const;

function createDefaultMask(type: ClipMask['type'], element: DesignElement, existingCount = 0): ClipMask {
  const name = `Mask ${existingCount + 1}`;

  const maskWidth = element.width * 0.8;
  const maskHeight = element.height * 0.8;
  const maskX = element.width * 0.1;
  const maskY = element.height * 0.1;

  const base: ClipMask = {
    id: uuidv4(),
    name,
    type,
    enabled: true,
    inverted: false,
    feather: 0,
    expand: 0,
    opacity: 100,
    x: maskX,
    y: maskY,
    width: maskWidth,
    height: maskHeight,
    rotation: 0,
    borderRadius: 0,
    linked: true,
  };

  if (type === 'star') {
    base.starPoints = 5;
    base.starInnerRadius = 50;
  }

  if (type === 'line') {
    base.lineAngle = 0;
    base.lineOffset = 0;
    base.lineSide = 'above';
  }

  return base;
}

const MaskPropertiesPanel: React.FC<MaskPropertiesPanelProps> = ({
  selectedElements,
  updateElement,
  maskProp = 'masks',
  panelTitle,
}) => {
  const [expandedMasks, setExpandedMasks] = useState<Set<string>>(new Set());
  const [showAddMenu, setShowAddMenu] = useState(false);

  if (selectedElements.length === 0) return null;

  const element = selectedElements[0];
  const masks = (element[maskProp] as ClipMask[] | undefined) || [];

  const handleUpdate = (updates: Partial<DesignElement>) => {
    selectedElements.forEach(el => {
      updateElement(el.id, updates);
    });
  };

  const setMasks = (next: ClipMask[]) => handleUpdate({ [maskProp]: next });

  const addMask = (type: ClipMask['type']) => {
    const newMask = createDefaultMask(type, element, masks.length);
    setMasks([...masks, newMask]);
    setExpandedMasks(new Set([...expandedMasks, newMask.id]));
    setShowAddMenu(false);
  };

  const updateMask = (maskId: string, updates: Partial<ClipMask>) => {
    setMasks(masks.map(m => m.id === maskId ? { ...m, ...updates } : m));
  };

  const removeMask = (maskId: string) => {
    setMasks(masks.filter(m => m.id !== maskId));
    const next = new Set(expandedMasks);
    next.delete(maskId);
    setExpandedMasks(next);
  };

  const duplicateMask = (maskId: string) => {
    const source = masks.find(m => m.id === maskId);
    if (!source) return;
    const dupe: ClipMask = { ...source, id: uuidv4(), name: `${source.name} Copy` };
    setMasks([...masks, dupe]);
    setExpandedMasks(new Set([...expandedMasks, dupe.id]));
  };

  const moveMask = (maskId: string, direction: 'up' | 'down') => {
    const idx = masks.findIndex(m => m.id === maskId);
    if (idx < 0) return;
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= masks.length) return;
    const next = [...masks];
    [next[idx], next[target]] = [next[target], next[idx]];
    setMasks(next);
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expandedMasks);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedMasks(next);
  };

  const fitToShape = (maskId: string) => {
    const mask = masks.find(m => m.id === maskId);
    if (!mask) return;

    if (mask.type === 'line') {
      updateMask(maskId, { lineOffset: 0 });
    } else {
      updateMask(maskId, {
        x: 0,
        y: 0,
        width: element.width,
        height: element.height,
      });
    }
  };

  const getMaskTypeIcon = (type: ClipMask['type']) => {
    switch (type) {
      case 'rectangle': return '▭';
      case 'circle': return '○';
      case 'star': return '☆';
      case 'line': return '⟋';
    }
  };

  return (
    <div className="h-full overflow-y-auto p-2 space-y-3 custom-scrollbar">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-gray-300 flex items-center">
          <span className="w-1 h-1 bg-teal-400 rounded-full mr-1.5"></span>
          {panelTitle || 'Clipping Masks'}
        </h4>
        <span className="text-xs text-gray-500">{masks.length} mask{masks.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="relative">
        <button
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400 hover:bg-teal-500/20 transition-all text-xs font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Mask
        </button>

        {showAddMenu && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600/50 rounded-lg shadow-xl z-50 overflow-hidden">
            {MASK_TYPES.map(({ type, label, icon }) => (
              <button
                key={type}
                onClick={() => addMask(type)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-700/50 text-gray-300 hover:text-white transition-colors text-xs"
              >
                <span className="text-sm w-5 text-center">{icon}</span>
                <span>{label} Mask</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {masks.length === 0 ? (
        <div className="text-center py-6">
          <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-gray-700/30 flex items-center justify-center">
            <span className="text-lg text-gray-500">◎</span>
          </div>
          <p className="text-xs text-gray-500">No masks applied</p>
          <p className="text-xs text-gray-600 mt-0.5">Add a mask to clip this element</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {masks.map((mask, index) => (
            <div key={mask.id} className="bg-gray-700/20 rounded-lg border border-gray-600/30 overflow-hidden">
              <div className="flex items-center gap-1 px-2 py-1.5">
                <button
                  onClick={() => toggleExpand(mask.id)}
                  className="p-0.5 text-gray-400 hover:text-white transition-colors"
                >
                  {expandedMasks.has(mask.id) ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                </button>

                <span className="text-sm mr-1">{getMaskTypeIcon(mask.type)}</span>

                <input
                  type="text"
                  value={mask.name}
                  onChange={(e) => updateMask(mask.id, { name: e.target.value })}
                  className="flex-1 bg-transparent text-xs text-white focus:outline-none focus:bg-gray-700/30 rounded px-1"
                />

                <button
                  onClick={() => updateMask(mask.id, { enabled: !mask.enabled })}
                  className={`p-0.5 transition-colors ${mask.enabled ? 'text-teal-400' : 'text-gray-600'}`}
                  title={mask.enabled ? 'Disable mask' : 'Enable mask'}
                >
                  {mask.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                </button>

                <button
                  onClick={() => duplicateMask(mask.id)}
                  className="p-0.5 text-gray-500 hover:text-gray-300 transition-colors"
                  title="Duplicate mask"
                >
                  <Copy className="w-3 h-3" />
                </button>

                <button
                  onClick={() => removeMask(mask.id)}
                  className="p-0.5 text-gray-500 hover:text-red-400 transition-colors"
                  title="Remove mask"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>

              {expandedMasks.has(mask.id) && (
                <div className="px-2.5 pb-2.5 space-y-2.5 border-t border-gray-600/20 pt-2">
                  {/* Fit to Shape */}
                  <button
                    onClick={() => fitToShape(mask.id)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-gray-700/40 border border-gray-600/40 text-gray-300 hover:bg-gray-700/70 hover:text-white hover:border-teal-500/40 transition-all text-xs font-medium"
                    title={mask.type === 'line' ? 'Center line through element' : 'Fit mask to element size and position'}
                  >
                    <Maximize2 className="w-3 h-3" />
                    Fit to Shape
                  </button>

                  {/* Mask Type Switcher */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Shape</label>
                    <div className="grid grid-cols-4 gap-1">
                      {MASK_TYPES.map(({ type, label, icon }) => (
                        <button
                          key={type}
                          onClick={() => {
                            const updates: Partial<ClipMask> = { type };
                            if (type === 'star') {
                              updates.starPoints = mask.starPoints || 5;
                              updates.starInnerRadius = mask.starInnerRadius || 50;
                            }
                            if (type === 'line') {
                              updates.lineAngle = mask.lineAngle ?? 0;
                              updates.lineOffset = mask.lineOffset ?? 0;
                              updates.lineSide = mask.lineSide ?? 'above';
                            }
                            updateMask(mask.id, updates);
                          }}
                          className={`py-1 rounded text-xs transition-colors flex flex-col items-center gap-0.5 ${
                            mask.type === type
                              ? 'bg-teal-500 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                          title={`${label} Mask`}
                        >
                          <span>{icon}</span>
                          <span className="text-[9px]">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Invert Toggle */}
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-gray-400">Invert Mask</span>
                    <button
                      onClick={() => updateMask(mask.id, { inverted: !mask.inverted })}
                      className={`w-9 h-5 rounded-full transition-colors relative ${
                        mask.inverted ? 'bg-teal-500' : 'bg-gray-600'
                      }`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow ${
                        mask.inverted ? 'translate-x-4' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>

                  {/* Link Toggle */}
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-gray-400">Link to Element</span>
                    <button
                      onClick={() => updateMask(mask.id, { linked: !mask.linked })}
                      className={`p-1 rounded transition-colors ${
                        mask.linked ? 'text-teal-400 bg-teal-400/10' : 'text-gray-500 bg-gray-700/30'
                      }`}
                      title={mask.linked ? 'Linked - mask moves with element' : 'Unlinked - mask stays in place'}
                    >
                      {mask.linked ? <Link className="w-3.5 h-3.5" /> : <Unlink className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Line Mask Controls */}
                  {mask.type === 'line' && (
                    <>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">
                          Angle <span className="text-gray-500">{Math.round(mask.lineAngle ?? 0)}°</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={360}
                            value={mask.lineAngle ?? 0}
                            onChange={(e) => updateMask(mask.id, { lineAngle: parseFloat(e.target.value) })}
                            className="flex-1 accent-teal-500"
                          />
                          <input
                            type="number"
                            min={0}
                            max={360}
                            value={Math.round(mask.lineAngle ?? 0)}
                            onChange={(e) => updateMask(mask.id, { lineAngle: parseFloat(e.target.value) || 0 })}
                            className="w-14 px-1.5 py-1 bg-gray-800 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-gray-400 mb-1">
                          Offset <span className="text-gray-500">{(mask.lineOffset ?? 0).toFixed(2)}</span>
                        </label>
                        <input
                          type="range"
                          min={-1}
                          max={1}
                          step={0.01}
                          value={mask.lineOffset ?? 0}
                          onChange={(e) => updateMask(mask.id, { lineOffset: parseFloat(e.target.value) })}
                          className="w-full accent-teal-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Visible Side</label>
                        <div className="grid grid-cols-2 gap-1">
                          {(['above', 'below'] as const).map((side) => (
                            <button
                              key={side}
                              onClick={() => updateMask(mask.id, { lineSide: side })}
                              className={`py-1 rounded text-xs transition-colors capitalize ${
                                (mask.lineSide ?? 'above') === side
                                  ? 'bg-teal-500 text-white'
                                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                              }`}
                            >
                              {side === 'above' ? 'Above / Left' : 'Below / Right'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Position — not shown for line masks */}
                  {mask.type !== 'line' && (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Position</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500 w-3">X</span>
                          <input
                            type="number"
                            value={Math.round(mask.x)}
                            onChange={(e) => updateMask(mask.id, { x: parseFloat(e.target.value) || 0 })}
                            className="flex-1 w-0 px-1.5 py-1 bg-gray-800 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500 w-3">Y</span>
                          <input
                            type="number"
                            value={Math.round(mask.y)}
                            onChange={(e) => updateMask(mask.id, { y: parseFloat(e.target.value) || 0 })}
                            className="flex-1 w-0 px-1.5 py-1 bg-gray-800 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Size — not shown for line masks */}
                  {mask.type !== 'line' && (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Size</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500 w-3">W</span>
                          <input
                            type="number"
                            value={Math.round(mask.width)}
                            min={1}
                            onChange={(e) => updateMask(mask.id, { width: Math.max(1, parseFloat(e.target.value) || 1) })}
                            className="flex-1 w-0 px-1.5 py-1 bg-gray-800 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500 w-3">H</span>
                          <input
                            type="number"
                            value={Math.round(mask.height)}
                            min={1}
                            onChange={(e) => updateMask(mask.id, { height: Math.max(1, parseFloat(e.target.value) || 1) })}
                            className="flex-1 w-0 px-1.5 py-1 bg-gray-800 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Rotation — not shown for line masks (angle replaces it) */}
                  {mask.type !== 'line' && (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Rotation <span className="text-gray-500">{Math.round(mask.rotation)}°</span>
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={360}
                        value={mask.rotation}
                        onChange={(e) => updateMask(mask.id, { rotation: parseFloat(e.target.value) })}
                        className="w-full accent-teal-500"
                      />
                    </div>
                  )}

                  {/* Border Radius (rectangle only) */}
                  {mask.type === 'rectangle' && (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Corner Radius <span className="text-gray-500">{mask.borderRadius}px</span>
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={Math.min(mask.width, mask.height) / 2}
                        value={mask.borderRadius}
                        onChange={(e) => updateMask(mask.id, { borderRadius: parseFloat(e.target.value) })}
                        className="w-full accent-teal-500"
                      />
                    </div>
                  )}

                  {/* Star Props */}
                  {mask.type === 'star' && (
                    <>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">
                          Points <span className="text-gray-500">{mask.starPoints || 5}</span>
                        </label>
                        <input
                          type="range"
                          min={3}
                          max={12}
                          value={mask.starPoints || 5}
                          onChange={(e) => updateMask(mask.id, { starPoints: parseInt(e.target.value) })}
                          className="w-full accent-teal-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">
                          Inner Radius <span className="text-gray-500">{mask.starInnerRadius || 50}%</span>
                        </label>
                        <input
                          type="range"
                          min={10}
                          max={90}
                          value={mask.starInnerRadius || 50}
                          onChange={(e) => updateMask(mask.id, { starInnerRadius: parseInt(e.target.value) })}
                          className="w-full accent-teal-500"
                        />
                      </div>
                    </>
                  )}

                  {/* Feather */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Feather <span className="text-gray-500">{mask.feather}px</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={mask.feather}
                      onChange={(e) => updateMask(mask.id, { feather: parseFloat(e.target.value) })}
                      className="w-full accent-teal-500"
                    />
                  </div>

                  {/* Expand — not for line masks */}
                  {mask.type !== 'line' && (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Expand <span className="text-gray-500">{mask.expand}px</span>
                      </label>
                      <input
                        type="range"
                        min={-50}
                        max={50}
                        value={mask.expand}
                        onChange={(e) => updateMask(mask.id, { expand: parseFloat(e.target.value) })}
                        className="w-full accent-teal-500"
                      />
                    </div>
                  )}

                  {/* Opacity */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Mask Opacity <span className="text-gray-500">{mask.opacity}%</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={mask.opacity}
                      onChange={(e) => updateMask(mask.id, { opacity: parseFloat(e.target.value) })}
                      className="w-full accent-teal-500"
                    />
                  </div>

                  {/* Reorder */}
                  {masks.length > 1 && (
                    <div className="flex gap-1 pt-1">
                      <button
                        disabled={index === 0}
                        onClick={() => moveMask(mask.id, 'up')}
                        className="flex-1 py-1 rounded text-xs bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        Move Up
                      </button>
                      <button
                        disabled={index === masks.length - 1}
                        onClick={() => moveMask(mask.id, 'down')}
                        className="flex-1 py-1 rounded text-xs bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        Move Down
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MaskPropertiesPanel;
