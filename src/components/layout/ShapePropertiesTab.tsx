import React, { useState } from 'react';
import { Copy, Clipboard, Plus, Trash2, Sparkles, Settings, Layers } from 'lucide-react';
import { DesignElement } from '../../types/design';
import { useClipboard } from '../../hooks/useClipboard';
import ShapeMaterialPanel from './ShapeMaterialPanel';
import MaskPropertiesPanel from './MaskPropertiesPanel';
import ImageFilterSlider from '../image/ImageFilterSlider';
import { useAnimation, globalToLocalTime } from '../../animation-engine';
import KeyframeButton from '../animation/KeyframeButton';
import { AnimatableProperty } from '../../animation-engine/types';

interface ShapePropertiesTabProps {
  selectedElements: DesignElement[];
  updateElement: (id: string, updates: Partial<DesignElement>) => void;
  canvasSize?: { width: number; height: number };
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
}

const ShapePropertiesTab: React.FC<ShapePropertiesTabProps> = ({
  selectedElements,
  updateElement,
  canvasSize = { width: 3840, height: 2160 },
  onInteractionStart,
  onInteractionEnd,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'properties' | 'effects' | 'mask'>('properties');
  const { copyStyle, pasteStyle, copyValue, pasteValue, copiedStyle } = useClipboard();

  const animation = useAnimation();
  const currentTime = animation.state.timeline.currentTime;

  const filteredElements = selectedElements.filter(el => el.type !== 'hbox' && el.type !== 'vbox');
  if (filteredElements.length === 0) return null;

  const selectedElement = filteredElements[0];
  // clipStart must be computed after selectedElement is defined — accessing it before
  // its declaration (line 36) causes a TDZ ReferenceError that crashes all tabs.
  const clipStart = animation.state.animations[selectedElement.id]?.clipStart ?? 0;
  const localCurrentTime = globalToLocalTime(currentTime, clipStart);
  const isMultiSelect = filteredElements.length > 1;

  // Compute the animated (visual) state of the selected element at the current timeline time.
  // Keyframes must capture what is *visually displayed*, not the stale base-store value.
  const animatedOverrides = animation.getAnimatedElementState(selectedElement);
  const visualElement = { ...selectedElement, ...animatedOverrides };

  // Ensure shadow property exists with default values
  const safeSelectedElement = {
    ...visualElement,
    shadow: visualElement.shadow || { blur: 0, x: 0, y: 0, color: '#000000' }
  };

  const handleUpdate = (updates: Partial<DesignElement>) => {
    if (isMultiSelect) {
      filteredElements.forEach(element => {
        updateElement(element.id, updates);
      });
    } else {
      updateElement(selectedElement.id, updates);
    }
  };

  const handleColorMouseDown = () => {
    onInteractionStart?.();
  };

  const handleColorBlur = () => {
    onInteractionEnd?.();
  };

  const handleShadowColorMouseDown = () => {
    onInteractionStart?.();
  };

  const handleShadowColorBlur = () => {
    onInteractionEnd?.();
  };

  const handleCopyStyle = () => {
    copyStyle(selectedElement);
  };

  const handlePasteStyle = () => {
    const updates = pasteStyle(selectedElement);
    if (updates) {
      handleUpdate(updates);
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

  const hasKeyframeAtCurrentTime = (property: AnimatableProperty): boolean => {
    if (!selectedElement) return false;
    const track = animation.getTrack(selectedElement.id, property);
    if (!track) return false;
    const threshold = 0.01;
    return track.keyframes.some(kf => Math.abs(kf.time - localCurrentTime) < threshold);
  };

  const handleAddKeyframe = (property: AnimatableProperty, value: number | string) => {
    if (!selectedElement) return;
    animation.initAnimation(selectedElement.id);
    animation.addKeyframe(selectedElement.id, property, localCurrentTime, value);
  };

  const handleKeyframeAll = () => {
    if (!selectedElement) return;
    animation.initAnimation(selectedElement.id);

    const properties: Array<{ prop: AnimatableProperty; value: number | string }> = [
      { prop: 'x', value: visualElement.x },
      { prop: 'y', value: visualElement.y },
      { prop: 'width', value: visualElement.width },
      { prop: 'height', value: visualElement.height },
      { prop: 'rotation', value: visualElement.rotation || 0 },
      { prop: 'opacity', value: visualElement.opacity ?? 1 },
      { prop: 'fill', value: visualElement.fill },
      { prop: 'borderRadius', value: visualElement.borderRadius || 0 },
    ];

    if (selectedElement.type !== 'text') {
      properties.push(
        { prop: 'stroke', value: visualElement.stroke || '#000000' },
        { prop: 'strokeWidth', value: visualElement.strokeWidth || 0 }
      );
    }

    properties.forEach(({ prop, value }) => {
      animation.addKeyframe(selectedElement.id, prop, localCurrentTime, value);
    });
  };

  const handleGradientToggle = () => {
    const isEnabled = !safeSelectedElement.gradientEnabled;
    const updates: Partial<DesignElement> = {
      gradientEnabled: isEnabled
    };
    
    if (isEnabled && !safeSelectedElement.gradientColors) {
      // Initialize default gradient
      updates.gradientColors = [
        { color: safeSelectedElement.fill, position: 0, id: 'gradient-1' },
        { color: '#FFFFFF', position: 100, id: 'gradient-2' }
      ];
      updates.gradientType = 'linear';
      updates.gradientAngle = 45;
    }
    
    handleUpdate(updates);
  };

  const handleGradientColorChange = (colorId: string, newColor: string) => {
    const gradientColors = safeSelectedElement.gradientColors || [];
    const updatedColors = gradientColors.map(gc => 
      gc.id === colorId ? { ...gc, color: newColor } : gc
    );
    handleUpdate({ gradientColors: updatedColors });
  };

  const handleGradientPositionChange = (colorId: string, newPosition: number) => {
    const gradientColors = safeSelectedElement.gradientColors || [];
    const updatedColors = gradientColors.map(gc => 
      gc.id === colorId ? { ...gc, position: newPosition } : gc
    ).sort((a, b) => a.position - b.position);
    handleUpdate({ gradientColors: updatedColors });
  };

  const addGradientColor = () => {
    const gradientColors = safeSelectedElement.gradientColors || [];
    if (gradientColors.length >= 5) return;
    
    const newPosition = gradientColors.length > 0 
      ? Math.max(...gradientColors.map(gc => gc.position)) + 20
      : 50;
    
    const newColor = {
      color: '#3B82F6',
      position: Math.min(100, newPosition),
      id: `gradient-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    
    const updatedColors = [...gradientColors, newColor].sort((a, b) => a.position - b.position);
    handleUpdate({ gradientColors: updatedColors });
  };

  const removeGradientColor = (colorId: string) => {
    const gradientColors = safeSelectedElement.gradientColors || [];
    if (gradientColors.length <= 2) return; // Keep at least 2 colors
    
    const updatedColors = gradientColors.filter(gc => gc.id !== colorId);
    handleUpdate({ gradientColors: updatedColors });
  };
  // Round values for display
  const roundedElement = {
    ...safeSelectedElement,
    x: Math.round(safeSelectedElement.x),
    y: Math.round(safeSelectedElement.y),
    width: Math.round(safeSelectedElement.width),
    height: Math.round(safeSelectedElement.height),
    rotation: Math.round(safeSelectedElement.rotation),
    strokeWidth: Math.round(safeSelectedElement.strokeWidth),
    borderRadius: Math.round(safeSelectedElement.borderRadius),
    shadow: {
      ...safeSelectedElement.shadow,
      blur: Math.round(safeSelectedElement.shadow.blur),
      x: Math.round(safeSelectedElement.shadow.x),
      y: Math.round(safeSelectedElement.shadow.y)
    }
  };

  const maskCount = filteredElements[0]?.masks?.length || 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sub-tab Switcher */}
      <div className="px-2 pt-2 pb-1">
        <div className="grid grid-cols-3 gap-0.5 bg-gray-700/30 rounded p-0.5 text-xs">
          <button
            onClick={() => setActiveSubTab('properties')}
            className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded font-medium transition-all duration-200 ${
              activeSubTab === 'properties'
                ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/50'
                : 'text-gray-400 hover:text-white hover:bg-gray-600/30'
            }`}
          >
            <Settings className="w-3 h-3" />
            <span>Properties</span>
          </button>
          <button
            onClick={() => setActiveSubTab('effects')}
            className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded font-medium transition-all duration-200 ${
              activeSubTab === 'effects'
                ? 'bg-orange-400/20 text-orange-400 border border-orange-400/50'
                : 'text-gray-400 hover:text-white hover:bg-gray-600/30'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>Effects</span>
          </button>
          <button
            onClick={() => setActiveSubTab('mask')}
            className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded font-medium transition-all duration-200 ${
              activeSubTab === 'mask'
                ? 'bg-teal-400/20 text-teal-400 border border-teal-400/50'
                : 'text-gray-400 hover:text-white hover:bg-gray-600/30'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>Mask</span>
            {maskCount > 0 && (
              <span className="ml-0.5 px-1 py-0 rounded-full bg-teal-500/20 text-teal-400 text-[10px] leading-tight">{maskCount}</span>
            )}
          </button>
        </div>
      </div>

      {activeSubTab === 'mask' ? (
        <MaskPropertiesPanel
          selectedElements={filteredElements}
          updateElement={updateElement}
        />
      ) : activeSubTab === 'effects' ? (
    <div className="flex-1 overflow-y-auto p-2 space-y-3 custom-scrollbar">
      {selectedElement.type !== 'adjustment-layer' && (
        <>
          {/* Outer Shadow */}
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-gray-300 flex items-center">
              <span className="w-1 h-1 bg-orange-400 rounded-full mr-1.5"></span>
              Shadow
            </h4>
            <ImageFilterSlider
              label="Blur"
              value={safeSelectedElement.shadow.blur}
              min={0}
              max={500}
              textInputMax={9999}
              defaultValue={0}
              onChange={(v) => {
                const currentColor = safeSelectedElement.shadow.color;
                const resolvedColor = (currentColor === 'transparent' || currentColor === '') ? '#000000' : currentColor;
                handleUpdate({ shadow: { ...safeSelectedElement.shadow, blur: v, color: v > 0 ? resolvedColor : currentColor } });
              }}
            />
            <ImageFilterSlider
              label="Offset X"
              value={safeSelectedElement.shadow.x}
              min={-500}
              max={500}
              defaultValue={0}
              onChange={(v) => handleUpdate({ shadow: { ...safeSelectedElement.shadow, x: v } })}
            />
            <ImageFilterSlider
              label="Offset Y"
              value={safeSelectedElement.shadow.y}
              min={-500}
              max={500}
              defaultValue={0}
              onChange={(v) => handleUpdate({ shadow: { ...safeSelectedElement.shadow, y: v } })}
            />
            <div>
              <label className="text-xs text-gray-400 block mb-1">Color</label>
              <div className="flex items-center space-x-1.5">
                <input
                  type="color"
                  value={safeSelectedElement.shadow.color === 'transparent' || safeSelectedElement.shadow.color === '' ? '#000000' : safeSelectedElement.shadow.color}
                  onMouseDown={handleShadowColorMouseDown}
                  onChange={(e) => handleUpdate({ shadow: { ...safeSelectedElement.shadow, color: e.target.value } })}
                  onBlur={handleShadowColorBlur}
                  className="w-6 h-6 rounded cursor-pointer border border-gray-600/50"
                />
                <input
                  type="text"
                  value={safeSelectedElement.shadow.color}
                  onFocus={handleShadowColorMouseDown}
                  onChange={(e) => handleUpdate({ shadow: { ...safeSelectedElement.shadow, color: e.target.value } })}
                  onBlur={handleShadowColorBlur}
                  className="flex-1 px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-700/50 my-1" />

          {/* Inner Shadow */}
          {(() => {
            const is = safeSelectedElement.innerShadow || {
              enabled: false, blur: 0, color: '#000000', x: 0, y: 0,
              borders: { top: true, right: true, bottom: true, left: true }
            };
            const updateIS = (patch: Partial<typeof is>) =>
              handleUpdate({ innerShadow: { ...is, ...patch } });
            const updateBorders = (patch: Partial<typeof is.borders>) =>
              updateIS({ borders: { ...is.borders, ...patch } });
            const isEnabled = is.enabled;
            const isColor = is.color === 'transparent' || is.color === '' ? '#000000' : is.color;

            return (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium text-gray-300 flex items-center">
                    <span className="w-1 h-1 bg-cyan-400 rounded-full mr-1.5"></span>
                    Inner Shadow
                  </h4>
                  <button
                    onClick={() => updateIS({ enabled: !isEnabled })}
                    className={`relative w-8 h-4 rounded-full transition-colors ${isEnabled ? 'bg-cyan-500' : 'bg-gray-600'}`}
                  >
                    <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${isEnabled ? 'left-4.5' : 'left-0.5'}`} />
                  </button>
                </div>

                <div className={`space-y-3 ${isEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
                  {/* Per-border toggles */}
                  <div>
                    <label className="text-xs text-gray-400 block mb-1.5">Borders</label>
                    <div className="flex flex-col items-center gap-0.5">
                      {/* Top */}
                      <button
                        onClick={() => updateBorders({ top: !is.borders.top })}
                        className={`w-10 h-4 rounded text-[10px] font-medium transition-colors ${is.borders.top ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/60' : 'bg-gray-700/50 text-gray-500 border border-gray-600/30'}`}
                      >T</button>
                      <div className="flex gap-0.5 items-center">
                        {/* Left */}
                        <button
                          onClick={() => updateBorders({ left: !is.borders.left })}
                          className={`w-4 h-10 rounded text-[10px] font-medium transition-colors ${is.borders.left ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/60' : 'bg-gray-700/50 text-gray-500 border border-gray-600/30'}`}
                        >L</button>
                        {/* Center indicator */}
                        <div className="w-10 h-10 rounded border-2 border-gray-600/40 bg-gray-800/30" />
                        {/* Right */}
                        <button
                          onClick={() => updateBorders({ right: !is.borders.right })}
                          className={`w-4 h-10 rounded text-[10px] font-medium transition-colors ${is.borders.right ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/60' : 'bg-gray-700/50 text-gray-500 border border-gray-600/30'}`}
                        >R</button>
                      </div>
                      {/* Bottom */}
                      <button
                        onClick={() => updateBorders({ bottom: !is.borders.bottom })}
                        className={`w-10 h-4 rounded text-[10px] font-medium transition-colors ${is.borders.bottom ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/60' : 'bg-gray-700/50 text-gray-500 border border-gray-600/30'}`}
                      >B</button>
                    </div>
                  </div>

                  <ImageFilterSlider
                    label="Blur"
                    value={is.blur}
                    min={0}
                    max={500}
                    textInputMax={9999}
                    defaultValue={0}
                    onChange={(v) => {
                      const currentColor = is.color;
                      const resolvedColor = (currentColor === 'transparent' || currentColor === '') ? '#000000' : currentColor;
                      updateIS({ blur: v, color: v > 0 ? resolvedColor : currentColor });
                    }}
                  />
                  <ImageFilterSlider
                    label="Offset X"
                    value={is.x}
                    min={-500}
                    max={500}
                    defaultValue={0}
                    onChange={(v) => updateIS({ x: v })}
                  />
                  <ImageFilterSlider
                    label="Offset Y"
                    value={is.y}
                    min={-500}
                    max={500}
                    defaultValue={0}
                    onChange={(v) => updateIS({ y: v })}
                  />
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Color</label>
                    <div className="flex items-center space-x-1.5">
                      <input
                        type="color"
                        value={isColor}
                        onMouseDown={handleShadowColorMouseDown}
                        onChange={(e) => updateIS({ color: e.target.value })}
                        onBlur={handleShadowColorBlur}
                        className="w-6 h-6 rounded cursor-pointer border border-gray-600/50"
                      />
                      <input
                        type="text"
                        value={is.color}
                        onFocus={handleShadowColorMouseDown}
                        onChange={(e) => updateIS({ color: e.target.value })}
                        onBlur={handleShadowColorBlur}
                        className="flex-1 px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="border-t border-gray-700/50 my-1" />

          {/* Shadow Mask */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-medium text-gray-300 flex items-center">
                <span className="w-1 h-1 bg-rose-400 rounded-full mr-1.5"></span>
                Shadow Mask
              </h4>
              <button
                onClick={() => handleUpdate({ shadowMaskEnabled: !safeSelectedElement.shadowMaskEnabled })}
                className={`relative w-8 h-4 rounded-full transition-colors ${safeSelectedElement.shadowMaskEnabled ? 'bg-rose-500' : 'bg-gray-600'}`}
              >
                <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${safeSelectedElement.shadowMaskEnabled ? 'left-4.5' : 'left-0.5'}`} />
              </button>
            </div>

            <div className={`space-y-3 ${safeSelectedElement.shadowMaskEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
              <div>
                <label className="text-xs text-gray-400 block mb-1.5">Apply To</label>
                <div className="grid grid-cols-3 gap-1">
                  {(['outer', 'inner', 'both'] as const).map(target => (
                    <button
                      key={target}
                      onClick={() => handleUpdate({ shadowMaskTarget: target })}
                      className={`py-1 rounded text-xs transition-colors ${
                        (safeSelectedElement.shadowMaskTarget || 'both') === target
                          ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/50'
                          : 'bg-gray-700/50 text-gray-400 hover:bg-gray-600/50'
                      }`}
                    >
                      {target === 'outer' ? 'Outer' : target === 'inner' ? 'Inner' : 'Both'}
                    </button>
                  ))}
                </div>
              </div>

              <MaskPropertiesPanel
                selectedElements={filteredElements}
                updateElement={updateElement}
                maskProp="shadowMasks"
                panelTitle="Shadow Mask Shapes"
              />
            </div>
          </div>
        </>
      )}
    </div>
      ) : (
    <div className="flex-1 overflow-y-auto p-2 space-y-3 custom-scrollbar">
      {/* Style Copy/Paste */}
      <div className="space-y-1.5">
        <h4 className="text-xs font-medium text-gray-300 flex items-center">
          <span className="w-1 h-1 bg-cyan-400 rounded-full mr-1.5"></span>
          Style
        </h4>

        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={handleCopyStyle}
            className="flex items-center justify-center space-x-1 px-2 py-1 bg-gray-700/50 hover:bg-gray-600/50 border border-gray-600/50 rounded text-xs text-gray-300 hover:text-yellow-400 transition-all duration-200"
            title="Copy all style properties"
          >
            <Copy className="w-3 h-3" />
            <span>Copy Style</span>
          </button>

          <button
            onClick={handlePasteStyle}
            disabled={!copiedStyle}
            className={`flex items-center justify-center space-x-1 px-2 py-1 border rounded text-xs transition-all duration-200 ${
              copiedStyle
                ? 'bg-gray-700/50 hover:bg-gray-600/50 border-gray-600/50 text-gray-300 hover:text-yellow-400'
                : 'bg-gray-800/50 border-gray-700/50 text-gray-600 cursor-not-allowed'
            }`}
            title="Paste copied style properties"
          >
            <Clipboard className="w-3 h-3" />
            <span>Paste Style</span>
          </button>

          <button
            onClick={handleKeyframeAll}
            className="flex items-center justify-center space-x-1 px-2 py-1 bg-gray-700/50 hover:bg-gray-600/50 border border-gray-600/50 rounded text-xs text-gray-300 hover:text-cyan-400 transition-all duration-200"
            title="Add keyframes to all properties"
          >
            <Sparkles className="w-3 h-3" />
            <span>Keyframe All</span>
          </button>
        </div>
      </div>

      {/* Position & Size */}
      <div className="space-y-1.5">
        <h4 className="text-xs font-medium text-gray-300 flex items-center">
          <span className="w-1 h-1 bg-yellow-400 rounded-full mr-1.5"></span>
          Position & Size
        </h4>
        
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-xs text-gray-400">X</label>
              <div className="flex items-center space-x-0.5">
                <KeyframeButton
                  onClick={() => handleAddKeyframe('x', roundedElement.x)}
                  isActive={hasKeyframeAtCurrentTime('x')}
                  title="Add keyframe for X position"
                />
                <button
                  onClick={() => handleCopyValue(roundedElement.x)}
                  className="p-0.5 hover:bg-gray-600/50 rounded transition-colors"
                  title="Copy X position"
                >
                  <Copy className="w-2.5 h-2.5 text-gray-500 hover:text-gray-300" />
                </button>
                <button
                  onClick={() => handlePasteValue('x')}
                  className="p-0.5 hover:bg-gray-600/50 rounded transition-colors"
                  title="Paste X position"
                >
                  <Clipboard className="w-2.5 h-2.5 text-gray-500 hover:text-gray-300" />
                </button>
              </div>
            </div>
            <input
              type="number"
              value={roundedElement.x}
              onChange={(e) => handleUpdate({ x: Math.round(Number(e.target.value)) })}
              className="w-full px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
            />
            <input
              type="range"
              min={-2000}
              max={6000}
              value={roundedElement.x}
              onChange={(e) => handleUpdate({ x: Number(e.target.value) })}
              className="w-full h-1 mt-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-400"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-xs text-gray-400">Y</label>
              <div className="flex items-center space-x-0.5">
                <KeyframeButton
                  onClick={() => handleAddKeyframe('y', roundedElement.y)}
                  isActive={hasKeyframeAtCurrentTime('y')}
                  title="Add keyframe for Y position"
                />
                <button
                  onClick={() => handleCopyValue(roundedElement.y)}
                  className="p-0.5 hover:bg-gray-600/50 rounded transition-colors"
                  title="Copy Y position"
                >
                  <Copy className="w-2.5 h-2.5 text-gray-500 hover:text-gray-300" />
                </button>
                <button
                  onClick={() => handlePasteValue('y')}
                  className="p-0.5 hover:bg-gray-600/50 rounded transition-colors"
                  title="Paste Y position"
                >
                  <Clipboard className="w-2.5 h-2.5 text-gray-500 hover:text-gray-300" />
                </button>
              </div>
            </div>
            <input
              type="number"
              value={roundedElement.y}
              onChange={(e) => handleUpdate({ y: Math.round(Number(e.target.value)) })}
              className="w-full px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
            />
            <input
              type="range"
              min={-2000}
              max={4000}
              value={roundedElement.y}
              onChange={(e) => handleUpdate({ y: Number(e.target.value) })}
              className="w-full h-1 mt-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-400"
            />
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-xs text-gray-400">Width</label>
              <div className="flex items-center space-x-0.5">
                <KeyframeButton
                  onClick={() => handleAddKeyframe('width', roundedElement.width)}
                  isActive={hasKeyframeAtCurrentTime('width')}
                  title="Add keyframe for width"
                />
                <button
                  onClick={() => handleCopyValue(roundedElement.width)}
                  className="p-0.5 hover:bg-gray-600/50 rounded transition-colors"
                  title="Copy width"
                >
                  <Copy className="w-2.5 h-2.5 text-gray-500 hover:text-gray-300" />
                </button>
                <button
                  onClick={() => handlePasteValue('width')}
                  className="p-0.5 hover:bg-gray-600/50 rounded transition-colors"
                  title="Paste width"
                >
                  <Clipboard className="w-2.5 h-2.5 text-gray-500 hover:text-gray-300" />
                </button>
              </div>
            </div>
            <input
              type="number"
              value={roundedElement.width}
              onChange={(e) => handleUpdate({ width: Math.round(Number(e.target.value)) })}
              className="w-full px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
            />
            <input
              type="range"
              min={1}
              max={4000}
              value={roundedElement.width}
              onChange={(e) => handleUpdate({ width: Number(e.target.value) })}
              className="w-full h-1 mt-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-400"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-xs text-gray-400">Height</label>
              <div className="flex items-center space-x-0.5">
                <KeyframeButton
                  onClick={() => handleAddKeyframe('height', roundedElement.height)}
                  isActive={hasKeyframeAtCurrentTime('height')}
                  title="Add keyframe for height"
                />
                <button
                  onClick={() => handleCopyValue(roundedElement.height)}
                  className="p-0.5 hover:bg-gray-600/50 rounded transition-colors"
                  title="Copy height"
                >
                  <Copy className="w-2.5 h-2.5 text-gray-500 hover:text-gray-300" />
                </button>
                <button
                  onClick={() => handlePasteValue('height')}
                  className="p-0.5 hover:bg-gray-600/50 rounded transition-colors"
                  title="Paste height"
                >
                  <Clipboard className="w-2.5 h-2.5 text-gray-500 hover:text-gray-300" />
                </button>
              </div>
            </div>
            <input
              type="number"
              value={roundedElement.height}
              onChange={(e) => handleUpdate({ height: Math.round(Number(e.target.value)) })}
              className="w-full px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
            />
            <input
              type="range"
              min={1}
              max={3000}
              value={roundedElement.height}
              onChange={(e) => handleUpdate({ height: Number(e.target.value) })}
              className="w-full h-1 mt-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-400"
            />
          </div>
        </div>
      </div>

      {/* Rotation */}
      <div className="space-y-1.5">
        <h4 className="text-xs font-medium text-gray-300 flex items-center">
          <span className="w-1 h-1 bg-blue-400 rounded-full mr-1.5"></span>
          Rotation
        </h4>

        <div>
          <div className="flex items-center justify-between mb-0.5">
            <label className="text-xs text-gray-400">Angle (degrees)</label>
            <div className="flex items-center space-x-0.5">
              <KeyframeButton
                onClick={() => handleAddKeyframe('rotation', roundedElement.rotation || 0)}
                isActive={hasKeyframeAtCurrentTime('rotation')}
                title="Add keyframe for rotation"
              />
              <button
                onClick={() => handleCopyValue(roundedElement.rotation)}
                className="p-0.5 hover:bg-gray-600/50 rounded transition-colors"
                title="Copy rotation"
              >
                <Copy className="w-2.5 h-2.5 text-gray-500 hover:text-gray-300" />
              </button>
              <button
                onClick={() => handlePasteValue('rotation')}
                className="p-0.5 hover:bg-gray-600/50 rounded transition-colors"
                title="Paste rotation"
              >
                <Clipboard className="w-2.5 h-2.5 text-gray-500 hover:text-gray-300" />
              </button>
            </div>
          </div>
          <div className="flex items-center space-x-1.5">
            <input
              type="number"
              min="0"
              max="360"
              value={roundedElement.rotation}
              onChange={(e) => {
                let value = Number(e.target.value);
                value = ((value % 360) + 360) % 360;
                handleUpdate({ rotation: Math.round(value) });
              }}
              className="flex-1 px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-blue-400/50"
            />
            <button
              onClick={() => handleUpdate({ rotation: 0 })}
              className="px-2 py-0.5 bg-gray-700/50 hover:bg-gray-600/50 border border-gray-600/50 rounded text-xs text-gray-300 hover:text-blue-400 transition-all"
              title="Reset rotation"
            >
              Reset
            </button>
          </div>
          <input
            type="range"
            min="0"
            max="360"
            value={roundedElement.rotation}
            onChange={(e) => handleUpdate({ rotation: Number(e.target.value) })}
            className="w-full h-1 mt-1.5 bg-gray-700/50 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>
      </div>

      {/* Material Panel - Hide for SVG, Adjustment Layer, and Gradient (gradient uses its own color system) */}
      {selectedElement.type !== 'svg' && selectedElement.type !== 'adjustment-layer' && selectedElement.type !== 'gradient' && (
        <div className="space-y-2">
          <ShapeMaterialPanel
            selectedElements={filteredElements}
            updateElement={updateElement}
            onInteractionStart={onInteractionStart}
            onInteractionEnd={onInteractionEnd}
          />

          {/* Stroke & Border */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-medium text-gray-300 flex items-center">
              <span className="w-1 h-1 bg-green-400 rounded-full mr-1.5"></span>
              Stroke & Border
            </h4>

            <div>
              <label className="text-xs text-gray-400 block mb-0.5">Stroke Width</label>
              <input
                type="number"
                min="0"
                value={roundedElement.strokeWidth}
                onChange={(e) => handleUpdate({ strokeWidth: Math.round(Number(e.target.value)) })}
                className="w-full px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-0.5">Border Radius</label>
              <input
                type="number"
                min="0"
                value={roundedElement.borderRadius}
                onChange={(e) => handleUpdate({ borderRadius: Math.round(Number(e.target.value)) })}
                className="w-full px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-0.5">
                <label className="text-xs text-gray-400">Opacity</label>
                <KeyframeButton
                  onClick={() => handleAddKeyframe('opacity', safeSelectedElement.opacity)}
                  isActive={hasKeyframeAtCurrentTime('opacity')}
                  title="Add keyframe for opacity"
                />
              </div>
              <div className="space-y-0.5">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={safeSelectedElement.opacity}
                  onChange={(e) => handleUpdate({ opacity: Number(e.target.value) })}
                  className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="text-xs text-gray-400 text-center">
                  {Math.round(safeSelectedElement.opacity * 100)}%
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Star-specific properties */}
      {selectedElement.type === 'star' && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-medium text-gray-300 flex items-center">
            <span className="w-1 h-1 bg-yellow-400 rounded-full mr-1.5"></span>
            Star Properties
          </h4>

          <div>
            <label className="text-xs text-gray-400 block mb-0.5">Number of Points</label>
            <input
              type="number"
              min="3"
              max="20"
              value={safeSelectedElement.starPoints || 5}
              onChange={(e) => handleUpdate({ starPoints: Math.round(Number(e.target.value)) })}
              className="w-full px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-0.5">Inner Radius (%)</label>
            <div className="space-y-0.5">
              <input
                type="range"
                min="0"
                max="100"
                value={safeSelectedElement.starInnerRadius || 50}
                onChange={(e) => handleUpdate({ starInnerRadius: Number(e.target.value) })}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="text-xs text-gray-400 text-center">
                {safeSelectedElement.starInnerRadius || 50}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gradient-specific properties */}
      {selectedElement.type === 'gradient' && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-medium text-gray-300 flex items-center">
            <span className="w-1 h-1 bg-pink-400 rounded-full mr-1.5"></span>
            Gradient Properties
          </h4>

          <div>
            <label className="text-xs text-gray-400 block mb-0.5">Gradient Type</label>
            <select
              value={safeSelectedElement.gradientType || 'linear'}
              onChange={(e) => handleUpdate({ gradientType: e.target.value as 'linear' | 'radial' | 'conic' })}
              className="w-full px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
            >
              <option value="linear">Linear</option>
              <option value="radial">Radial</option>
              <option value="conic">Conic</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-0.5">Angle (degrees)</label>
            <input
              type="number"
              min="0"
              max="360"
              value={safeSelectedElement.gradientAngle || 45}
              onChange={(e) => handleUpdate({ gradientAngle: Number(e.target.value) })}
              className="w-full px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-0.5">Gradient Colors</label>
            {(safeSelectedElement.gradientColors || []).map((gradientColor) => (
              <div key={gradientColor.id} className="flex items-center space-x-1.5 mb-1.5">
                <KeyframeButton
                  onClick={() => handleAddKeyframe(`gradientColor-${gradientColor.id}` as AnimatableProperty, gradientColor.color)}
                  isActive={hasKeyframeAtCurrentTime(`gradientColor-${gradientColor.id}` as AnimatableProperty)}
                  title="Add keyframe for gradient color"
                />
                <input
                  type="color"
                  value={gradientColor.color}
                  onMouseDown={handleColorMouseDown}
                  onChange={(e) => handleGradientColorChange(gradientColor.id, e.target.value)}
                  onBlur={handleColorBlur}
                  className="w-6 h-6 rounded cursor-pointer border border-gray-600/50"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={gradientColor.position}
                  onChange={(e) => handleGradientPositionChange(gradientColor.id, Number(e.target.value))}
                  className="flex-1 px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
                />
                <span className="text-xs text-gray-400">%</span>
                {(safeSelectedElement.gradientColors || []).length > 2 && (
                  <button
                    onClick={() => removeGradientColor(gradientColor.id)}
                    className="p-1 hover:bg-red-500/20 rounded transition-colors"
                    title="Remove color stop"
                  >
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </button>
                )}
              </div>
            ))}
            {(safeSelectedElement.gradientColors || []).length < 5 && (
              <button
                onClick={addGradientColor}
                className="w-full flex items-center justify-center space-x-1 px-2 py-1 bg-gray-700/50 hover:bg-gray-600/50 border border-gray-600/50 rounded text-xs text-gray-300 hover:text-yellow-400 transition-all duration-200"
              >
                <Plus className="w-3 h-3" />
                <span>Add Color Stop</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Adjustment Layer-specific properties */}
      {selectedElement.type === 'adjustment-layer' && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-medium text-gray-300 flex items-center">
            <span className="w-1 h-1 bg-indigo-400 rounded-full mr-1.5"></span>
            Adjustment Properties
          </h4>

          <div>
            <label className="text-xs text-gray-400 block mb-0.5">Adjustment Type</label>
            <select
              value={safeSelectedElement.adjustmentType || 'brightness-contrast'}
              onChange={(e) => handleUpdate({ adjustmentType: e.target.value as any })}
              className="w-full px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
            >
              <option value="brightness-contrast">Brightness/Contrast</option>
              <option value="hue-saturation">Hue/Saturation</option>
              <option value="color">Color</option>
              <option value="levels">Levels</option>
            </select>
          </div>

          {/* Brightness/Contrast Adjustments */}
          {(!safeSelectedElement.adjustmentType || safeSelectedElement.adjustmentType === 'brightness-contrast') && (
            <>
              <div>
                <label className="text-xs text-gray-400 block mb-0.5">Brightness</label>
                <div className="space-y-0.5">
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={(safeSelectedElement.filters?.brightness || 0)}
                    onChange={(e) => {
                      const filters = safeSelectedElement.filters || {};
                      handleUpdate({ filters: { ...filters, brightness: Number(e.target.value) } });
                    }}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="text-xs text-gray-400 text-center">
                    {(safeSelectedElement.filters?.brightness || 0)}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-0.5">Contrast</label>
                <div className="space-y-0.5">
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={(safeSelectedElement.filters?.contrast || 0)}
                    onChange={(e) => {
                      const filters = safeSelectedElement.filters || {};
                      handleUpdate({ filters: { ...filters, contrast: Number(e.target.value) } });
                    }}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="text-xs text-gray-400 text-center">
                    {(safeSelectedElement.filters?.contrast || 0)}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Hue/Saturation Adjustments */}
          {safeSelectedElement.adjustmentType === 'hue-saturation' && (
            <>
              <div>
                <label className="text-xs text-gray-400 block mb-0.5">Hue</label>
                <div className="space-y-0.5">
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    value={(safeSelectedElement.filters?.hue || 0)}
                    onChange={(e) => {
                      const filters = safeSelectedElement.filters || {};
                      handleUpdate({ filters: { ...filters, hue: Number(e.target.value) } });
                    }}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="text-xs text-gray-400 text-center">
                    {(safeSelectedElement.filters?.hue || 0)}°
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-0.5">Saturation</label>
                <div className="space-y-0.5">
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={(safeSelectedElement.filters?.saturation || 0)}
                    onChange={(e) => {
                      const filters = safeSelectedElement.filters || {};
                      handleUpdate({ filters: { ...filters, saturation: Number(e.target.value) } });
                    }}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="text-xs text-gray-400 text-center">
                    {(safeSelectedElement.filters?.saturation || 0)}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-0.5">Lightness</label>
                <div className="space-y-0.5">
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={(safeSelectedElement.filters?.lightness || 0)}
                    onChange={(e) => {
                      const filters = safeSelectedElement.filters || {};
                      handleUpdate({ filters: { ...filters, lightness: Number(e.target.value) } });
                    }}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="text-xs text-gray-400 text-center">
                    {(safeSelectedElement.filters?.lightness || 0)}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Color Adjustments */}
          {safeSelectedElement.adjustmentType === 'color' && (
            <>
              <div>
                <label className="text-xs text-gray-400 block mb-0.5">Temperature</label>
                <div className="space-y-0.5">
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={(safeSelectedElement.filters?.temperature || 0)}
                    onChange={(e) => {
                      const filters = safeSelectedElement.filters || {};
                      handleUpdate({ filters: { ...filters, temperature: Number(e.target.value) } });
                    }}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="text-xs text-gray-400 text-center">
                    {(safeSelectedElement.filters?.temperature || 0)}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-0.5">Tint</label>
                <div className="space-y-0.5">
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={(safeSelectedElement.filters?.tint || 0)}
                    onChange={(e) => {
                      const filters = safeSelectedElement.filters || {};
                      handleUpdate({ filters: { ...filters, tint: Number(e.target.value) } });
                    }}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="text-xs text-gray-400 text-center">
                    {(safeSelectedElement.filters?.tint || 0)}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-0.5">Vibrance</label>
                <div className="space-y-0.5">
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={(safeSelectedElement.filters?.vibrance || 0)}
                    onChange={(e) => {
                      const filters = safeSelectedElement.filters || {};
                      handleUpdate({ filters: { ...filters, vibrance: Number(e.target.value) } });
                    }}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="text-xs text-gray-400 text-center">
                    {(safeSelectedElement.filters?.vibrance || 0)}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Levels Adjustments */}
          {safeSelectedElement.adjustmentType === 'levels' && (
            <>
              <div>
                <label className="text-xs text-gray-400 block mb-0.5">Black Point</label>
                <div className="space-y-0.5">
                  <input
                    type="range"
                    min="0"
                    max="255"
                    value={(safeSelectedElement.filters?.levelsBlackPoint || 0)}
                    onChange={(e) => {
                      const filters = safeSelectedElement.filters || {};
                      handleUpdate({ filters: { ...filters, levelsBlackPoint: Number(e.target.value) } });
                    }}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="text-xs text-gray-400 text-center">
                    {(safeSelectedElement.filters?.levelsBlackPoint || 0)}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-0.5">Mid Point</label>
                <div className="space-y-0.5">
                  <input
                    type="range"
                    min="0.1"
                    max="9.99"
                    step="0.1"
                    value={(safeSelectedElement.filters?.levelsMidPoint || 1.0)}
                    onChange={(e) => {
                      const filters = safeSelectedElement.filters || {};
                      handleUpdate({ filters: { ...filters, levelsMidPoint: Number(e.target.value) } });
                    }}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="text-xs text-gray-400 text-center">
                    {(safeSelectedElement.filters?.levelsMidPoint || 1.0).toFixed(2)}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-0.5">White Point</label>
                <div className="space-y-0.5">
                  <input
                    type="range"
                    min="0"
                    max="255"
                    value={(safeSelectedElement.filters?.levelsWhitePoint || 255)}
                    onChange={(e) => {
                      const filters = safeSelectedElement.filters || {};
                      handleUpdate({ filters: { ...filters, levelsWhitePoint: Number(e.target.value) } });
                    }}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="text-xs text-gray-400 text-center">
                    {(safeSelectedElement.filters?.levelsWhitePoint || 255)}
                  </div>
                </div>
              </div>
            </>
          )}

          <div>
            <label className="text-xs text-gray-400 block mb-0.5">Blend Mode</label>
            <select
              value={safeSelectedElement.blendMode || 'normal'}
              onChange={(e) => handleUpdate({ blendMode: e.target.value as any })}
              className="w-full px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
            >
              <option value="normal">Normal</option>
              <option value="multiply">Multiply</option>
              <option value="screen">Screen</option>
              <option value="overlay">Overlay</option>
              <option value="darken">Darken</option>
              <option value="lighten">Lighten</option>
              <option value="color-dodge">Color Dodge</option>
              <option value="color-burn">Color Burn</option>
            </select>
          </div>
        </div>
      )}

      {/* SVG-specific properties */}
      {selectedElement.type === 'svg' && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-medium text-gray-300 flex items-center">
            <span className="w-1 h-1 bg-cyan-400 rounded-full mr-1.5"></span>
            SVG Properties
          </h4>

          <div>
            <label className="text-xs text-gray-400 block mb-0.5">SVG Code</label>
            <textarea
              value={safeSelectedElement.svgData || ''}
              onChange={(e) => handleUpdate({ svgData: e.target.value })}
              rows={4}
              className="w-full px-1.5 py-1 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50 font-mono"
              placeholder="<svg>...</svg>"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-0.5">Fill Color Override</label>
            <div className="flex items-center space-x-1.5">
              <input
                type="color"
                value={safeSelectedElement.svgFillColor || '#3B82F6'}
                onChange={(e) => handleUpdate({ svgFillColor: e.target.value })}
                className="w-6 h-6 rounded cursor-pointer border border-gray-600/50"
              />
              <input
                type="text"
                value={safeSelectedElement.svgFillColor || '#3B82F6'}
                onChange={(e) => handleUpdate({ svgFillColor: e.target.value })}
                className="flex-1 px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
                placeholder="#3B82F6"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-0.5">Stroke Color Override</label>
            <div className="flex items-center space-x-1.5">
              <input
                type="color"
                value={safeSelectedElement.svgStrokeColor || '#1E40AF'}
                onChange={(e) => handleUpdate({ svgStrokeColor: e.target.value })}
                className="w-6 h-6 rounded cursor-pointer border border-gray-600/50"
              />
              <input
                type="text"
                value={safeSelectedElement.svgStrokeColor || '#1E40AF'}
                onChange={(e) => handleUpdate({ svgStrokeColor: e.target.value })}
                className="flex-1 px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white focus:outline-none focus:border-yellow-400/50"
                placeholder="#1E40AF"
              />
            </div>
          </div>
        </div>
      )}
    </div>
      )}
    </div>
  );
};

export default ShapePropertiesTab;